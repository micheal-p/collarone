-- ============================================================================
-- Collarone — Nigeria Tax Act 2025 compliance (PAYE regime effective
-- 1 January 2026). Run after payroll_loans.sql. Idempotent.
--
-- What changed in law (and now in the engine):
--   * NEW PAYE BANDS: 0% up to ₦800,000 · 15% to ₦3m · 18% to ₦12m ·
--     21% to ₦25m · 23% to ₦50m · 25% above. (Old 7–24% bands repealed.)
--   * CRA ABOLISHED: the Consolidated Relief Allowance
--     (₦200k/1% + 20% of gross) no longer exists. Replaced by RENT RELIEF —
--     20% of the employee's declared annual rent, capped at ₦500,000.
--     Pension and NHF employee contributions remain deductible.
--
-- Also fixes a latent gap found during this work: orgs created AFTER the
-- multitenancy migration were never seeded with paye_bands or
-- deduction_rates at all — their PAYE silently computed as ZERO. A trigger
-- now seeds every new organization at creation.
--
-- CANONICAL NOTE: generate_payroll_run() moves here (supersedes the
-- payroll_loans.sql copy — loans logic preserved verbatim).
-- ============================================================================

-- ---- rent relief input -------------------------------------------------------
alter table public.salary_structures add column if not exists annual_rent numeric not null default 0 check (annual_rent >= 0);

-- ---- 2026 bands for EVERY org (old bands repealed, hard replace) -------------
delete from public.paye_bands;
insert into public.paye_bands (org_id, min_annual, max_annual, rate, sort_order)
select o.id, b.min_annual, b.max_annual, b.rate, b.sort_order
from public.organizations o
cross join (values
  (0,        800000,   0.00, 1),
  (800000,   3000000,  0.15, 2),
  (3000000,  12000000, 0.18, 3),
  (12000000, 25000000, 0.21, 4),
  (25000000, 50000000, 0.23, 5),
  (50000000, null::numeric, 0.25, 6)
) as b(min_annual, max_annual, rate, sort_order);

-- ---- every NEW org gets seeded at creation -----------------------------------
create or replace function public.seed_org_payroll_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.paye_bands (org_id, min_annual, max_annual, rate, sort_order) values
    (new.id, 0,        800000,   0.00, 1),
    (new.id, 800000,   3000000,  0.15, 2),
    (new.id, 3000000,  12000000, 0.18, 3),
    (new.id, 12000000, 25000000, 0.21, 4),
    (new.id, 25000000, 50000000, 0.23, 5),
    (new.id, 50000000, null,     0.25, 6)
  on conflict (org_id, sort_order) do nothing;

  insert into public.deduction_rates (org_id, key, label, rate, basis) values
    (new.id, 'pension_employee', 'Pension — employee share', 0.08,  'pensionable'),
    (new.id, 'pension_employer', 'Pension — employer share', 0.10,  'pensionable'),
    (new.id, 'nhf',              'National Housing Fund',    0.025, 'basic'),
    (new.id, 'nsitf',            'NSITF (employer cost)',     0.01,  'gross')
  on conflict (org_id, key) do nothing;

  return new;
end;
$$;
drop trigger if exists trg_seed_org_payroll_defaults on public.organizations;
create trigger trg_seed_org_payroll_defaults
  after insert on public.organizations
  for each row execute function public.seed_org_payroll_defaults();

-- backfill deduction_rates for any org the one-time copy missed
insert into public.deduction_rates (org_id, key, label, rate, basis)
select o.id, d.key, d.label, d.rate, d.basis
from public.organizations o
cross join (values
  ('pension_employee', 'Pension — employee share', 0.08,  'pensionable'),
  ('pension_employer', 'Pension — employer share', 0.10,  'pensionable'),
  ('nhf',              'National Housing Fund',    0.025, 'basic'),
  ('nsitf',            'NSITF (employer cost)',     0.01,  'gross')
) as d(key, label, rate, basis)
on conflict (org_id, key) do nothing;

-- ---- generate_payroll_run v5: 2026 relief math + loans (canonical) -----------
create or replace function public.generate_payroll_run(p_month int, p_year int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_run_id uuid;
  caller_org uuid;
  emp record;
  ss record;
  ba record;
  ln record;
  pensionable numeric;
  gross numeric;
  pension_emp numeric;
  pension_er numeric;
  nhf_amt numeric;
  nsitf_amt numeric;
  rent_relief numeric;
  taxable_annual numeric;
  paye_amt numeric;
  period_end date;
  r_pension_emp numeric;
  r_pension_er  numeric;
  r_nhf         numeric;
  r_nsitf       numeric;
  v_loan_ded    numeric;
  v_headroom    numeric;
  v_take        numeric;
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

  for emp in select * from public.profiles where status = 'active' and role <> 'super_admin' and org_id = caller_org loop
    select * into ss from public.salary_structures
      where employee_id = emp.id and effective_date <= period_end
      order by effective_date desc, created_at desc limit 1;
    if ss.id is null then continue; end if;

    select * into ba from public.bank_accounts
      where employee_id = emp.id order by is_primary desc, created_at desc limit 1;

    pensionable := ss.basic + ss.housing + ss.transport;
    gross       := pensionable + ss.other_allowances;
    pension_emp := round(pensionable * r_pension_emp, 2);
    pension_er  := round(pensionable * r_pension_er, 2);
    nhf_amt     := round(ss.basic * r_nhf, 2);
    nsitf_amt   := round(gross * r_nsitf, 2);

    -- Nigeria Tax Act 2025 (from Jan 2026): CRA is gone. Relief = rent relief
    -- (20% of declared annual rent, capped ₦500,000) + deductible pension/NHF.
    -- The ₦800k 0% band exempts low earners inside compute_paye_annual itself.
    rent_relief := least(coalesce(ss.annual_rent, 0) * 0.20, 500000);
    taxable_annual := greatest(0, gross * 12 - rent_relief - pension_emp * 12 - nhf_amt * 12);
    paye_amt := round(public.compute_paye_annual(taxable_annual, caller_org) / 12, 2);

    -- loan/advance deductions (unchanged from payroll_loans.sql)
    v_loan_ded := 0;
    for ln in select l.* from public.staff_loans l
              where l.org_id = caller_org and l.employee_id = emp.id and l.status = 'active' loop
      v_headroom := public.loan_balance(ln.id)
        - coalesce((select sum(pl.amount) from public.payroll_line_loans pl
                    join public.payroll_runs pr on pr.id = pl.run_id
                    where pl.loan_id = ln.id and pr.status <> 'disbursed' and pl.run_id <> v_run_id), 0);
      v_take := least(ln.monthly_installment, greatest(v_headroom, 0));
      if v_take > 0 then
        insert into public.payroll_line_loans (org_id, run_id, loan_id, employee_id, amount)
        values (caller_org, v_run_id, ln.id, emp.id, v_take)
        on conflict (run_id, loan_id) do nothing;
        v_loan_ded := v_loan_ded + v_take;
      end if;
    end loop;

    insert into public.payroll_lines (
      org_id, run_id, employee_id, basic, housing, transport, other_allowances, gross,
      pension_employee, pension_employer, nhf, nsitf, paye, other_deductions, net,
      state_of_residence, bank_snapshot
    ) values (
      caller_org, v_run_id, emp.id, ss.basic, ss.housing, ss.transport, ss.other_allowances, gross,
      pension_emp, pension_er, nhf_amt, nsitf_amt, paye_amt, v_loan_ded,
      gross - pension_emp - nhf_amt - paye_amt - v_loan_ded,
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
