-- Payroll: make paid money unchangeable, and pay people for the days they
-- actually worked.
--
-- Three real defects, one migration.
--
-- 1. A DISBURSED RUN WAS DELETABLE. payroll_runs had no status check on
--    delete, and payroll_lines cascades on run delete — so deleting a paid run
--    erased the lines, and with them payroll_line_loans, which is the record of
--    how much of a staff loan has been repaid. Deleting a paid March wipes the
--    evidence that March's repayment happened. Money records must be immutable
--    once money has moved.
--
-- 2. NO PRORATION. Someone who joined on the 20th was paid the whole month,
--    and someone who left on the 3rd was paid the whole month too — the loop
--    read salary_structures and never looked at start_date at all. There was
--    also no exit_date anywhere, so a leaver stayed on payroll until an admin
--    remembered to disable the account.
--
-- 3. CONTRACTORS WERE ON THE STAFF RUN. The loop excludes super_admin but not
--    employment_type = 'contract', so contractors got PAYE, pension, NHF and
--    NSITF computed as if they were employees. That is not just wrong money,
--    it is a statutory misfiling.

-- ---- exit_date: one authoritative "last day" on the profile ----------------
alter table public.profiles add column if not exists exit_date date;

-- Backfill from the exit records that already exist.
update public.profiles p
set exit_date = e.last_working_day
from public.exit_records e
where e.employee_id = p.id and p.exit_date is null;

comment on column public.profiles.exit_date is
  'Last working day. Set by hr_finalize_exit; payroll prorates the final month against it and skips the person entirely thereafter.';

-- hr_finalize_exit now records the leaving date as well as disabling the
-- account, so payroll stops paying them without anyone remembering to act.
-- (Org guard from hr_rpc_org_scope.sql is preserved.)
create or replace function public.hr_finalize_exit(p_exit_id uuid)
returns public.exit_records language plpgsql security definer set search_path = public as $$
declare result public.exit_records; caller_org uuid;
begin
  if not (public.is_hr_manager() or public.is_super_admin()) then
    raise exception 'Not authorised to finalize exits';
  end if;
  caller_org := public.my_org_id();
  if caller_org is null then raise exception 'Exit record not found'; end if;

  update public.exit_records set status = 'completed', completed_at = now()
  where id = p_exit_id and org_id = caller_org returning * into result;
  if result.id is null then raise exception 'Exit record not found'; end if;

  update public.profiles
  set status = 'disabled', exit_date = coalesce(exit_date, result.last_working_day)
  where id = result.employee_id and org_id = caller_org;
  return result;
end;
$$;
grant execute on function public.hr_finalize_exit(uuid) to authenticated;

-- ---- proration columns on the line, so a payslip can explain itself --------
alter table public.payroll_lines add column if not exists days_worked int;
alter table public.payroll_lines add column if not exists days_in_month int;
comment on column public.payroll_lines.days_worked is
  'Days of the period this person was actually employed. Equal to days_in_month for a full month; the payslip shows the fraction when it is not.';

-- ---- IMMUTABILITY ----------------------------------------------------------
-- A run past draft is a financial record. The only thing that may still change
-- on it is the disbursement bookkeeping (marking it paid, attaching the bank
-- reference) and the notes field. Everything else, including the period and
-- the status going backwards, is frozen.
create or replace function public.payroll_run_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'This payroll run has been % and cannot be deleted. Payroll history is permanent.', old.status;
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status in ('released', 'disbursed') then
    if new.period_month is distinct from old.period_month
       or new.period_year is distinct from old.period_year then
      raise exception 'The period of a % payroll run cannot be changed.', old.status;
    end if;
    -- Reopening a released run is allowed (mistakes happen), but it must not
    -- leave released_at behind claiming it was paid.
    if new.status = 'draft' and old.status = 'released' then
      new.released_at := null;
      new.disbursed_at := null;
      new.disbursement_reference := '';
    elsif old.status = 'disbursed' and new.status <> 'disbursed' then
      raise exception 'A disbursed payroll run cannot be reopened — the money has already left.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payroll_run_guard on public.payroll_runs;
create trigger trg_payroll_run_guard
  before update or delete on public.payroll_runs
  for each row execute function public.payroll_run_guard();

-- Lines follow their run: once the run is past draft, the numbers are fixed.
-- payment_status is the one exception — that is the disbursement ticking off.
create or replace function public.payroll_line_guard()
returns trigger language plpgsql as $$
declare run_status text;
begin
  select status into run_status from public.payroll_runs
   where id = coalesce(new.run_id, old.run_id);
  if run_status is null or run_status = 'draft' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    raise exception 'This payroll run has been % — its lines cannot be deleted.', run_status;
  end if;

  if new.gross is distinct from old.gross
     or new.net is distinct from old.net
     or new.paye is distinct from old.paye
     or new.pension_employee is distinct from old.pension_employee
     or new.nhf is distinct from old.nhf
     or new.employee_id is distinct from old.employee_id then
    raise exception 'The figures on a % payroll run cannot be changed. Reopen the run to draft first.', run_status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payroll_line_guard on public.payroll_lines;
create trigger trg_payroll_line_guard
  before update or delete on public.payroll_lines
  for each row execute function public.payroll_line_guard();

-- ---- the generator: prorate, skip leavers, skip contractors ----------------
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
  full_gross numeric;
  pension_emp numeric;
  pension_er numeric;
  nhf_amt numeric;
  nsitf_amt numeric;
  cra numeric;
  taxable_annual numeric;
  paye_amt numeric;
  period_start date;
  period_end date;
  v_days_in_month int;
  v_first date;
  v_last date;
  v_days_worked int;
  v_factor numeric;
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

  period_start := make_date(p_year, p_month, 1);
  period_end   := period_start + interval '1 month' - interval '1 day';
  v_days_in_month := extract(day from period_end)::int;

  -- Scoped to the caller's own org. super_admin is a system account, not a
  -- staff member. Contractors are paid on invoice, not through PAYE payroll —
  -- putting them here files statutory returns for people who aren't employees.
  for emp in
    select * from public.profiles
    where org_id = caller_org
      and role <> 'super_admin'
      and coalesce(employment_type, '') <> 'contract'
      -- active, OR left during this period (they are owed their final part-month)
      and (status = 'active' or (exit_date is not null and exit_date >= period_start))
      -- not yet started, or already gone before this period began
      and (start_date is null or start_date <= period_end)
      and (exit_date is null or exit_date >= period_start)
  loop
    select * into ss from public.salary_structures
      where employee_id = emp.id and effective_date <= period_end
      order by effective_date desc, created_at desc limit 1;
    if ss.id is null then continue; end if; -- no salary on file yet — skip, don't guess

    select * into ba from public.bank_accounts
      where employee_id = emp.id order by is_primary desc, created_at desc limit 1;

    -- Proration: the overlap between employment and the period.
    v_first := greatest(period_start, coalesce(emp.start_date, period_start));
    v_last  := least(period_end, coalesce(emp.exit_date, period_end));
    v_days_worked := (v_last - v_first) + 1;
    if v_days_worked < 1 then continue; end if;
    v_factor := v_days_worked::numeric / v_days_in_month::numeric;

    -- PAYE is annualised on the FULL monthly rate, then the resulting monthly
    -- tax is prorated. Annualising a part-month figure would put the person in
    -- a lower band and under-deduct — the band is a property of their salary,
    -- not of how many days they happened to work this month.
    pensionable := ss.basic + ss.housing + ss.transport;
    full_gross  := pensionable + ss.other_allowances;
    cra := greatest(200000, full_gross * 12 * 0.01) + full_gross * 12 * 0.20;
    taxable_annual := greatest(0, full_gross * 12
                       - cra
                       - round(pensionable * r_pension_emp, 2) * 12
                       - round(ss.basic * r_nhf, 2) * 12);
    paye_amt := round((public.compute_paye_annual(taxable_annual, caller_org) / 12) * v_factor, 2);

    gross       := round(full_gross * v_factor, 2);
    pension_emp := round(pensionable * r_pension_emp * v_factor, 2);
    pension_er  := round(pensionable * r_pension_er  * v_factor, 2);
    nhf_amt     := round(ss.basic * r_nhf * v_factor, 2);
    nsitf_amt   := round(full_gross * r_nsitf * v_factor, 2);

    insert into public.payroll_lines (
      org_id, run_id, employee_id, basic, housing, transport, other_allowances, gross,
      pension_employee, pension_employer, nhf, nsitf, paye, net,
      state_of_residence, bank_snapshot, days_worked, days_in_month
    ) values (
      caller_org, v_run_id, emp.id,
      round(ss.basic * v_factor, 2), round(ss.housing * v_factor, 2),
      round(ss.transport * v_factor, 2), round(ss.other_allowances * v_factor, 2), gross,
      pension_emp, pension_er, nhf_amt, nsitf_amt, paye_amt,
      gross - pension_emp - nhf_amt - paye_amt,
      coalesce(emp.state_of_residence, ''),
      case when ba.id is not null
        then jsonb_build_object('bankName', ba.bank_name, 'bankCode', ba.bank_code, 'accountNumber', ba.account_number, 'accountName', ba.account_name)
        else '{}'::jsonb end,
      v_days_worked, v_days_in_month
    )
    on conflict (run_id, employee_id) do nothing;
  end loop;

  return v_run_id;
end;
$$;
grant execute on function public.generate_payroll_run(int, int) to authenticated;
