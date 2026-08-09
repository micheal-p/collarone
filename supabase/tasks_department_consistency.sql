-- Make Task & Report agree with itself about what a supervisor can see.
--
-- NOT a cross-tenant hole. Checked against the live database first: every
-- policy on tasks, task_reports and task_comments already carries same_org()
-- (the INSERT ones in with_check rather than using, which is easy to miss).
-- No company can reach another's tasks.
--
-- The real defect is internal inconsistency, and it is the kind that quietly
-- embarrasses you in front of a customer:
--
--   tasks_select   limits a supervisor to their OWN department.
--   reports_select lets any supervisor read EVERY report in the company.
--   comments_select same.
--   tasks_update   lets any supervisor edit ANY task in the company.
--
-- So a supervisor in Logistics cannot see a Finance task, but can read the
-- progress reports written on it, read the conversation about it, and
-- reassign it. Departmental privacy that holds on the list screen and leaks
-- everywhere else is worse than none, because people trust it.
--
-- One helper defines visibility; the three policies reuse it, so they cannot
-- drift apart again.

create or replace function public.can_see_task(p_task uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task
      and public.same_org(t.org_id)
      and (
        public.is_super_admin()
        or t.assigned_to = auth.uid()
        or t.created_by = auth.uid()
        or (
          (public.is_tasks_supervisor() or public.is_dept_manager())
          and t.department_id = (select department_id from public.profiles where id = auth.uid())
        )
      )
  );
$$;
grant execute on function public.can_see_task(uuid) to authenticated;

-- Reports follow the task they belong to.
drop policy if exists "reports_select" on public.task_reports;
create policy "reports_select" on public.task_reports for select using (
  public.same_org(org_id)
  and (author_id = auth.uid() or public.can_see_task(task_id))
);

-- Comments likewise.
drop policy if exists "comments_select" on public.task_comments;
create policy "comments_select" on public.task_comments for select using (
  public.same_org(org_id)
  and (author_id = auth.uid() or public.can_see_task(task_id))
);

-- And you may only change a task you can see. The assignee keeps their own
-- task (that is how status moves), and the owner keeps everything.
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks for update using (
  public.same_org(org_id)
  and (
    public.is_super_admin()
    or assigned_to = auth.uid()
    or (
      public.is_tasks_supervisor()
      and department_id = (select department_id from public.profiles where id = auth.uid())
    )
  )
) with check (
  public.same_org(org_id)
  and (
    public.is_super_admin()
    or assigned_to = auth.uid()
    or (
      public.is_tasks_supervisor()
      and department_id = (select department_id from public.profiles where id = auth.uid())
    )
  )
);

-- ---- indexes the suite has been missing ------------------------------------
-- Every list here filters by org and one of these, and none of them were
-- indexed: fine at 50 tasks, a sequential scan at 5,000.
create index if not exists tasks_org_dept_status_idx on public.tasks (org_id, department_id, status);
create index if not exists tasks_open_assignee_idx on public.tasks (assigned_to)
  where status not in ('done', 'cancelled');
create index if not exists tasks_org_due_idx on public.tasks (org_id, due_date);
create index if not exists task_reports_task_idx on public.task_reports (task_id, created_at desc);
create index if not exists task_comments_task_idx on public.task_comments (task_id, created_at);
