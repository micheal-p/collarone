-- ============================================================================
-- Org-Ops ERP — HR & Staff (employee directory + org structure)
-- RBAC: any authenticated staff → read-only directory & org chart |
--        hr suite role=manager → edit employment fields (job title, dept,
--        manager, start date, employment type) | super_admin → all
-- Run in Supabase SQL Editor after departments.sql. Idempotent — safe to re-run.
-- ============================================================================

-- ---- Employment fields on profiles ------------------------------------------
alter table public.profiles
  add column if not exists start_date      date,
  add column if not exists employment_type text not null default 'full_time'
    check (employment_type in ('full_time','part_time','contract','intern')),
  add column if not exists manager_id      uuid references public.profiles(id) on delete set null;

-- ---- Helper: caller has hr suite role='manager' -----------------------------
create or replace function public.is_hr_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and suites @> '[{"key":"hr","role":"manager"}]'::jsonb
  );
$$;

grant execute on function public.is_hr_manager() to authenticated;

-- ---- Helper: caller holds the hr suite (any role) ---------------------------
-- MUST be SECURITY DEFINER: it queries profiles, and this function backs a
-- policy defined ON profiles. An inline subquery here (instead of going
-- through a bypass-RLS function) recurses infinitely — same reason
-- is_super_admin() in schema.sql is SECURITY DEFINER.
create or replace function public.has_hr_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and suites @> '[{"key":"hr"}]'::jsonb
  );
$$;

grant execute on function public.has_hr_suite() to authenticated;

-- ---- Broaden profiles read access: any staff with the hr suite (any role)
-- can read the directory, not just their own row / super_admin.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (
  id = auth.uid()
  or public.is_super_admin()
  or public.has_hr_suite()
);

-- ---- RPC: HR manager updates employment fields only -------------------------
-- (the broad profiles_update_admin policy stays super_admin-only, so this RPC
-- is the only way an hr-manager, who is not necessarily a super_admin, can edit.)
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
begin
  if not (public.is_hr_manager() or public.is_super_admin()) then
    raise exception 'Not authorised to edit employee records';
  end if;
  if p_manager_id = p_user_id then
    raise exception 'An employee cannot be their own manager';
  end if;

  select name into dept_name from public.departments where id = p_department_id;

  update public.profiles
  set job_title       = coalesce(trim(p_job_title), job_title),
      department_id   = p_department_id,
      department       = coalesce(dept_name, department),
      manager_id       = p_manager_id,
      start_date       = p_start_date,
      employment_type  = coalesce(p_employment_type, employment_type)
  where id = p_user_id
  returning * into result;

  if result.id is null then
    raise exception 'Employee not found';
  end if;
  return result;
end;
$$;

grant execute on function public.hr_update_employee(uuid, text, int, uuid, date, text) to authenticated;
