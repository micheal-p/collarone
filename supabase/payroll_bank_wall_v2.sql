-- ============================================================================
-- Collarone — Banking Wall v2: account CHANGES hit the wall too.
-- Run after payroll_bank_wall.sql. Idempotent.
--
-- Gap fixed: only an employee's FIRST bank account ever logged to the wall.
-- An employee adding a replacement account later never notified the liaison,
-- so salaries kept flowing to the old account until someone noticed. Now any
-- subsequent account logs as 'account_changed'.
-- ============================================================================

alter table public.payroll_bank_actions drop constraint if exists payroll_bank_actions_action_type_check;
alter table public.payroll_bank_actions add constraint payroll_bank_actions_action_type_check
  check (action_type in ('new_employee', 'run_approved', 'account_changed'));

create or replace function public.log_new_payroll_employee()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_is_first boolean;
begin
  select org_id into v_org from public.profiles where id = new.employee_id;
  select not exists (
    select 1 from public.bank_accounts where employee_id = new.employee_id and id <> new.id
  ) into v_is_first;
  insert into public.payroll_bank_actions (org_id, action_type, employee_id, bank_account_id)
  values (v_org, case when v_is_first then 'new_employee' else 'account_changed' end, new.employee_id, new.id);
  return new;
end;
$$;
-- trigger already exists (trg_log_new_payroll_employee) and now runs this body
