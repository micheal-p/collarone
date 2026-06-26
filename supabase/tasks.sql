-- ============================================================================
-- Org-Ops ERP — Tasks & Reports
-- RBAC: staff(member) → own queue | staff(manager/supervisor) → dept queue |
--        manager(system role) → dept KPIs | super_admin → all
-- Run in Supabase SQL Editor after departments.sql.
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---- Helpers ---------------------------------------------------------------

-- True if the caller has the tasks suite with role='manager' (supervisor tier)
create or replace function public.is_tasks_supervisor()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and suites @> '[{"key":"tasks","role":"manager"}]'::jsonb
  );
$$;

-- True if the caller's system role is 'manager' (KPI / strategy tier)
create or replace function public.is_dept_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'manager'
  );
$$;

grant execute on function public.is_tasks_supervisor() to authenticated;
grant execute on function public.is_dept_manager()     to authenticated;

-- ---- Tables ----------------------------------------------------------------

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text not null default '',
  department_id int references public.departments(id) on delete set null,
  assigned_to   uuid references public.profiles(id) on delete set null,
  created_by    uuid not null references public.profiles(id) on delete cascade,
  priority      text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  status        text not null default 'todo'   check (status in ('todo','in_progress','in_review','done','cancelled')),
  due_date      date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

-- Auto-bump updated_at
create or replace function public.tasks_touch_updated()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.tasks_touch_updated();

-- ---- Row-Level Security ----------------------------------------------------

alter table public.tasks         enable row level security;
alter table public.task_comments enable row level security;

-- tasks SELECT:
--   • super_admin → all
--   • dept manager (system role) → their department
--   • tasks supervisor (suite role=manager) → their department
--   • staff member → only tasks assigned to them
drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks for select using (
  public.is_super_admin()
  or assigned_to = auth.uid()
  or (
    (public.is_tasks_supervisor() or public.is_dept_manager())
    and department_id = (select department_id from public.profiles where id = auth.uid())
  )
);

-- tasks INSERT: any authenticated user with tasks suite access can create
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks for insert with check (
  public.is_super_admin()
  or exists (
    select 1 from public.profiles
    where id = auth.uid()
      and suites @> '[{"key":"tasks"}]'::jsonb  -- has tasks suite (any role)
  )
);

-- tasks UPDATE:
--   • super_admin + supervisors → full update (assign, reprioritise, etc.)
--   • the assigned person → can only move their own task status
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks for update using (
  public.is_super_admin()
  or public.is_tasks_supervisor()
  or assigned_to = auth.uid()
) with check (
  public.is_super_admin()
  or public.is_tasks_supervisor()
  or assigned_to = auth.uid()
);

-- tasks DELETE: supervisors + admin only
drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks for delete using (
  public.is_super_admin() or public.is_tasks_supervisor()
);

-- task_comments: author or dept supervisor can see; author can delete own
drop policy if exists "comments_select" on public.task_comments;
create policy "comments_select" on public.task_comments for select using (
  author_id = auth.uid()
  or public.is_super_admin()
  or public.is_tasks_supervisor()
  or exists (
    select 1 from public.tasks t
    where t.id = task_id and t.assigned_to = auth.uid()
  )
);

drop policy if exists "comments_insert" on public.task_comments;
create policy "comments_insert" on public.task_comments for insert with check (
  author_id = auth.uid()
);

drop policy if exists "comments_delete" on public.task_comments;
create policy "comments_delete" on public.task_comments for delete using (
  author_id = auth.uid() or public.is_super_admin()
);

-- ---- KPI RPC (manager dashboard) ------------------------------------------
create or replace function public.get_task_stats(p_dept_id int default null)
returns table (
  status        text,
  priority      text,
  count         bigint
) language sql security definer stable set search_path = public as $$
  select t.status, t.priority, count(*) as count
  from public.tasks t
  where
    case
      when p_dept_id is not null then t.department_id = p_dept_id
      else true
    end
  group by t.status, t.priority
  order by t.status, t.priority;
$$;

grant execute on function public.get_task_stats(int) to authenticated;

-- ---- Seed ------------------------------------------------------------------
-- Grab the System Admin profile id for created_by
do $$
declare
  admin_id  uuid;
  dept_it   int;
  dept_hr   int;
  dept_fin  int;
begin
  select id into admin_id from public.profiles where role = 'super_admin' limit 1;
  select id into dept_it  from public.departments where code = 'IT'       limit 1;
  select id into dept_hr  from public.departments where code = 'HR'       limit 1;
  select id into dept_fin from public.departments where code = 'FINANCE'  limit 1;

  if admin_id is null then return; end if;

  insert into public.tasks (title, description, department_id, created_by, priority, status, due_date) values
    ('Set up employee onboarding checklist',   'Create a standard checklist for new hires joining any department.',          dept_hr,  admin_id, 'high',   'todo',        current_date + 7),
    ('Migrate file server to SharePoint',      'Move all legacy shared drives to the new SharePoint tenant.',               dept_it,  admin_id, 'urgent', 'in_progress', current_date + 14),
    ('Q3 budget reconciliation',               'Reconcile all departmental spend against approved Q3 budget lines.',        dept_fin, admin_id, 'high',   'in_progress', current_date + 5),
    ('Update IT asset register',               'Audit all laptops, monitors and peripherals. Update the asset register.',   dept_it,  admin_id, 'medium', 'todo',        current_date + 21),
    ('Review HR leave policy document',        'Update leave policy to reflect 2026 statutory changes.',                   dept_hr,  admin_id, 'medium', 'todo',        current_date + 10),
    ('Vendor invoice reconciliation — June',   'Match all June vendor invoices to approved purchase orders.',              dept_fin, admin_id, 'low',    'done',        current_date - 2)
  on conflict do nothing;
end;
$$;
