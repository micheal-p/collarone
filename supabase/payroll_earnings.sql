-- One-off earnings: bonuses, arrears, commission, reimbursements.
--
-- Payroll could only pay the standing salary structure. Everything else — a
-- December bonus, a backdated raise, a sales commission, a reimbursed taxi —
-- had no home, so it was handled by editing the salary structure for one month
-- and remembering to change it back (which corrupts the salary history and the
-- next month's tax), or paid outside the system entirely (which puts it beyond
-- PAYE and beyond the bank schedule). Neither is acceptable in a payroll
-- product; both are what customers actually do without this table.
--
-- The taxable flag is the important part, and it is not decoration:
--   * A bonus or commission is EARNED INCOME. It is taxable, it must raise
--     PAYE, and it belongs in the gross the statutory returns are built from.
--   * A reimbursement is the company repaying money the employee already spent
--     out of their own pocket. Taxing it would be taxing them for lending the
--     company money.
-- Getting this wrong either under-deducts PAYE (a FIRS problem) or takes tax
-- off a taxi fare (a trust problem).

create table if not exists public.payroll_line_earnings (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  run_id      uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('bonus','arrears','commission','reimbursement','other')),
  label       text not null default '',
  amount      numeric not null check (amount > 0),
  taxable     boolean not null default true,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists payroll_line_earnings_run_idx
  on public.payroll_line_earnings (run_id, employee_id);

alter table public.payroll_line_earnings enable row level security;

drop policy if exists payroll_line_earnings_select on public.payroll_line_earnings;
create policy payroll_line_earnings_select on public.payroll_line_earnings for select
  using (public.same_org(org_id) and (public.is_payroll_manager() or employee_id = auth.uid()));

-- Only against a DRAFT run: adding a bonus to a run that has already been paid
-- would change a payslip the employee has seen and a figure the bank has acted
-- on. Same principle as payroll_integrity.sql.
drop policy if exists payroll_line_earnings_write on public.payroll_line_earnings;
create policy payroll_line_earnings_write on public.payroll_line_earnings for all
  using (
    public.same_org(org_id) and public.is_payroll_manager() and not public.is_support_session()
    and exists (select 1 from public.payroll_runs r where r.id = run_id and r.status = 'draft')
  )
  with check (
    public.same_org(org_id) and public.is_payroll_manager() and not public.is_support_session()
    and exists (select 1 from public.payroll_runs r where r.id = run_id and r.status = 'draft')
  );

-- Carry the totals on the line so payslips, the bank schedule and the net
-- calculation all see them without every reader needing a join.
alter table public.payroll_lines
  add column if not exists taxable_earnings numeric not null default 0,
  add column if not exists nontaxable_earnings numeric not null default 0;

-- Recompute the affected line whenever an earning is added, changed or removed.
-- PAYE is recalculated because a bonus genuinely changes the tax due; the
-- annualisation mirrors generate_payroll_run so the two can never disagree.
create or replace function public.payroll_recalc_line_earnings()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_run uuid := coalesce(new.run_id, old.run_id);
  v_emp uuid := coalesce(new.employee_id, old.employee_id);
  v_org uuid := coalesce(new.org_id, old.org_id);
  v_tax numeric; v_free numeric;
  l public.payroll_lines;
  base_gross numeric; cra numeric; taxable_annual numeric; new_paye numeric;
  r_pension numeric; r_nhf numeric;
begin
  select coalesce(sum(amount) filter (where taxable), 0),
         coalesce(sum(amount) filter (where not taxable), 0)
    into v_tax, v_free
    from public.payroll_line_earnings where run_id = v_run and employee_id = v_emp;

  select * into l from public.payroll_lines where run_id = v_run and employee_id = v_emp;
  if l.id is null then return coalesce(new, old); end if;

  select rate into r_pension from public.deduction_rates where org_id = v_org and key = 'pension_employee';
  select rate into r_nhf     from public.deduction_rates where org_id = v_org and key = 'nhf';
  r_pension := coalesce(r_pension, 0.08);
  r_nhf     := coalesce(r_nhf, 0.025);

  -- Base pay for the period, i.e. the line without any one-off earnings.
  base_gross := l.basic + l.housing + l.transport + l.other_allowances;
  cra := greatest(200000, (base_gross + v_tax) * 12 * 0.01) + (base_gross + v_tax) * 12 * 0.20;
  taxable_annual := greatest(0, (base_gross + v_tax) * 12 - cra
                     - l.pension_employee * 12 - l.nhf * 12);
  new_paye := round(public.compute_paye_annual(taxable_annual, v_org) / 12, 2);

  update public.payroll_lines
     set taxable_earnings = v_tax,
         nontaxable_earnings = v_free,
         gross = base_gross + v_tax,
         paye = new_paye
   where id = l.id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_payroll_recalc_earnings on public.payroll_line_earnings;
create trigger trg_payroll_recalc_earnings
  after insert or update or delete on public.payroll_line_earnings
  for each row execute function public.payroll_recalc_line_earnings();

revoke execute on function public.payroll_recalc_line_earnings() from public, anon, authenticated;
