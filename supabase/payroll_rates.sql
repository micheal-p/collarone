-- ============================================================================
-- Org-Ops ERP — Payroll: configurable deduction rates
-- Pension/NHF/NSITF were hardcoded percentages inside generate_payroll_run().
-- Same problem PAYE bands already solved: rates change, and a payroll admin
-- shouldn't need a code deploy to fix one. Move them into a plain table,
-- editable from the Payroll suite by is_payroll_manager().
-- Run after payroll.sql. Idempotent — safe to re-run.
-- ============================================================================

create table if not exists public.deduction_rates (
  key        text primary key,
  label      text not null,
  rate       numeric not null,   -- e.g. 0.08 = 8%
  basis      text not null check (basis in ('pensionable','basic','gross')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.deduction_rates enable row level security;

drop policy if exists "deduction_rates_select" on public.deduction_rates;
create policy "deduction_rates_select" on public.deduction_rates for select using (auth.role() = 'authenticated');
drop policy if exists "deduction_rates_write" on public.deduction_rates;
create policy "deduction_rates_write" on public.deduction_rates for all using (
  public.is_super_admin() or public.is_payroll_manager()
) with check (
  public.is_super_admin() or public.is_payroll_manager()
);

insert into public.deduction_rates (key, label, rate, basis) values
  ('pension_employee', 'Pension — employee share', 0.08,  'pensionable'),
  ('pension_employer', 'Pension — employer share', 0.10,  'pensionable'),
  ('nhf',              'National Housing Fund',    0.025, 'basic'),
  ('nsitf',            'NSITF (employer cost)',     0.01,  'gross')
on conflict (key) do nothing;

-- ---- generate_payroll_run now reads rates instead of hardcoding them --------
create or replace function public.generate_payroll_run(p_month int, p_year int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_run_id uuid;
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

  select rate into r_pension_emp from public.deduction_rates where key = 'pension_employee';
  select rate into r_pension_er  from public.deduction_rates where key = 'pension_employer';
  select rate into r_nhf         from public.deduction_rates where key = 'nhf';
  select rate into r_nsitf       from public.deduction_rates where key = 'nsitf';
  r_pension_emp := coalesce(r_pension_emp, 0.08);
  r_pension_er  := coalesce(r_pension_er, 0.10);
  r_nhf         := coalesce(r_nhf, 0.025);
  r_nsitf       := coalesce(r_nsitf, 0.01);

  insert into public.payroll_runs (period_month, period_year, created_by)
  values (p_month, p_year, auth.uid())
  returning id into v_run_id;

  period_end := make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day';

  -- super_admin is a system account, not a staff member — never on payroll.
  for emp in select * from public.profiles where status = 'active' and role <> 'super_admin' loop
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
    paye_amt := round(public.compute_paye_annual(taxable_annual) / 12, 2);

    insert into public.payroll_lines (
      run_id, employee_id, basic, housing, transport, other_allowances, gross,
      pension_employee, pension_employer, nhf, nsitf, paye, net,
      state_of_residence, bank_snapshot
    ) values (
      v_run_id, emp.id, ss.basic, ss.housing, ss.transport, ss.other_allowances, gross,
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
