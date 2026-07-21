-- ============================================================================
-- Collarone — Staff Loans & Salary Advance (Payroll deepener, no new suite).
-- Run after payroll.sql + payroll_multitenancy.sql + payroll_rates.sql.
-- Idempotent.
--
-- Employer-to-staff loans and salary advances, repaid by payroll deduction.
-- Instruction-only, same as the rest of payroll: Collarone records and
-- deducts on paper — it never moves money.
--
-- The double-deduction guard (this file's whole reason for care):
--   * generate_payroll_run() PLANS a deduction per active loan into
--     payroll_line_loans and bakes it into the line's other_deductions/net.
--   * The loan's balance only actually moves when the run reaches
--     'disbursed' — a trigger converts the plan into loan_repayments rows,
--     unique per (loan_id, run_id), amounts re-capped against the true
--     remaining balance at that moment. Draft/deleted runs never touch a
--     balance; a status flapping back and forth can't double-insert.
-- ============================================================================

create table if not exists public.staff_loans (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  employee_id         uuid not null references public.profiles(id) on delete cascade,
  loan_type           text not null default 'loan' check (loan_type in ('loan','advance')),
  principal           numeric not null check (principal > 0),
  monthly_installment numeric not null check (monthly_installment > 0),
  reason              text not null default '',
  status              text not null default 'pending' check (status in ('pending','active','rejected','closed','cancelled')),
  requested_by        uuid references public.profiles(id),
  approved_by         uuid references public.profiles(id),
  approved_at         timestamptz,
  created_at          timestamptz not null default now(),
  check (monthly_installment <= principal)
);
create index if not exists staff_loans_org_idx on public.staff_loans (org_id, status, created_at desc);
create index if not exists staff_loans_emp_idx on public.staff_loans (employee_id, status);

alter table public.staff_loans enable row level security;
drop policy if exists "staff_loans_select" on public.staff_loans;
create policy "staff_loans_select" on public.staff_loans for select using (
  public.same_org(org_id) and (employee_id = auth.uid() or public.is_payroll_manager() or public.is_super_admin())
);
-- an employee requests for themself (pending only); managers use the RPCs
drop policy if exists "staff_loans_insert" on public.staff_loans;
create policy "staff_loans_insert" on public.staff_loans for insert with check (
  public.same_org(org_id)
  and requested_by = auth.uid()
  and status = 'pending'
  and approved_by is null
  and (employee_id = auth.uid() or public.is_payroll_manager() or public.is_super_admin())
);
-- no direct update/delete — lifecycle goes through decide_staff_loan()

-- ---- repayments (real, balance-moving — written only by the trigger) --------
create table if not exists public.loan_repayments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  loan_id      uuid not null references public.staff_loans(id) on delete cascade,
  run_id       uuid not null references public.payroll_runs(id) on delete cascade,
  amount       numeric not null check (amount > 0),
  period_month int not null,
  period_year  int not null,
  created_at   timestamptz not null default now(),
  unique (loan_id, run_id)
);
create index if not exists loan_repayments_loan_idx on public.loan_repayments (loan_id);
alter table public.loan_repayments enable row level security;
drop policy if exists "loan_repayments_select" on public.loan_repayments;
create policy "loan_repayments_select" on public.loan_repayments for select using (
  public.same_org(org_id) and (
    public.is_payroll_manager() or public.is_super_admin()
    or exists (select 1 from public.staff_loans l where l.id = loan_id and l.employee_id = auth.uid())
  )
);

-- ---- planned deductions per run (draft-safe, regenerated with the run) ------
create table if not exists public.payroll_line_loans (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  run_id      uuid not null references public.payroll_runs(id) on delete cascade,
  loan_id     uuid not null references public.staff_loans(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  amount      numeric not null check (amount > 0),
  unique (run_id, loan_id)
);
alter table public.payroll_line_loans enable row level security;
drop policy if exists "payroll_line_loans_select" on public.payroll_line_loans;
create policy "payroll_line_loans_select" on public.payroll_line_loans for select using (
  public.same_org(org_id) and (
    public.is_payroll_manager() or public.is_super_admin() or employee_id = auth.uid()
  )
);

-- remaining balance = principal minus REAL repayments (disbursed runs only).
-- SECURITY DEFINER bypasses RLS, so it must re-check org itself — an
-- arbitrary-id probe from another org gets null, not a balance (the same
-- RPC-parameter class of bug decide_leave_request/leave_available had).
create or replace function public.loan_balance(p_loan_id uuid)
returns numeric language sql security definer stable set search_path = public as $$
  select l.principal - coalesce((select sum(r.amount) from public.loan_repayments r where r.loan_id = l.id), 0)
  from public.staff_loans l where l.id = p_loan_id and l.org_id = public.my_org_id();
$$;
grant execute on function public.loan_balance(uuid) to authenticated;

-- ---- approve / reject / cancel ---------------------------------------------
create or replace function public.decide_staff_loan(p_loan_id uuid, p_decision text, p_installment numeric default null)
returns public.staff_loans language plpgsql security definer set search_path = public as $$
declare
  loan public.staff_loans;
begin
  if not (public.is_payroll_manager() or public.is_super_admin()) then
    raise exception 'Not authorised to decide loans';
  end if;
  select * into loan from public.staff_loans where id = p_loan_id;
  if loan.id is null or loan.org_id <> public.my_org_id() then raise exception 'Loan not found'; end if;

  if p_decision = 'approve' then
    if loan.status <> 'pending' then raise exception 'Only a pending request can be approved'; end if;
    update public.staff_loans set
      status = 'active',
      monthly_installment = coalesce(p_installment, monthly_installment),
      approved_by = auth.uid(), approved_at = now()
    where id = loan.id returning * into loan;
  elsif p_decision = 'reject' then
    if loan.status <> 'pending' then raise exception 'Only a pending request can be rejected'; end if;
    update public.staff_loans set status = 'rejected', approved_by = auth.uid(), approved_at = now()
    where id = loan.id returning * into loan;
  elsif p_decision = 'cancel' then
    -- cancel an active loan that will no longer be deducted (e.g. settled in
    -- cash outside payroll). History stays; future runs skip it.
    if loan.status not in ('pending','active') then raise exception 'Only a pending or active loan can be cancelled'; end if;
    update public.staff_loans set status = 'cancelled' where id = loan.id returning * into loan;
  else
    raise exception 'Invalid decision';
  end if;

  return loan;
end;
$$;
grant execute on function public.decide_staff_loan(uuid, text, numeric) to authenticated;

-- ---- generate_payroll_run: supersedes payroll_multitenancy.sql's version ----
-- Identical org-scoped math, plus: each active loan contributes
-- min(installment, headroom) to other_deductions, recorded per-loan in
-- payroll_line_loans. Headroom = remaining balance minus what's already
-- planned in OTHER not-yet-disbursed runs, so two draft periods can't plan
-- the same naira twice.
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
  cra numeric;
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

    cra := greatest(200000, gross * 12 * 0.01) + gross * 12 * 0.20;
    taxable_annual := greatest(0, gross * 12 - cra - pension_emp * 12 - nhf_amt * 12);
    paye_amt := round(public.compute_paye_annual(taxable_annual, caller_org) / 12, 2);

    -- loan/advance deductions for this employee
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

-- ---- disbursement finalises repayments --------------------------------------
create or replace function public.finalize_loan_repayments()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pl record;
  v_remaining numeric;
  v_amt numeric;
begin
  if new.status = 'disbursed' and coalesce(old.status, '') <> 'disbursed' then
    for pl in select * from public.payroll_line_loans where run_id = new.id loop
      -- re-cap against the TRUE remaining balance right now
      v_remaining := public.loan_balance(pl.loan_id);
      v_amt := least(pl.amount, greatest(v_remaining, 0));
      if v_amt > 0 then
        insert into public.loan_repayments (org_id, loan_id, run_id, amount, period_month, period_year)
        values (pl.org_id, pl.loan_id, new.id, v_amt, new.period_month, new.period_year)
        on conflict (loan_id, run_id) do nothing;
        -- close the loan the moment it's fully repaid
        if public.loan_balance(pl.loan_id) <= 0 then
          update public.staff_loans set status = 'closed' where id = pl.loan_id and status = 'active';
        end if;
      end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_finalize_loan_repayments on public.payroll_runs;
create trigger trg_finalize_loan_repayments
  after update of status on public.payroll_runs
  for each row execute function public.finalize_loan_repayments();
