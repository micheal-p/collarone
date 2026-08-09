-- Separate what a human typed from what the system computed.
--
-- payroll_lines.other_deductions holds BOTH: loan and advance repayments baked
-- in by finalize_loan_repayments (recorded per-loan in payroll_line_loans), and
-- whatever a payroll manager types into the "other deductions" box. One number,
-- two owners, and no way to tell them apart.
--
-- The failure is quiet and expensive. A manager opens a line to deduct ₦5,000
-- for a uniform, types 5000, and saves — wiping the ₦20,000 loan instalment the
-- system had put there. The employee is paid ₦20,000 too much, payroll_line_loans
-- still says the instalment was collected, and the loan balance is now wrong
-- forever. Nobody notices until the loan finishes early and the maths does not
-- reconcile.
--
-- Split them: manual_deductions is the human's field, loan_deductions is the
-- system's, and other_deductions becomes their sum so every existing reader
-- (payslip, bank schedule, net calculation) keeps working untouched.

alter table public.payroll_lines
  add column if not exists manual_deductions numeric not null default 0,
  add column if not exists loan_deductions   numeric not null default 0;

-- Backfill: whatever the loan engine recorded per-line is the system's share;
-- the remainder was typed by a person.
-- payroll_line_loans keys on (run_id, employee_id), not line_id.
update public.payroll_lines l
   set loan_deductions = coalesce(x.total, 0),
       manual_deductions = greatest(0, l.other_deductions - coalesce(x.total, 0))
  from (
    select run_id, employee_id, sum(amount) total
      from public.payroll_line_loans group by run_id, employee_id
  ) x
 where x.run_id = l.run_id and x.employee_id = l.employee_id
   and l.loan_deductions = 0 and l.manual_deductions = 0;

-- Lines with no loan rows: all of it was manual.
update public.payroll_lines
   set manual_deductions = other_deductions
 where manual_deductions = 0 and loan_deductions = 0 and other_deductions > 0;

comment on column public.payroll_lines.manual_deductions is
  'Typed by a payroll manager. The only deduction field a human may edit.';
comment on column public.payroll_lines.loan_deductions is
  'Computed by finalize_loan_repayments from payroll_line_loans. Never edited by hand — editing it would desync the loan balance.';

-- other_deductions is now derived, so the two can never disagree.
create or replace function public.payroll_sync_deductions()
returns trigger language plpgsql set search_path = public as $$
begin
  new.other_deductions := coalesce(new.manual_deductions, 0) + coalesce(new.loan_deductions, 0);
  -- Net follows the same arithmetic the generator uses.
  new.net := coalesce(new.gross, 0) - coalesce(new.pension_employee, 0)
             - coalesce(new.nhf, 0) - coalesce(new.paye, 0) - new.other_deductions;
  return new;
end;
$$;

drop trigger if exists trg_payroll_sync_deductions on public.payroll_lines;
create trigger trg_payroll_sync_deductions
  before insert or update of manual_deductions, loan_deductions, gross, pension_employee, nhf, paye
  on public.payroll_lines
  for each row execute function public.payroll_sync_deductions();
