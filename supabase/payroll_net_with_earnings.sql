-- Net must include money that is paid but not taxed.
--
-- payroll_sync_deductions computes:
--   net = gross - pension - nhf - paye - deductions
--
-- A non-taxable earning (a reimbursement — the company repaying what the
-- employee already spent) is deliberately NOT in gross, because it is not
-- income and must not raise PAYE. But it still has to reach the person's bank
-- account. Without this, adding a ₦15,000 taxi reimbursement changed nothing
-- about what they were paid, which is a silent underpayment.

create or replace function public.payroll_sync_deductions()
returns trigger language plpgsql set search_path = public as $$
begin
  new.other_deductions := coalesce(new.manual_deductions, 0) + coalesce(new.loan_deductions, 0);
  new.net := coalesce(new.gross, 0)
             - coalesce(new.pension_employee, 0)
             - coalesce(new.nhf, 0)
             - coalesce(new.paye, 0)
             - new.other_deductions
             -- paid, never taxed
             + coalesce(new.nontaxable_earnings, 0);
  return new;
end;
$$;

drop trigger if exists trg_payroll_sync_deductions on public.payroll_lines;
create trigger trg_payroll_sync_deductions
  before insert or update of manual_deductions, loan_deductions, gross,
    pension_employee, nhf, paye, nontaxable_earnings
  on public.payroll_lines
  for each row execute function public.payroll_sync_deductions();
