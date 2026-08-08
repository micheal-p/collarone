-- CROSS-TENANT WRITE FIX for the four privileged HR RPCs.
--
-- Found 2026-08-08 by the module board review, verified against the source.
--
-- The bug: hr_multitenancy.sql added same_org() to every HR *table policy*, but
-- these four functions are SECURITY DEFINER — they bypass RLS by definition, so
-- no policy ever applied to them. Each one checked only is_hr_manager(), which
-- asks "does the CALLER hold the hr-manager role?" and says nothing about WHICH
-- organization the target row belongs to. Then each did an UPDATE ... WHERE
-- id = <caller-supplied uuid>.
--
-- Impact if left: an HR manager in tenant A who learns a profile UUID from
-- tenant B could rewrite that person's job title, department, reporting line,
-- start date and employment type; set or clear their probation; confirm them;
-- and via hr_finalize_exit set profiles.status = 'disabled' — locking a
-- different company's employee out of Collarone. Silent, no audit trail.
-- This is the exact class of failure that multi-tenancy exists to prevent.
--
-- The fix: every one of them now resolves the TARGET's org and refuses unless
-- it matches the caller's. The guard is on the target row, not on the caller's
-- role — role says what you may do, org says to whom.
--
-- Note the deliberate error wording: "Employee not found" for a cross-org
-- target, identical to a genuinely missing row. A distinct "wrong organization"
-- message would confirm to an attacker that the UUID they guessed is real.

-- ---- 1. employment fields ---------------------------------------------------
create or replace function public.hr_update_employee(
  p_user_id         uuid,
  p_job_title       text,
  p_department_id   int,
  p_manager_id      uuid,
  p_start_date      date,
  p_employment_type text
)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  dept_name text;
  result public.profiles;
  caller_org uuid;
begin
  if not (public.is_hr_manager() or public.is_super_admin()) then
    raise exception 'Not authorised to edit employee records';
  end if;
  if p_manager_id = p_user_id then
    raise exception 'An employee cannot be their own manager';
  end if;

  caller_org := public.my_org_id();
  if caller_org is null then raise exception 'Employee not found'; end if;

  -- target must be in the caller's org
  if not exists (select 1 from public.profiles where id = p_user_id and org_id = caller_org) then
    raise exception 'Employee not found';
  end if;
  -- a manager reassignment must also stay inside the org
  if p_manager_id is not null
     and not exists (select 1 from public.profiles where id = p_manager_id and org_id = caller_org) then
    raise exception 'Manager not found';
  end if;
  -- and so must the department
  select name into dept_name from public.departments
   where id = p_department_id and org_id = caller_org;
  if p_department_id is not null and dept_name is null then
    raise exception 'Department not found';
  end if;

  update public.profiles
  set job_title       = coalesce(trim(p_job_title), job_title),
      department_id   = p_department_id,
      department      = coalesce(dept_name, department),
      manager_id      = p_manager_id,
      start_date      = p_start_date,
      employment_type = coalesce(p_employment_type, employment_type)
  where id = p_user_id and org_id = caller_org
  returning * into result;

  if result.id is null then
    raise exception 'Employee not found';
  end if;
  return result;
end;
$$;

-- ---- 2. probation -----------------------------------------------------------
create or replace function public.hr_set_probation(p_employee_id uuid, p_probation_end_date date)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare result public.profiles; caller_org uuid;
begin
  if not (public.is_hr_manager() or public.is_super_admin()) then
    raise exception 'Not authorised to edit employee records';
  end if;
  caller_org := public.my_org_id();
  if caller_org is null then raise exception 'Employee not found'; end if;

  update public.profiles set probation_end_date = p_probation_end_date
  where id = p_employee_id and org_id = caller_org returning * into result;
  if result.id is null then raise exception 'Employee not found'; end if;
  return result;
end;
$$;

-- ---- 3. confirmation --------------------------------------------------------
create or replace function public.hr_confirm_employee(p_employee_id uuid)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare result public.profiles; caller_org uuid;
begin
  if not (public.is_hr_manager() or public.is_super_admin()) then
    raise exception 'Not authorised to edit employee records';
  end if;
  caller_org := public.my_org_id();
  if caller_org is null then raise exception 'Employee not found'; end if;

  update public.profiles set confirmed_at = now()
  where id = p_employee_id and org_id = caller_org returning * into result;
  if result.id is null then raise exception 'Employee not found'; end if;
  return result;
end;
$$;

-- ---- 4. finalize exit (the account-disabling one) ---------------------------
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

  -- the disable is scoped too: an exit record can only ever disable an account
  -- belonging to the same organization as the record itself.
  update public.profiles set status = 'disabled'
  where id = result.employee_id and org_id = caller_org;
  return result;
end;
$$;

grant execute on function public.hr_update_employee(uuid, text, int, uuid, date, text) to authenticated;
grant execute on function public.hr_set_probation(uuid, date) to authenticated;
grant execute on function public.hr_confirm_employee(uuid) to authenticated;
grant execute on function public.hr_finalize_exit(uuid) to authenticated;
