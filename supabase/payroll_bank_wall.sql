-- ============================================================================
-- Collarone — Payroll "Banking Wall"
-- A running feed the payroll manager (who liaises with the bank) uses so
-- they always know: which employees are newly added to payroll (bank needs
-- their account details for the first time) and which payroll runs have
-- just been approved (ready to hand to the bank for disbursement) — and can
-- mark each one as actioned once they've followed up with the bank.
-- Run after platform_suite_test.sql. Idempotent.
-- ============================================================================

create table if not exists public.payroll_bank_actions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id),
  action_type     text not null check (action_type in ('new_employee', 'run_approved')),
  employee_id     uuid references public.profiles(id) on delete cascade,
  bank_account_id uuid references public.bank_accounts(id) on delete cascade,
  payroll_run_id  uuid references public.payroll_runs(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'actioned')),
  notes           text not null default '',
  actioned_by     uuid references public.profiles(id),
  actioned_at     timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.payroll_bank_actions enable row level security;

drop policy if exists "payroll_bank_actions_select" on public.payroll_bank_actions;
create policy "payroll_bank_actions_select" on public.payroll_bank_actions for select using (
  public.same_org(org_id) and (public.is_payroll_manager() or public.is_super_admin())
);
drop policy if exists "payroll_bank_actions_update" on public.payroll_bank_actions;
create policy "payroll_bank_actions_update" on public.payroll_bank_actions for update using (
  public.same_org(org_id) and (public.is_payroll_manager() or public.is_super_admin())
);
-- No insert policy for authenticated/anon — rows are only created by the
-- triggers below (SECURITY DEFINER trigger functions), never direct client writes.

-- ---- auto-log: first bank account for an employee = a new payroll addition --
create or replace function public.log_new_payroll_employee()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_is_first boolean;
begin
  select org_id into v_org from public.profiles where id = new.employee_id;
  select not exists (
    select 1 from public.bank_accounts where employee_id = new.employee_id and id <> new.id
  ) into v_is_first;
  if v_is_first then
    insert into public.payroll_bank_actions (org_id, action_type, employee_id, bank_account_id)
    values (v_org, 'new_employee', new.employee_id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_new_payroll_employee on public.bank_accounts;
create trigger trg_log_new_payroll_employee
  after insert on public.bank_accounts
  for each row execute function public.log_new_payroll_employee();

-- ---- auto-log: a run transitioning into 'approved' -----------------------------
create or replace function public.log_payroll_run_approved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    insert into public.payroll_bank_actions (org_id, action_type, payroll_run_id)
    values (new.org_id, 'run_approved', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_payroll_run_approved on public.payroll_runs;
create trigger trg_log_payroll_run_approved
  after update on public.payroll_runs
  for each row execute function public.log_payroll_run_approved();

create or replace function public.mark_bank_action(p_id uuid, p_status text)
returns public.payroll_bank_actions language plpgsql security definer set search_path = public as $$
declare row public.payroll_bank_actions;
begin
  if not (public.is_payroll_manager() or public.is_super_admin()) then raise exception 'Not authorised'; end if;
  if p_status not in ('pending', 'actioned') then raise exception 'Invalid status'; end if;
  update public.payroll_bank_actions
  set status = p_status,
      actioned_by = case when p_status = 'actioned' then auth.uid() else null end,
      actioned_at = case when p_status = 'actioned' then now() else null end
  where id = p_id and org_id = public.my_org_id()
  returning * into row;
  if row.id is null then raise exception 'Not found'; end if;
  return row;
end;
$$;
grant execute on function public.mark_bank_action(uuid, text) to authenticated;
