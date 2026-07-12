-- ============================================================================
-- Collarone — Stage 2, suite 3: Tasks goes multi-tenant
-- Run AFTER hr_multitenancy.sql / leave_multitenancy.sql. Idempotent.
--
-- org_id added to tasks/task_comments/task_reports, backfilled from the
-- creator/author's own org_id. Every policy re-scoped with same_org(). The
-- dept-scoped helpers (is_tasks_supervisor/is_dept_manager) only check the
-- caller's role, never org — same class of gap already fixed once for Leave
-- (decide_leave_request) — so every policy that leans on them here also adds
-- an explicit same_org(org_id) check, not just a department_id match (a task
-- with no department set would otherwise fall through unscoped).
-- ============================================================================

alter table public.tasks add column if not exists org_id uuid references public.organizations(id);
update public.tasks t set org_id = p.org_id from public.profiles p where p.id = t.created_by and t.org_id is null;
update public.tasks set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.tasks alter column org_id set not null;

alter table public.task_comments add column if not exists org_id uuid references public.organizations(id);
update public.task_comments c set org_id = p.org_id from public.profiles p where p.id = c.author_id and c.org_id is null;
update public.task_comments set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.task_comments alter column org_id set not null;

alter table public.task_reports add column if not exists org_id uuid references public.organizations(id);
update public.task_reports r set org_id = p.org_id from public.profiles p where p.id = r.author_id and r.org_id is null;
update public.task_reports set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.task_reports alter column org_id set not null;

-- ---- tasks --------------------------------------------------------------
drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks for select using (
  public.same_org(org_id) and (
    public.is_super_admin()
    or assigned_to = auth.uid()
    or (
      (public.is_tasks_supervisor() or public.is_dept_manager())
      and department_id = (select department_id from public.profiles where id = auth.uid())
    )
  )
);

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks for insert with check (
  public.same_org(org_id) and (
    public.is_super_admin()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and suites @> '[{"key":"tasks"}]'::jsonb
    )
  )
);

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks for update using (
  public.same_org(org_id) and (
    public.is_super_admin() or public.is_tasks_supervisor() or assigned_to = auth.uid()
  )
) with check (
  public.same_org(org_id) and (
    public.is_super_admin() or public.is_tasks_supervisor() or assigned_to = auth.uid()
  )
);

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks for delete using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_tasks_supervisor())
);

-- ---- task_comments --------------------------------------------------------
drop policy if exists "comments_select" on public.task_comments;
create policy "comments_select" on public.task_comments for select using (
  public.same_org(org_id) and (
    author_id = auth.uid()
    or public.is_super_admin()
    or public.is_tasks_supervisor()
    or exists (select 1 from public.tasks t where t.id = task_id and t.assigned_to = auth.uid())
  )
);

drop policy if exists "comments_insert" on public.task_comments;
create policy "comments_insert" on public.task_comments for insert with check (
  public.same_org(org_id) and author_id = auth.uid()
);

drop policy if exists "comments_delete" on public.task_comments;
create policy "comments_delete" on public.task_comments for delete using (
  public.same_org(org_id) and (author_id = auth.uid() or public.is_super_admin())
);

-- ---- task_reports ----------------------------------------------------------
drop policy if exists "reports_select" on public.task_reports;
create policy "reports_select" on public.task_reports for select using (
  public.same_org(org_id) and (
    public.is_super_admin()
    or public.is_tasks_supervisor()
    or author_id = auth.uid()
    or exists (select 1 from public.tasks where id = task_id and assigned_to = auth.uid())
  )
);

drop policy if exists "reports_insert" on public.task_reports;
create policy "reports_insert" on public.task_reports for insert with check (
  public.same_org(org_id) and author_id = auth.uid() and (
    public.is_super_admin()
    or public.is_tasks_supervisor()
    or exists (select 1 from public.tasks where id = task_id and assigned_to = auth.uid())
  )
);

drop policy if exists "reports_delete" on public.task_reports;
create policy "reports_delete" on public.task_reports for delete using (
  public.same_org(org_id) and (author_id = auth.uid() or public.is_super_admin())
);

-- ---- get_task_stats: org-scope on top of the existing dept-scope fix -------
create or replace function public.get_task_stats(p_dept_id int default null)
returns table(status text, priority text, count bigint)
language sql security definer stable set search_path = public as $$
  select t.status, t.priority, count(*)::bigint
  from public.tasks t
  where t.org_id = public.my_org_id()
    and case
      when public.is_super_admin() then
        p_dept_id is null or t.department_id = p_dept_id
      else
        t.department_id = (select department_id from public.profiles where id = auth.uid())
    end
  group by t.status, t.priority
  order by t.status, t.priority;
$$;
grant execute on function public.get_task_stats(int) to authenticated;

-- ---- Phase 2 whitelist: tasks joins hr + leave as safe -----------------------
create or replace function public.enforce_phase1_suite_scope() returns trigger
language plpgsql as $$
declare
  safe_suites text[] := array['hr', 'leave', 'tasks'];
begin
  if new.org_id <> '00000000-0000-0000-0000-000000000001' then
    select coalesce(jsonb_agg(g), '[]'::jsonb) into new.suites
    from jsonb_array_elements(new.suites) g
    where g->>'key' = any(safe_suites);
  end if;
  return new;
end;
$$;

-- ---- application inserts need org_id set explicitly -------------------------
-- (no default, not derivable server-side on insert — see supabaseApi.js changes:
-- POST /tasks and POST /tasks/:id/reports now stamp org_id from myOrgId().)
