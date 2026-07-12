-- ============================================================================
-- Collarone — Stage 2, suite 5 (final): Payroll goes multi-tenant
-- Run AFTER visitors_multitenancy.sql. Idempotent.
--
-- The most sensitive suite in the catalog — salary data, bank details, tax
-- deductions. Same org_id + same_org() treatment as every other suite, plus
-- two payroll-specific decisions:
--
--   1. paye_bands / deduction_rates were GLOBAL shared config, readable by
--      any authenticated user in ANY org, and editable by any org's payroll
--      manager for every other org too — a live cross-tenant write hole, not
--      just a read leak. Given org_id like leave_types/departments: each org
--      gets its own editable copy, seeded from the founding org's defaults
--      (Nigerian statutory rates are the same starting point for everyone,
--      but the whole point of the "swappable rule pack" design was per-org
--      editability, which requires per-org rows).
--   2. generate_payroll_run() looped over EVERY active profile system-wide,
--      not just the caller's own org — one org's payroll manager running
--      payroll would have generated payslips for every other org's staff
--      too. Fixed to scope the employee loop, and to read rates/bands from
--      the caller's own org.
--
-- profiles_select is touched a THIRD time here (organizations.sql set it,
-- hr_multitenancy.sql restored+org-scoped the has_hr_suite() broadening) —
-- payroll.sql's own has_payroll_suite() broadening from before Stage 2 began
-- was already silently dropped by hr_multitenancy.sql's replace, the exact
-- regression class flagged as a lesson last time. Restored here, org-scoped.
-- ============================================================================

-- ---- bank_accounts / salary_structures ---------------------------------------
alter table public.bank_accounts add column if not exists org_id uuid references public.organizations(id);
update public.bank_accounts b set org_id = p.org_id from public.profiles p where p.id = b.employee_id and b.org_id is null;
update public.bank_accounts set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.bank_accounts alter column org_id set not null;

alter table public.salary_structures add column if not exists org_id uuid references public.organizations(id);
update public.salary_structures s set org_id = p.org_id from public.profiles p where p.id = s.employee_id and s.org_id is null;
update public.salary_structures set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.salary_structures alter column org_id set not null;

drop policy if exists "bank_accounts_select" on public.bank_accounts;
create policy "bank_accounts_select" on public.bank_accounts for select using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_payroll_manager() or employee_id = auth.uid())
);
drop policy if exists "bank_accounts_write" on public.bank_accounts;
create policy "bank_accounts_write" on public.bank_accounts for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_payroll_manager())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_payroll_manager())
);

drop policy if exists "salary_structures_select" on public.salary_structures;
create policy "salary_structures_select" on public.salary_structures for select using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_payroll_manager() or employee_id = auth.uid())
);
drop policy if exists "salary_structures_write" on public.salary_structures;
create policy "salary_structures_write" on public.salary_structures for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_payroll_manager())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_payroll_manager())
);

-- ---- paye_bands: org-scoped, seeded per org like leave_types -----------------
alter table public.paye_bands add column if not exists org_id uuid references public.organizations(id);
update public.paye_bands set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.paye_bands alter column org_id set not null;

alter table public.paye_bands drop constraint if exists paye_bands_sort_order_key;
alter table public.paye_bands add constraint paye_bands_org_sort_order_key unique (org_id, sort_order);

insert into public.paye_bands (org_id, min_annual, max_annual, rate, sort_order)
select o.id, b.min_annual, b.max_annual, b.rate, b.sort_order
from public.organizations o
cross join public.paye_bands b
where b.org_id = '00000000-0000-0000-0000-000000000001'
  and o.id <> '00000000-0000-0000-0000-000000000001'
on conflict (org_id, sort_order) do nothing;

drop policy if exists "paye_bands_select" on public.paye_bands;
create policy "paye_bands_select" on public.paye_bands for select using (
  auth.role() = 'authenticated' and public.same_org(org_id)
);
drop policy if exists "paye_bands_write" on public.paye_bands;
create policy "paye_bands_write" on public.paye_bands for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_payroll_manager())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_payroll_manager())
);

-- compute_paye_annual now takes the caller's own org's bands, not a global table.
create or replace function public.compute_paye_annual(p_taxable_annual numeric, p_org_id uuid default null)
returns numeric language plpgsql stable set search_path = public as $$
declare
  band record;
  remaining numeric := greatest(0, p_taxable_annual);
  tax numeric := 0;
  band_width numeric;
  taxed_in_band numeric;
  target_org uuid := coalesce(p_org_id, public.my_org_id());
begin
  for band in select * from public.paye_bands where org_id = target_org order by sort_order loop
    exit when remaining <= 0;
    band_width := coalesce(band.max_annual, remaining + band.min_annual) - band.min_annual;
    taxed_in_band := least(remaining, band_width);
    tax := tax + taxed_in_band * band.rate;
    remaining := remaining - taxed_in_band;
  end loop;
  return round(tax, 2);
end;
$$;
grant execute on function public.compute_paye_annual(numeric, uuid) to authenticated;

-- ---- deduction_rates: org-scoped, seeded per org -----------------------------
alter table public.deduction_rates drop constraint if exists deduction_rates_pkey;
alter table public.deduction_rates add column if not exists org_id uuid references public.organizations(id);
update public.deduction_rates set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.deduction_rates alter column org_id set not null;
alter table public.deduction_rates add column if not exists id uuid default gen_random_uuid();
update public.deduction_rates set id = gen_random_uuid() where id is null;
alter table public.deduction_rates alter column id set not null;
alter table public.deduction_rates add primary key (id);
alter table public.deduction_rates add constraint deduction_rates_org_key_key unique (org_id, key);

insert into public.deduction_rates (org_id, key, label, rate, basis)
select o.id, d.key, d.label, d.rate, d.basis
from public.organizations o
cross join public.deduction_rates d
where d.org_id = '00000000-0000-0000-0000-000000000001'
  and o.id <> '00000000-0000-0000-0000-000000000001'
on conflict (org_id, key) do nothing;

drop policy if exists "deduction_rates_select" on public.deduction_rates;
create policy "deduction_rates_select" on public.deduction_rates for select using (
  auth.role() = 'authenticated' and public.same_org(org_id)
);
drop policy if exists "deduction_rates_write" on public.deduction_rates;
create policy "deduction_rates_write" on public.deduction_rates for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_payroll_manager())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_payroll_manager())
);

-- ---- payroll_runs / payroll_lines --------------------------------------------
alter table public.payroll_runs add column if not exists org_id uuid references public.organizations(id);
update public.payroll_runs set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.payroll_runs alter column org_id set not null;

alter table public.payroll_runs drop constraint if exists payroll_runs_period_month_period_year_key;
alter table public.payroll_runs add constraint payroll_runs_org_period_key unique (org_id, period_month, period_year);

alter table public.payroll_lines add column if not exists org_id uuid references public.organizations(id);
update public.payroll_lines l set org_id = r.org_id from public.payroll_runs r where r.id = l.run_id and l.org_id is null;
update public.payroll_lines set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.payroll_lines alter column org_id set not null;

drop policy if exists "payroll_runs_select" on public.payroll_runs;
create policy "payroll_runs_select" on public.payroll_runs for select using (
  public.same_org(org_id) and (
    public.is_super_admin() or public.is_payroll_manager()
    or (released_at is not null and public.has_released_payslip(id))
  )
);
drop policy if exists "payroll_runs_write" on public.payroll_runs;
create policy "payroll_runs_write" on public.payroll_runs for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_payroll_manager())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_payroll_manager())
);

drop policy if exists "payroll_lines_select" on public.payroll_lines;
create policy "payroll_lines_select" on public.payroll_lines for select using (
  public.same_org(org_id) and (
    public.is_super_admin() or public.is_payroll_manager()
    or (
      employee_id = auth.uid()
      and exists (select 1 from public.payroll_runs r where r.id = run_id and r.released_at is not null)
    )
  )
);
drop policy if exists "payroll_lines_write" on public.payroll_lines;
create policy "payroll_lines_write" on public.payroll_lines for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_payroll_manager())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_payroll_manager())
);

-- has_released_payslip already scopes to auth.uid() via payroll_lines' own
-- employee_id filter; org check is redundant there but harmless — left as-is.

-- ---- generate_payroll_run: org-scoped employee loop + org-scoped rates ------
-- Real gap: this looped over EVERY active profile system-wide, and read the
-- (until now) single global rate/band tables. Scoped both to the caller's org.
create or replace function public.generate_payroll_run(p_month int, p_year int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_run_id uuid;
  caller_org uuid;
  emp record;
  ss record;
  ba record;
  pensionable numeric;
  gross numeric;
  pension_emp numeric;
  pension_er numeric;
  nhf_amt numeric;
  nsitf_amt numeric;
  cra numeric;
  taxable_annual numeric;
  paye_amt numeric;
  period_end date;
  r_pension_emp numeric;
  r_pension_er  numeric;
  r_nhf         numeric;
  r_nsitf       numeric;
begin
  if not (public.is_payroll_manager() or public.is_super_admin()) then
    raise exception 'Not authorised to run payroll';
  end if;
  caller_org := public.my_org_id();

  select rate into r_pension_emp from public.deduction_rates where org_id = caller_org and key = 'pension_employee';
  select rate into r_pension_er  from public.deduction_rates where org_id = caller_org and key = 'pension_employer';
  select rate into r_nhf         from public.deduction_rates where org_id = caller_org and key = 'nhf';
  select rate into r_nsitf       from public.deduction_rates where org_id = caller_org and key = 'nsitf';
  r_pension_emp := coalesce(r_pension_emp, 0.08);
  r_pension_er  := coalesce(r_pension_er, 0.10);
  r_nhf         := coalesce(r_nhf, 0.025);
  r_nsitf       := coalesce(r_nsitf, 0.01);

  insert into public.payroll_runs (org_id, period_month, period_year, created_by)
  values (caller_org, p_month, p_year, auth.uid())
  returning id into v_run_id;

  period_end := make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day';

  -- Scoped to the caller's own org. super_admin is a system account, not a
  -- staff member — never on payroll.
  for emp in select * from public.profiles where status = 'active' and role <> 'super_admin' and org_id = caller_org loop
    select * into ss from public.salary_structures
      where employee_id = emp.id and effective_date <= period_end
      order by effective_date desc, created_at desc limit 1;
    if ss.id is null then continue; end if; -- no salary on file yet — skip, don't guess

    select * into ba from public.bank_accounts
      where employee_id = emp.id order by is_primary desc, created_at desc limit 1;

    pensionable := ss.basic + ss.housing + ss.transport;
    gross       := pensionable + ss.other_allowances;
    pension_emp := round(pensionable * r_pension_emp, 2);
    pension_er  := round(pensionable * r_pension_er, 2);
    nhf_amt     := round(ss.basic * r_nhf, 2);
    nsitf_amt   := round(gross * r_nsitf, 2);

    cra := greatest(200000, gross * 12 * 0.01) + gross * 12 * 0.20;
    taxable_annual := greatest(0, gross * 12 - cra - pension_emp * 12 - nhf_amt * 12);
    paye_amt := round(public.compute_paye_annual(taxable_annual, caller_org) / 12, 2);

    insert into public.payroll_lines (
      org_id, run_id, employee_id, basic, housing, transport, other_allowances, gross,
      pension_employee, pension_employer, nhf, nsitf, paye, net,
      state_of_residence, bank_snapshot
    ) values (
      caller_org, v_run_id, emp.id, ss.basic, ss.housing, ss.transport, ss.other_allowances, gross,
      pension_emp, pension_er, nhf_amt, nsitf_amt, paye_amt,
      gross - pension_emp - nhf_amt - paye_amt,
      coalesce(emp.state_of_residence, ''),
      case when ba.id is not null
        then jsonb_build_object('bankName', ba.bank_name, 'bankCode', ba.bank_code, 'accountNumber', ba.account_number, 'accountName', ba.account_name)
        else '{}'::jsonb end
    )
    on conflict (run_id, employee_id) do nothing;
  end loop;

  return v_run_id;
end;
$$;
grant execute on function public.generate_payroll_run(int, int) to authenticated;

-- ---- payroll_set_state: add an org check on the arbitrary employee_id param --
-- Same class of gap as leave_available() — a SECURITY DEFINER RPC taking an
-- arbitrary target id must check that target belongs to the caller's own org.
create or replace function public.payroll_set_state(p_employee_id uuid, p_state text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare result public.profiles; target_org uuid;
begin
  if not (public.is_payroll_manager() or public.is_super_admin()) then
    raise exception 'Not authorised to edit payroll records';
  end if;
  select org_id into target_org from public.profiles where id = p_employee_id;
  if target_org is null or target_org <> public.my_org_id() then
    raise exception 'Employee not found';
  end if;
  update public.profiles set state_of_residence = nullif(trim(p_state), '')
  where id = p_employee_id returning * into result;
  return result;
end;
$$;
grant execute on function public.payroll_set_state(uuid, text) to authenticated;

-- ---- profiles_select: restore has_payroll_suite() broadening, org-scoped ----
-- Third replace of this policy this stage — see hr_multitenancy.sql/
-- leave_multitenancy.sql for the first two. Carries forward is_super_admin +
-- has_hr_suite from hr_multitenancy.sql and adds has_payroll_suite back.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (
    id = auth.uid()
    or (public.is_super_admin() and public.same_org(org_id))
    or (public.has_hr_suite() and public.same_org(org_id))
    or (public.has_payroll_suite() and public.same_org(org_id))
    or public.is_platform_admin()
  );

-- ---- Phase 2 whitelist: payroll joins the rest — the LAST suite in the ------
-- founding-scope guardrail. Every operational suite has now been through the
-- Stage 2 pass; the enforce_phase1_suite_scope trigger's whitelist is now the
-- full catalog it started blocking, but it stays in place (harmless no-op
-- for a fully-whitelisted suite set, and the mechanism itself is cheap to
-- leave wired for whatever suite ships next that ISN'T multi-tenant-safe yet).
create or replace function public.enforce_phase1_suite_scope() returns trigger
language plpgsql as $$
declare
  safe_suites text[] := array['hr', 'leave', 'tasks', 'visitors', 'payroll'];
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
-- (no default — see supabaseApi.js changes: POST /payroll/salary and
-- POST /payroll/bank now stamp org_id from myOrgId(); the rates/bands GET+PATCH
-- routes now filter/stamp by org too.)
