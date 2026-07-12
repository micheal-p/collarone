-- ============================================================================
-- Collarone — Stage 2, suite 4: Visitors goes multi-tenant
-- Run AFTER tasks_multitenancy.sql. Idempotent.
--
-- org_id added to visitors/visits, backfilled from created_by's own org_id.
-- Every policy re-scoped with same_org(). Two real cross-tenant gaps found
-- and fixed, same class as the leave_available()/decide_leave_request() bugs
-- from Stage 2 suite 2 — every SECURITY DEFINER RPC that touches these tables
-- had zero org awareness (they bypass RLS by design, so this was never free):
--   1. create_visit() didn't stamp org_id at all.
--   2. mark_no_shows() and get_visitor_stats() operated over EVERY org's
--      visits — any user with visitors access in any org could silently
--      flip every other org's overdue visits to no_show, and see every
--      other org's front-desk KPIs.
-- The 6-digit access-code uniqueness constraint is also re-scoped per org:
-- it was previously a single global pool, which needlessly shrinks capacity
-- as more tenants join and isn't required for security (a code is only ever
-- looked up within create_visit's own org-scoped RPC now).
-- ============================================================================

alter table public.visitors add column if not exists org_id uuid references public.organizations(id);
update public.visitors v set org_id = p.org_id from public.profiles p where p.id = v.created_by and v.org_id is null;
update public.visitors set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.visitors alter column org_id set not null;

alter table public.visits add column if not exists org_id uuid references public.organizations(id);
update public.visits v set org_id = p.org_id from public.profiles p where p.id = v.created_by and v.org_id is null;
update public.visits set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.visits alter column org_id set not null;

-- Re-scope the active-code uniqueness constraint per org.
drop index if exists visits_code_active_uniq;
create unique index visits_code_active_uniq
  on public.visits (org_id, access_code)
  where status in ('expected','checked_in');

-- ---- visitors ---------------------------------------------------------------
drop policy if exists "visitors_select" on public.visitors;
create policy "visitors_select" on public.visitors for select using (
  public.same_org(org_id) and public.has_visitors_access()
);

drop policy if exists "visitors_insert" on public.visitors;
create policy "visitors_insert" on public.visitors for insert with check (
  public.same_org(org_id) and public.has_visitors_access() and created_by = auth.uid()
);

drop policy if exists "visitors_update" on public.visitors;
create policy "visitors_update" on public.visitors for update using (
  public.same_org(org_id) and (
    public.is_super_admin()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and (
        suites @> '[{"key":"visitors","role":"receptionist"}]'::jsonb
        or suites @> '[{"key":"visitors","role":"management"}]'::jsonb
      )
    )
  )
);

drop policy if exists "visitors_delete" on public.visitors;
create policy "visitors_delete" on public.visitors for delete using (
  public.same_org(org_id) and public.is_super_admin()
);

-- ---- visits -------------------------------------------------------------------
drop policy if exists "visits_select" on public.visits;
create policy "visits_select" on public.visits for select using (
  public.same_org(org_id) and (
    public.is_visitor_privileged() or host_id = auth.uid() or created_by = auth.uid()
  )
);

drop policy if exists "visits_insert" on public.visits;
create policy "visits_insert" on public.visits for insert with check (
  public.same_org(org_id) and public.has_visitors_access() and created_by = auth.uid()
);

drop policy if exists "visits_update" on public.visits;
create policy "visits_update" on public.visits for update using (
  public.same_org(org_id) and (
    public.is_visitor_privileged() or host_id = auth.uid() or created_by = auth.uid()
  )
);

drop policy if exists "visits_delete" on public.visits;
create policy "visits_delete" on public.visits for delete using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_visitor_management())
);

-- ---- RPCs made org-aware -------------------------------------------------
-- Real gap #1: create_visit() never stamped org_id — fixed by deriving it
-- from the caller (same pattern as submit_leave_request's caller_org).
create or replace function public.create_visit(
  p_visitor_id   uuid,
  p_host_id      uuid,
  p_department_id int,
  p_purpose      text,
  p_notes        text,
  p_expected_at  timestamptz,
  p_access_point text
)
returns public.visits language plpgsql security definer set search_path = public as $$
declare
  code       text;
  tries      int := 0;
  v          public.visits;
  caller_org uuid;
begin
  if not public.has_visitors_access() then
    raise exception 'Access denied.';
  end if;
  caller_org := public.my_org_id();

  -- Generate a unique 6-digit code within the caller's own org (100000–999999)
  loop
    code := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    exit when not exists (
      select 1 from public.visits
      where org_id = caller_org and access_code = code and status in ('expected','checked_in')
    );
    tries := tries + 1;
    if tries > 100 then raise exception 'Could not generate unique access code.'; end if;
  end loop;

  insert into public.visits (
    org_id, visitor_id, host_id, department_id, purpose, notes,
    expected_at, access_code, access_code_expires_at,
    access_point, created_by
  ) values (
    caller_org, p_visitor_id, p_host_id, p_department_id, p_purpose, coalesce(p_notes,''),
    p_expected_at, code, p_expected_at + interval '1 day',
    coalesce(p_access_point,'Main Entrance'), auth.uid()
  ) returning * into v;

  return v;
end;
$$;

-- Real gap #2: mark_no_shows() touched every org's rows — scoped to caller's org.
create or replace function public.mark_no_shows()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.visits
  set status = 'no_show'
  where org_id = public.my_org_id()
    and status = 'expected' and expected_at < now() - interval '2 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Real gap #2 continued: get_visitor_stats() returned every org's KPIs.
create or replace function public.get_visitor_stats()
returns table(metric text, value bigint)
language sql security definer stable set search_path = public as $$
  select 'total_today'::text,     count(*)::bigint from public.visits where org_id = public.my_org_id() and expected_at::date = current_date
  union all
  select 'checked_in_now',        count(*)::bigint from public.visits where org_id = public.my_org_id() and status = 'checked_in'
  union all
  select 'checked_out_today',     count(*)::bigint from public.visits where org_id = public.my_org_id() and status = 'checked_out' and checked_out_at::date = current_date
  union all
  select 'no_shows_today',        count(*)::bigint from public.visits where org_id = public.my_org_id() and status = 'no_show' and expected_at::date = current_date
  union all
  select 'overstay',              count(*)::bigint from public.visits where org_id = public.my_org_id() and status = 'checked_in' and checked_in_at < now() - interval '4 hours';
$$;

-- ---- Phase 2 whitelist: visitors joins hr + leave + tasks as safe ------------
create or replace function public.enforce_phase1_suite_scope() returns trigger
language plpgsql as $$
declare
  safe_suites text[] := array['hr', 'leave', 'tasks', 'visitors'];
begin
  if new.org_id <> '00000000-0000-0000-0000-000000000001' then
    select coalesce(jsonb_agg(g), '[]'::jsonb) into new.suites
    from jsonb_array_elements(new.suites) g
    where g->>'key' = any(safe_suites);
  end if;
  return new;
end;
$$;

-- ---- application inserts need org_id set explicitly -------------------------
-- (no default — see supabaseApi.js changes: POST /visitors and the inline
-- visitor-create inside POST /visits now stamp org_id from myOrgId().)
