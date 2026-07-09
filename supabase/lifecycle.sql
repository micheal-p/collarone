-- ============================================================================
-- Org-Ops ERP — HR Phase 2: Lifecycle (Recruitment, Onboarding, Offboarding)
-- RBAC: is_hr_manager() (hr suite role='manager') runs the pipeline / checklists.
-- Extra carve-outs: a hiring manager sees their own requisition even without
-- the hr suite; an interviewer sees/scores only the interviews assigned to
-- them. Employees can see (read-only) their own onboarding/offboarding record.
-- super_admin sees everything.
-- Run in Supabase SQL Editor after hr.sql. Idempotent — safe to re-run.
-- ============================================================================

-- ---- Probation fields on profiles (onboarding) -------------------------------
alter table public.profiles
  add column if not exists probation_end_date date,
  add column if not exists confirmed_at       timestamptz;

-- ============================================================================
-- RECRUITMENT
-- ============================================================================

create table if not exists public.job_requisitions (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  department_id     int references public.departments(id) on delete set null,
  hiring_manager_id uuid references public.profiles(id) on delete set null,
  headcount         int not null default 1,
  employment_type   text not null default 'full_time' check (employment_type in ('full_time','part_time','contract','intern')),
  location          text not null default '',
  description       text not null default '',
  status            text not null default 'draft' check (status in ('draft','open','on_hold','closed','filled')),
  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.candidates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  phone      text not null default '',
  resume_path text,
  source     text not null default 'other' check (source in ('referral','job_board','agency','walk_in','other')),
  notes      text not null default '',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id                uuid primary key default gen_random_uuid(),
  requisition_id    uuid not null references public.job_requisitions(id) on delete cascade,
  candidate_id      uuid not null references public.candidates(id) on delete cascade,
  stage             text not null default 'applied' check (stage in ('applied','screening','interview','offer','hired','rejected')),
  rating            int check (rating between 1 and 5),
  rejection_reason  text not null default '',
  offer_salary      numeric,
  offer_start_date  date,
  offer_status      text not null default 'none' check (offer_status in ('none','draft','sent','accepted','declined','withdrawn')),
  hired_profile_id  uuid references public.profiles(id) on delete set null,
  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.interviews (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications(id) on delete cascade,
  scheduled_at    timestamptz not null,
  interviewer_id  uuid not null references public.profiles(id),
  mode            text not null default 'video' check (mode in ('onsite','video','phone')),
  outcome         text not null default 'pending' check (outcome in ('pending','strong_yes','yes','no','strong_no')),
  feedback        text not null default '',
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now()
);

create or replace function public.lifecycle_touch_updated()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists reqs_updated_at on public.job_requisitions;
create trigger reqs_updated_at before update on public.job_requisitions
  for each row execute function public.lifecycle_touch_updated();
drop trigger if exists apps_updated_at on public.applications;
create trigger apps_updated_at before update on public.applications
  for each row execute function public.lifecycle_touch_updated();

alter table public.job_requisitions enable row level security;
alter table public.candidates       enable row level security;
alter table public.applications     enable row level security;
alter table public.interviews       enable row level security;

-- job_requisitions: hr manager sees all; a hiring manager sees their own reqs
drop policy if exists "reqs_select" on public.job_requisitions;
create policy "reqs_select" on public.job_requisitions for select using (
  public.is_super_admin() or public.is_hr_manager() or hiring_manager_id = auth.uid()
);
drop policy if exists "reqs_write" on public.job_requisitions;
create policy "reqs_write" on public.job_requisitions for all using (
  public.is_super_admin() or public.is_hr_manager()
) with check (
  public.is_super_admin() or public.is_hr_manager()
);

-- candidates: hr manager, or anyone currently interviewing that candidate
drop policy if exists "candidates_select" on public.candidates;
create policy "candidates_select" on public.candidates for select using (
  public.is_super_admin() or public.is_hr_manager()
  or exists (
    select 1 from public.applications a join public.interviews i on i.application_id = a.id
    where a.candidate_id = candidates.id and i.interviewer_id = auth.uid()
  )
);
drop policy if exists "candidates_write" on public.candidates;
create policy "candidates_write" on public.candidates for all using (
  public.is_super_admin() or public.is_hr_manager()
) with check (
  public.is_super_admin() or public.is_hr_manager()
);

-- applications: hr manager, or the interviewer assigned to it
drop policy if exists "applications_select" on public.applications;
create policy "applications_select" on public.applications for select using (
  public.is_super_admin() or public.is_hr_manager()
  or exists (select 1 from public.interviews i where i.application_id = applications.id and i.interviewer_id = auth.uid())
);
drop policy if exists "applications_write" on public.applications;
create policy "applications_write" on public.applications for all using (
  public.is_super_admin() or public.is_hr_manager()
) with check (
  public.is_super_admin() or public.is_hr_manager()
);

-- interviews: hr manager full control; the assigned interviewer can see + score their own
drop policy if exists "interviews_select" on public.interviews;
create policy "interviews_select" on public.interviews for select using (
  public.is_super_admin() or public.is_hr_manager() or interviewer_id = auth.uid()
);
drop policy if exists "interviews_insert" on public.interviews;
create policy "interviews_insert" on public.interviews for insert with check (
  public.is_super_admin() or public.is_hr_manager()
);
drop policy if exists "interviews_update" on public.interviews;
create policy "interviews_update" on public.interviews for update using (
  public.is_super_admin() or public.is_hr_manager() or interviewer_id = auth.uid()
) with check (
  public.is_super_admin() or public.is_hr_manager() or interviewer_id = auth.uid()
);
drop policy if exists "interviews_delete" on public.interviews;
create policy "interviews_delete" on public.interviews for delete using (
  public.is_super_admin() or public.is_hr_manager()
);

-- ============================================================================
-- ONBOARDING / OFFBOARDING — shared checklist engine
-- ============================================================================

create table if not exists public.lifecycle_task_templates (
  id           uuid primary key default gen_random_uuid(),
  phase        text not null check (phase in ('onboarding','offboarding')),
  title        text not null,
  category     text not null default 'hr' check (category in ('hr','it','manager','finance')),
  offset_days  int not null default 0,  -- onboarding: vs start_date | offboarding: vs last_working_day
  sort_order   int not null default 0,
  active       boolean not null default true
);

create table if not exists public.exit_records (
  id                    uuid primary key default gen_random_uuid(),
  employee_id           uuid not null references public.profiles(id) on delete cascade,
  initiated_by          uuid not null references public.profiles(id),
  reason                text not null check (reason in ('resignation','termination','end_of_contract','other')),
  reason_notes          text not null default '',
  last_working_day      date not null,
  status                text not null default 'initiated' check (status in ('initiated','clearance','settled','completed')),
  unused_leave_days     numeric not null default 0,
  exit_interview_notes  text not null default '',
  rehire_eligible       boolean,
  completed_at          timestamptz,
  created_at            timestamptz not null default now()
);

create table if not exists public.lifecycle_tasks (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  phase         text not null check (phase in ('onboarding','offboarding')),
  exit_id       uuid references public.exit_records(id) on delete cascade,
  title         text not null,
  category      text not null default 'hr' check (category in ('hr','it','manager','finance')),
  due_date      date,
  status        text not null default 'pending' check (status in ('pending','done')),
  completed_by  uuid references public.profiles(id),
  completed_at  timestamptz,
  notes         text not null default '',
  created_at    timestamptz not null default now()
);

alter table public.lifecycle_task_templates enable row level security;
alter table public.exit_records              enable row level security;
alter table public.lifecycle_tasks            enable row level security;

drop policy if exists "templates_select" on public.lifecycle_task_templates;
create policy "templates_select" on public.lifecycle_task_templates for select using (
  public.is_super_admin() or public.has_hr_suite()
);
drop policy if exists "templates_write" on public.lifecycle_task_templates;
create policy "templates_write" on public.lifecycle_task_templates for all using (
  public.is_super_admin() or public.is_hr_manager()
) with check (
  public.is_super_admin() or public.is_hr_manager()
);

drop policy if exists "exits_select" on public.exit_records;
create policy "exits_select" on public.exit_records for select using (
  public.is_super_admin() or public.is_hr_manager()
  or employee_id = auth.uid() or initiated_by = auth.uid()
);
drop policy if exists "exits_write" on public.exit_records;
create policy "exits_write" on public.exit_records for all using (
  public.is_super_admin() or public.is_hr_manager()
) with check (
  public.is_super_admin() or public.is_hr_manager()
);

drop policy if exists "lifecycle_tasks_select" on public.lifecycle_tasks;
create policy "lifecycle_tasks_select" on public.lifecycle_tasks for select using (
  public.is_super_admin() or public.is_hr_manager() or employee_id = auth.uid()
);
drop policy if exists "lifecycle_tasks_write" on public.lifecycle_tasks;
create policy "lifecycle_tasks_write" on public.lifecycle_tasks for all using (
  public.is_super_admin() or public.is_hr_manager()
) with check (
  public.is_super_admin() or public.is_hr_manager()
);

-- ---- RPCs: narrow, privileged writes onto profiles ---------------------------

create or replace function public.hr_set_probation(p_employee_id uuid, p_probation_end_date date)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare result public.profiles;
begin
  if not (public.is_hr_manager() or public.is_super_admin()) then
    raise exception 'Not authorised to edit employee records';
  end if;
  update public.profiles set probation_end_date = p_probation_end_date
  where id = p_employee_id returning * into result;
  if result.id is null then raise exception 'Employee not found'; end if;
  return result;
end;
$$;
grant execute on function public.hr_set_probation(uuid, date) to authenticated;

create or replace function public.hr_confirm_employee(p_employee_id uuid)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare result public.profiles;
begin
  if not (public.is_hr_manager() or public.is_super_admin()) then
    raise exception 'Not authorised to edit employee records';
  end if;
  update public.profiles set confirmed_at = now()
  where id = p_employee_id returning * into result;
  if result.id is null then raise exception 'Employee not found'; end if;
  return result;
end;
$$;
grant execute on function public.hr_confirm_employee(uuid) to authenticated;

-- Finalize an exit: locks the record and disables the account. Only place
-- an hr-manager (who is not necessarily a super_admin) can flip account
-- status — the general profiles_update_admin policy stays super_admin-only.
create or replace function public.hr_finalize_exit(p_exit_id uuid)
returns public.exit_records language plpgsql security definer set search_path = public as $$
declare result public.exit_records;
begin
  if not (public.is_hr_manager() or public.is_super_admin()) then
    raise exception 'Not authorised to finalize exits';
  end if;
  update public.exit_records set status = 'completed', completed_at = now()
  where id = p_exit_id returning * into result;
  if result.id is null then raise exception 'Exit record not found'; end if;
  update public.profiles set status = 'disabled' where id = result.employee_id;
  return result;
end;
$$;
grant execute on function public.hr_finalize_exit(uuid) to authenticated;

-- ---- Seed: starter checklist templates ---------------------------------------
insert into public.lifecycle_task_templates (phase, title, category, offset_days, sort_order) values
  ('onboarding', 'Send offer & employment contract',        'hr',      -7, 1),
  ('onboarding', 'Collect ID, bank details & statutory numbers', 'hr', -3, 2),
  ('onboarding', 'Provision email & system access',          'it',      0, 3),
  ('onboarding', 'Issue laptop / equipment',                 'it',      0, 4),
  ('onboarding', 'Day-one welcome & induction',               'hr',      0, 5),
  ('onboarding', 'Introduce to team & assign buddy',          'manager', 1, 6),
  ('onboarding', 'Set 30-day goals',                          'manager', 7, 7),
  ('onboarding', 'Probation check-in',                        'manager', 45, 8),
  ('offboarding','Manager handover of open work',             'manager', -5, 1),
  ('offboarding','Return laptop & equipment',                 'it',       0, 2),
  ('offboarding','Revoke system & email access',              'it',       0, 3),
  ('offboarding','Calculate final settlement & unused leave', 'finance',  0, 4),
  ('offboarding','Exit interview',                            'hr',      -1, 5)
on conflict do nothing;

-- ---- Storage: candidate resumes ----------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('candidate-resumes', 'candidate-resumes', false, 10485760)
on conflict do nothing;

drop policy if exists "resumes_all" on storage.objects;
create policy "resumes_all" on storage.objects
  for all to authenticated
  using  (bucket_id = 'candidate-resumes')
  with check (bucket_id = 'candidate-resumes');
