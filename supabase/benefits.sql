-- ============================================================================
-- Collarone — Benefits suite (Stage 6 catalog item, built early)
-- Run after attendance.sql. Idempotent. Native multi-tenant from day one.
--
-- Nigeria angle: group life insurance is a Pension Reform Act 2014 legal
-- requirement at 5+ staff, not a perk — the UI labels it as such but this
-- v0 doesn't enforce/warn based on headcount yet. PFA tracking is a plain
-- text field (pfa_name/pfa_pin) rather than a hardcoded list of Nigerian
-- PFA administrators, so it doesn't go stale as PenCom licenses change.
-- ============================================================================

create or replace function public.has_benefits_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"benefits"}]'::jsonb);
$$;
grant execute on function public.has_benefits_suite() to authenticated;

create or replace function public.is_benefits_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"benefits","role":"manager"}]'::jsonb);
$$;
grant execute on function public.is_benefits_manager() to authenticated;

create table if not exists public.benefit_plans (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id),
  name       text not null,
  type       text not null default 'hmo' check (type in ('hmo','group_life','pension','other')),
  provider   text not null default '',
  notes      text not null default '',
  active     boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.benefit_plans enable row level security;

drop policy if exists "benefit_plans_select" on public.benefit_plans;
create policy "benefit_plans_select" on public.benefit_plans for select using (
  public.same_org(org_id) and public.has_benefits_suite()
);
drop policy if exists "benefit_plans_write" on public.benefit_plans;
create policy "benefit_plans_write" on public.benefit_plans for all using (
  public.same_org(org_id) and public.is_benefits_manager()
) with check (
  public.same_org(org_id) and public.is_benefits_manager()
);

create table if not exists public.employee_benefits (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id),
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  plan_id         uuid not null references public.benefit_plans(id) on delete cascade,
  enrollment_date date not null default current_date,
  member_id       text not null default '',  -- HMO membership no. / policy no.
  pfa_name        text not null default '',  -- Pension Fund Administrator (pension plans only)
  pfa_pin         text not null default '',  -- RSA PIN
  status          text not null default 'active' check (status in ('active','inactive')),
  notes           text not null default '',
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now(),
  unique (employee_id, plan_id)
);

alter table public.employee_benefits enable row level security;

drop policy if exists "employee_benefits_select" on public.employee_benefits;
create policy "employee_benefits_select" on public.employee_benefits for select using (
  public.same_org(org_id) and (public.is_benefits_manager() or employee_id = auth.uid())
);
drop policy if exists "employee_benefits_write" on public.employee_benefits;
create policy "employee_benefits_write" on public.employee_benefits for all using (
  public.same_org(org_id) and public.is_benefits_manager()
) with check (
  public.same_org(org_id) and public.is_benefits_manager()
);

-- ---- Phase 2 whitelist --------------------------------------------------------
create or replace function public.enforce_phase1_suite_scope() returns trigger
language plpgsql as $$
declare
  safe_suites text[] := array['hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm', 'attendance', 'benefits'];
begin
  if new.org_id <> '00000000-0000-0000-0000-000000000001' then
    select coalesce(jsonb_agg(g), '[]'::jsonb) into new.suites
    from jsonb_array_elements(new.suites) g
    where g->>'key' = any(safe_suites);
  end if;
  return new;
end;
$$;
