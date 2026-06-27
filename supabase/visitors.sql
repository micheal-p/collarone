-- ============================================================================
-- Org-Ops ERP — Visitor Management Suite
-- Roles: staff (member) | receptionist | security | management
-- Run after departments.sql. Idempotent.
-- ============================================================================

-- ---- Role helpers -----------------------------------------------------------

create or replace function public.has_visitors_access()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and suites @> '[{"key":"visitors"}]'::jsonb
    );
$$;

create or replace function public.is_visitor_privileged()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and (
        suites @> '[{"key":"visitors","role":"receptionist"}]'::jsonb
        or suites @> '[{"key":"visitors","role":"security"}]'::jsonb
        or suites @> '[{"key":"visitors","role":"management"}]'::jsonb
      )
    );
$$;

create or replace function public.is_visitor_management()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and suites @> '[{"key":"visitors","role":"management"}]'::jsonb
    );
$$;

grant execute on function public.has_visitors_access()    to authenticated;
grant execute on function public.is_visitor_privileged()  to authenticated;
grant execute on function public.is_visitor_management()  to authenticated;

-- ---- Tables -----------------------------------------------------------------

create table if not exists public.visitors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  company    text not null default '',
  phone      text not null,
  email      text not null default '',
  is_banned  boolean not null default false,
  ban_reason text not null default '',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.visits (
  id                      uuid primary key default gen_random_uuid(),
  visitor_id              uuid not null references public.visitors(id) on delete cascade,
  host_id                 uuid not null references public.profiles(id) on delete cascade,
  department_id           int  references public.departments(id) on delete set null,
  purpose                 text not null,
  notes                   text not null default '',
  expected_at             timestamptz not null,
  access_code             text not null,
  access_code_expires_at  timestamptz not null,
  badge_number            text not null default '',
  access_point            text not null default 'Main Entrance',
  checked_in_at           timestamptz,
  checked_in_by           uuid references public.profiles(id) on delete set null,
  checked_out_at          timestamptz,
  checked_out_by          uuid references public.profiles(id) on delete set null,
  flagged                 boolean not null default false,
  flag_reason             text not null default '',
  status                  text not null default 'expected'
                          check (status in ('expected','checked_in','checked_out','cancelled','no_show')),
  created_by              uuid not null references public.profiles(id) on delete cascade,
  created_at              timestamptz not null default now()
);

-- Active-code uniqueness: only one live use of a code at a time
create unique index if not exists visits_code_active_uniq
  on public.visits (access_code)
  where status in ('expected','checked_in');

-- ---- Row-Level Security -----------------------------------------------------

alter table public.visitors enable row level security;
alter table public.visits   enable row level security;

-- visitors SELECT: any user with visitors suite access
drop policy if exists "visitors_select" on public.visitors;
create policy "visitors_select" on public.visitors for select using (
  public.has_visitors_access()
);

-- visitors INSERT: any user with visitors suite access
drop policy if exists "visitors_insert" on public.visitors;
create policy "visitors_insert" on public.visitors for insert with check (
  public.has_visitors_access() and created_by = auth.uid()
);

-- visitors UPDATE: receptionist or management or super_admin (ban/unban, edit)
drop policy if exists "visitors_update" on public.visitors;
create policy "visitors_update" on public.visitors for update using (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles
    where id = auth.uid() and (
      suites @> '[{"key":"visitors","role":"receptionist"}]'::jsonb
      or suites @> '[{"key":"visitors","role":"management"}]'::jsonb
    )
  )
);

-- visitors DELETE: super_admin only
drop policy if exists "visitors_delete" on public.visitors;
create policy "visitors_delete" on public.visitors for delete using (
  public.is_super_admin()
);

-- visits SELECT: privileged see all; staff see own (host or creator)
drop policy if exists "visits_select" on public.visits;
create policy "visits_select" on public.visits for select using (
  public.is_visitor_privileged()
  or host_id    = auth.uid()
  or created_by = auth.uid()
);

-- visits INSERT: handled via create_visit RPC (security definer)
drop policy if exists "visits_insert" on public.visits;
create policy "visits_insert" on public.visits for insert with check (
  public.has_visitors_access() and created_by = auth.uid()
);

-- visits UPDATE: privileged roles can do all; host/creator can only cancel
drop policy if exists "visits_update" on public.visits;
create policy "visits_update" on public.visits for update using (
  public.is_visitor_privileged()
  or host_id    = auth.uid()
  or created_by = auth.uid()
);

-- visits DELETE: management + super_admin
drop policy if exists "visits_delete" on public.visits;
create policy "visits_delete" on public.visits for delete using (
  public.is_super_admin() or public.is_visitor_management()
);

-- ---- RPCs -------------------------------------------------------------------

-- Create a visit with a unique 6-digit access code (atomic)
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
  code    text;
  tries   int := 0;
  v       public.visits;
begin
  if not public.has_visitors_access() then
    raise exception 'Access denied.';
  end if;

  -- Generate a unique 6-digit code (100000–999999)
  loop
    code := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    exit when not exists (
      select 1 from public.visits
      where access_code = code and status in ('expected','checked_in')
    );
    tries := tries + 1;
    if tries > 100 then raise exception 'Could not generate unique access code.'; end if;
  end loop;

  insert into public.visits (
    visitor_id, host_id, department_id, purpose, notes,
    expected_at, access_code, access_code_expires_at,
    access_point, created_by
  ) values (
    p_visitor_id, p_host_id, p_department_id, p_purpose, coalesce(p_notes,''),
    p_expected_at, code, p_expected_at + interval '1 day',
    coalesce(p_access_point,'Main Entrance'), auth.uid()
  ) returning * into v;

  return v;
end;
$$;

grant execute on function public.create_visit(uuid,uuid,int,text,text,timestamptz,text) to authenticated;

-- Mark expected visits as no-show if 2+ hours past expected_at
create or replace function public.mark_no_shows()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.visits
  set status = 'no_show'
  where status = 'expected' and expected_at < now() - interval '2 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.mark_no_shows() to authenticated;

-- Visitor KPI stats for management dashboard
create or replace function public.get_visitor_stats()
returns table(metric text, value bigint)
language sql security definer stable set search_path = public as $$
  select 'total_today'::text,     count(*)::bigint from public.visits where expected_at::date = current_date
  union all
  select 'checked_in_now',        count(*)::bigint from public.visits where status = 'checked_in'
  union all
  select 'checked_out_today',     count(*)::bigint from public.visits where status = 'checked_out' and checked_out_at::date = current_date
  union all
  select 'no_shows_today',        count(*)::bigint from public.visits where status = 'no_show' and expected_at::date = current_date
  union all
  select 'overstay',              count(*)::bigint from public.visits where status = 'checked_in' and checked_in_at < now() - interval '4 hours';
$$;

grant execute on function public.get_visitor_stats() to authenticated;

-- ---- Seed -------------------------------------------------------------------
do $$
declare
  admin_id uuid;
  vis1_id  uuid;
  vis2_id  uuid;
  vis3_id  uuid;
  dept_id  int;
begin
  select id into admin_id from public.profiles where role = 'super_admin' limit 1;
  select id into dept_id  from public.departments where code = 'HR' limit 1;
  if admin_id is null then return; end if;

  -- Seed 3 visitors
  insert into public.visitors (id, name, company, phone, email, created_by) values
    (gen_random_uuid(), 'Emeka Eze',     'Zenith Bank',      '+2348012345678', 'emeka@zenith.com',  admin_id),
    (gen_random_uuid(), 'Fatima Bello',  'MTN Nigeria',      '+2348023456789', 'fatima@mtn.com',    admin_id),
    (gen_random_uuid(), 'David Okonkwo', 'Federal Ministry', '+2348034567890', 'david.o@gov.ng',    admin_id)
  on conflict do nothing;

  -- Fetch the seeded visitors to use for visits
  select id into vis1_id from public.visitors where phone = '+2348012345678' limit 1;
  select id into vis2_id from public.visitors where phone = '+2348023456789' limit 1;
  select id into vis3_id from public.visitors where phone = '+2348034567890' limit 1;

  if vis1_id is null or vis2_id is null or vis3_id is null then return; end if;

  -- Seed visits (using RLS-bypass insert since we're in a DO block as postgres)
  insert into public.visits (visitor_id, host_id, department_id, purpose, expected_at, access_code, access_code_expires_at, access_point, status, created_by) values
    (vis1_id, admin_id, dept_id, 'HR compliance review meeting', now() + interval '2 hours',  '482916', now() + interval '3 days',  'Main Entrance', 'expected',    admin_id),
    (vis2_id, admin_id, dept_id, 'Partnership discussion',       now() - interval '30 minutes','731045', now() + interval '1 day',   'Reception',     'checked_in',  admin_id),
    (vis3_id, admin_id, dept_id, 'Document delivery',           now() - interval '3 hours',   '295837', now() - interval '2 hours', 'Main Entrance', 'checked_out', admin_id)
  on conflict do nothing;
end;
$$;
