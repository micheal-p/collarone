-- ============================================================================
-- Collarone — Procurement suite (Stage 6 catalog item, built early)
-- Run after itassets.sql. Idempotent. Native multi-tenant from day one.
--
-- VAT-aware per the Nigeria angle: standard rate is 7.5% (Finance Act 2020),
-- stored per-request (not hardcoded) so a future exempt category or rate
-- change doesn't need a code deploy — same "swappable rate" principle as
-- payroll's PAYE bands/deduction rates.
-- ============================================================================

create or replace function public.has_procurement_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"procurement"}]'::jsonb);
$$;
grant execute on function public.has_procurement_suite() to authenticated;

create or replace function public.is_procurement_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"procurement","role":"manager"}]'::jsonb);
$$;
grant execute on function public.is_procurement_manager() to authenticated;

create table if not exists public.vendors (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id),
  name         text not null,
  contact_name text not null default '',
  phone        text not null default '',
  email        text not null default '',
  address      text not null default '',
  notes        text not null default '',
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

alter table public.vendors enable row level security;

drop policy if exists "vendors_select" on public.vendors;
create policy "vendors_select" on public.vendors for select using (
  public.same_org(org_id) and public.has_procurement_suite()
);
drop policy if exists "vendors_write" on public.vendors;
create policy "vendors_write" on public.vendors for all using (
  public.same_org(org_id) and public.is_procurement_manager()
) with check (
  public.same_org(org_id) and public.is_procurement_manager()
);

create table if not exists public.purchase_requests (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id),
  requested_by     uuid not null references public.profiles(id),
  department_id    int references public.departments(id) on delete set null,
  vendor_id        uuid references public.vendors(id) on delete set null,
  item_description text not null,
  quantity         numeric not null default 1,
  unit_cost        numeric not null default 0,
  vat_rate         numeric not null default 0.075,
  total_cost       numeric generated always as (quantity * unit_cost * (1 + vat_rate)) stored,
  status           text not null default 'pending' check (status in ('pending','approved','rejected','ordered','received')),
  approved_by      uuid references public.profiles(id),
  approved_at      timestamptz,
  notes            text not null default '',
  created_at       timestamptz not null default now()
);

alter table public.purchase_requests enable row level security;

drop policy if exists "purchase_requests_select" on public.purchase_requests;
create policy "purchase_requests_select" on public.purchase_requests for select using (
  public.same_org(org_id) and (public.is_procurement_manager() or requested_by = auth.uid())
);
drop policy if exists "purchase_requests_insert" on public.purchase_requests;
create policy "purchase_requests_insert" on public.purchase_requests for insert with check (
  public.same_org(org_id) and public.has_procurement_suite() and requested_by = auth.uid()
);
drop policy if exists "purchase_requests_update" on public.purchase_requests;
create policy "purchase_requests_update" on public.purchase_requests for update using (
  public.same_org(org_id) and (
    public.is_procurement_manager()
    or (requested_by = auth.uid() and status = 'pending')
  )
);
drop policy if exists "purchase_requests_delete" on public.purchase_requests;
create policy "purchase_requests_delete" on public.purchase_requests for delete using (
  public.same_org(org_id) and (public.is_procurement_manager() or (requested_by = auth.uid() and status = 'pending'))
);

-- Same class of gap already fixed twice before (decide_leave_request,
-- create_visit): a SECURITY DEFINER decision RPC must check the row belongs
-- to the caller's own org, not just that the caller holds the role in general.
create or replace function public.decide_purchase_request(_id uuid, _decision text)
returns public.purchase_requests language plpgsql security definer set search_path = public as $$
declare row public.purchase_requests;
begin
  if not public.is_procurement_manager() then raise exception 'Not authorised to decide purchase requests'; end if;
  if _decision not in ('approved','rejected','ordered','received') then raise exception 'Invalid decision'; end if;
  update public.purchase_requests
     set status = _decision,
         approved_by = case when _decision = 'approved' then auth.uid() else approved_by end,
         approved_at = case when _decision = 'approved' then now() else approved_at end
   where id = _id and org_id = public.my_org_id()
   returning * into row;
  if not found then raise exception 'Purchase request not found'; end if;
  return row;
end;
$$;
grant execute on function public.decide_purchase_request(uuid, text) to authenticated;

-- ---- Phase 2 whitelist --------------------------------------------------------
create or replace function public.enforce_phase1_suite_scope() returns trigger
language plpgsql as $$
declare
  safe_suites text[] := array['hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm', 'attendance', 'benefits', 'it-assets', 'procurement'];
begin
  if new.org_id <> '00000000-0000-0000-0000-000000000001' then
    select coalesce(jsonb_agg(g), '[]'::jsonb) into new.suites
    from jsonb_array_elements(new.suites) g
    where g->>'key' = any(safe_suites);
  end if;
  return new;
end;
$$;
