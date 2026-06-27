-- ============================================================================
-- Org-Ops ERP — Task Reports & Attachments
-- Fixes: stats RPC dept-scoping; adds task_reports table + storage bucket.
-- Run after tasks.sql. Idempotent.
-- ============================================================================

-- Fix get_task_stats: security definer was returning all tasks regardless of
-- department. Now auto-scopes to caller's dept; super_admin still sees all.
create or replace function public.get_task_stats(p_dept_id int default null)
returns table(status text, priority text, count bigint)
language sql security definer stable set search_path = public as $$
  select t.status, t.priority, count(*)::bigint
  from public.tasks t
  where case
    when public.is_super_admin() then
      p_dept_id is null or t.department_id = p_dept_id
    else
      t.department_id = (select department_id from public.profiles where id = auth.uid())
  end
  group by t.status, t.priority
  order by t.status, t.priority;
$$;
grant execute on function public.get_task_stats(int) to authenticated;

-- ---- Task reports -----------------------------------------------------------

create table if not exists public.task_reports (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null,
  attachments jsonb not null default '[]',  -- [{name, path, size}]
  created_at  timestamptz not null default now()
);

alter table public.task_reports enable row level security;

drop policy if exists "reports_select" on public.task_reports;
create policy "reports_select" on public.task_reports for select using (
  public.is_super_admin()
  or public.is_tasks_supervisor()
  or author_id = auth.uid()
  or exists (select 1 from public.tasks where id = task_id and assigned_to = auth.uid())
);

drop policy if exists "reports_insert" on public.task_reports;
create policy "reports_insert" on public.task_reports for insert with check (
  author_id = auth.uid() and (
    public.is_super_admin()
    or public.is_tasks_supervisor()
    or exists (select 1 from public.tasks where id = task_id and assigned_to = auth.uid())
  )
);

drop policy if exists "reports_delete" on public.task_reports;
create policy "reports_delete" on public.task_reports for delete using (
  author_id = auth.uid() or public.is_super_admin()
);

-- ---- Storage bucket ---------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('task-attachments', 'task-attachments', false, 10485760)  -- 10 MB cap
on conflict do nothing;

drop policy if exists "task_attach_all" on storage.objects;
create policy "task_attach_all" on storage.objects
  for all to authenticated
  using  (bucket_id = 'task-attachments')
  with check (bucket_id = 'task-attachments');
