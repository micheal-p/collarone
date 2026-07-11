-- ============================================================================
-- Collarone — Stage 2, suite 2: Leave goes multi-tenant
-- Run AFTER hr_multitenancy.sql. Idempotent.
--
-- leave_types is org-scoped (each org gets its own editable copy of the
-- statutory-floor defaults, same treatment as departments). holidays stays
-- global — a Nigerian public holiday is the same for every company, not
-- company-specific data. leave_balances/leave_requests get org_id like every
-- HR table did. Almost all writes go through SECURITY DEFINER RPCs
-- (submit/decide/cancel), not direct client inserts, so the real work here is
-- making those RPCs org-aware, not patching client code.
--
-- Real gap found and fixed: decide_leave_request() had NO org check at all —
-- any org's leave approver could approve/reject ANY pending request
-- system-wide, including another company's, because is_leave_approver() only
-- checks the caller's own role, never which request they're deciding.
-- ============================================================================

-- ---- leave_types: org-scoped, seeded per org like departments ---------------
alter table public.leave_types add column if not exists org_id uuid references public.organizations(id);
update public.leave_types set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.leave_types alter column org_id set not null;

alter table public.leave_types drop constraint if exists leave_types_key_key;
alter table public.leave_types add constraint leave_types_org_key_key unique (org_id, key);

insert into public.leave_types (org_id, key, name, color, paid, tracked, default_days, gender, requires_doc_after, carryover_cap, sort)
select o.id, t.key, t.name, t.color, t.paid, t.tracked, t.default_days, t.gender, t.requires_doc_after, t.carryover_cap, t.sort
from public.organizations o
cross join public.leave_types t
where t.org_id = '00000000-0000-0000-0000-000000000001'
  and o.id <> '00000000-0000-0000-0000-000000000001'
on conflict (org_id, key) do nothing;

drop policy if exists lt_read on public.leave_types;
create policy lt_read on public.leave_types for select to authenticated using (public.same_org(org_id));
drop policy if exists lt_write on public.leave_types;
create policy lt_write on public.leave_types for all
  using (public.is_super_admin() and public.same_org(org_id))
  with check (public.is_super_admin() and public.same_org(org_id));

-- ---- leave_balances / leave_requests: org_id + backfill ----------------------
alter table public.leave_balances add column if not exists org_id uuid references public.organizations(id);
update public.leave_balances b set org_id = p.org_id from public.profiles p where p.id = b.user_id and b.org_id is null;
update public.leave_balances set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.leave_balances alter column org_id set not null;

alter table public.leave_requests add column if not exists org_id uuid references public.organizations(id);
update public.leave_requests r set org_id = p.org_id from public.profiles p where p.id = r.user_id and r.org_id is null;
update public.leave_requests set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.leave_requests alter column org_id set not null;

drop policy if exists bal_read on public.leave_balances;
create policy bal_read on public.leave_balances for select using (
  public.same_org(org_id) and (user_id = auth.uid() or public.is_leave_approver())
);
drop policy if exists bal_write on public.leave_balances;
create policy bal_write on public.leave_balances for all
  using (public.same_org(org_id) and public.is_leave_approver())
  with check (public.same_org(org_id) and public.is_leave_approver());

drop policy if exists req_read on public.leave_requests;
create policy req_read on public.leave_requests for select using (
  public.same_org(org_id) and (user_id = auth.uid() or public.is_leave_approver())
);

-- Real gap found and fixed: leave_available() is SECURITY DEFINER (bypasses
-- RLS) and was callable directly by any authenticated user with ARBITRARY
-- _user/_type params — a user from one org could probe another org's leave
-- balances by passing their user/type ids straight to the RPC. Added a guard:
-- only the user themselves, or an approver within that user's own org, may
-- call it for a given _user.
create or replace function public.leave_available(_user uuid, _type uuid, _year int)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare target_org uuid;
begin
  if auth.uid() <> _user then
    if not public.is_leave_approver() then raise exception 'Not authorised to view this balance'; end if;
    select org_id into target_org from public.profiles where id = _user;
    if target_org is null or target_org <> public.my_org_id() then
      raise exception 'Not authorised to view this balance';
    end if;
  end if;

  return
    coalesce((select b.entitled from public.leave_balances b where b.user_id=_user and b.leave_type_id=_type and b.year=_year),
             (select t.default_days from public.leave_types t where t.id=_type))
    + coalesce((select b.carried_over + b.adjustment from public.leave_balances b where b.user_id=_user and b.leave_type_id=_type and b.year=_year), 0)
    - coalesce((select sum(r.working_days) from public.leave_requests r
                where r.user_id=_user and r.leave_type_id=_type and r.status in ('pending','approved')
                  and extract(year from r.start_date)=_year), 0);
end;
$$;

-- ---- RPCs made org-aware -------------------------------------------------

-- Validates the leave type belongs to the caller's own org before using it,
-- and stamps org_id on the new request explicitly (no default to derive it from).
create or replace function public.submit_leave_request(_type uuid, _start date, _end date, _half boolean, _reason text)
returns public.leave_requests language plpgsql security definer set search_path = public as $$
declare wd numeric; t public.leave_types; avail numeric; row public.leave_requests; caller_org uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  caller_org := public.my_org_id();

  select * into t from public.leave_types where id = _type and active and org_id = caller_org;
  if not found then raise exception 'Unknown leave type'; end if;
  if _half and _start <> _end then raise exception 'Half-day applies to a single day only'; end if;

  wd := public.leave_working_days(_start, _end, _half);
  if wd <= 0 then raise exception 'Selected dates contain no working days'; end if;

  if t.tracked then
    avail := public.leave_available(auth.uid(), _type, extract(year from _start)::int);
    if wd > avail then raise exception 'Insufficient balance: % day(s) requested, % available', wd, avail; end if;
  end if;

  insert into public.leave_requests (user_id, leave_type_id, start_date, end_date, half_day, working_days, reason, org_id)
  values (auth.uid(), _type, _start, _end, _half, wd, coalesce(_reason,''), caller_org)
  returning * into row;
  return row;
end;
$$;

-- The real fix: only decide a request that belongs to the caller's own org.
create or replace function public.decide_leave_request(_id uuid, _decision text, _comment text)
returns public.leave_requests language plpgsql security definer set search_path = public as $$
declare row public.leave_requests;
begin
  if not public.is_leave_approver() then raise exception 'Not authorised to approve leave'; end if;
  if _decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  update public.leave_requests
     set status=_decision, decided_by=auth.uid(), decided_at=now(), decision_comment=coalesce(_comment,'')
   where id=_id and status='pending' and org_id = public.my_org_id()
   returning * into row;
  if not found then raise exception 'Request not found or already decided'; end if;
  return row;
end;
$$;

-- ---- Phase 2 whitelist: leave joins hr as safe for non-founding orgs --------
create or replace function public.enforce_phase1_suite_scope() returns trigger
language plpgsql as $$
declare
  safe_suites text[] := array['hr', 'leave'];
begin
  if new.org_id <> '00000000-0000-0000-0000-000000000001' then
    select coalesce(jsonb_agg(g), '[]'::jsonb) into new.suites
    from jsonb_array_elements(new.suites) g
    where g->>'key' = any(safe_suites);
  end if;
  return new;
end;
$$;
