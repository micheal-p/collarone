-- ============================================================================
-- Tasks: recurring + comments woken up. Run after tasks_multitenancy.sql.
-- Idempotent.
--
-- Recurring: mark a task daily/weekly/monthly and it re-raises itself as a
-- fresh 'todo' each period (same period-stamp idempotency as recurring
-- invoices; clones carry recur_source_id and never themselves recur).
--
-- Comments: task_comments existed in schema but was never wired to any UI.
-- Also FIXES its select policy — the task's CREATOR couldn't read comments on
-- a task they assigned out (only author/assignee/supervisor could). Comments
-- post through add_task_comment() so each one lands with a task.comment event
-- on the spine, aimed at the other people on the task.
-- ============================================================================
alter table public.tasks add column if not exists recur_every text check (recur_every in ('day','week','month'));
alter table public.tasks add column if not exists recur_dow int check (recur_dow between 0 and 6);
alter table public.tasks add column if not exists recur_dom int check (recur_dom between 1 and 28);
alter table public.tasks add column if not exists recur_last_period text;
alter table public.tasks add column if not exists recur_source_id uuid references public.tasks(id) on delete set null;
create index if not exists tasks_recur_idx on public.tasks (org_id) where recur_every is not null and recur_source_id is null;

drop policy if exists "comments_select" on public.task_comments;
create policy "comments_select" on public.task_comments for select using (
  public.same_org(org_id) and (
    author_id = auth.uid()
    or public.is_super_admin()
    or public.is_tasks_supervisor()
    or exists (
      select 1 from public.tasks t
      where t.id = task_id and (t.assigned_to = auth.uid() or t.created_by = auth.uid())
    )
  )
);

create or replace function public.add_task_comment(p_task uuid, p_body text)
returns public.task_comments
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org_id();
  v_me uuid := auth.uid();
  t record;
  v_name text;
  row public.task_comments;
begin
  if v_org is null or v_me is null then raise exception 'Not signed in'; end if;
  if char_length(trim(p_body)) < 1 then raise exception 'Empty comment'; end if;
  select * into t from public.tasks where id = p_task and org_id = v_org;
  if t.id is null then raise exception 'Task not found'; end if;
  if not (t.assigned_to = v_me or t.created_by = v_me
          or public.is_tasks_supervisor() or public.is_super_admin()) then
    raise exception 'Only people on this task can comment';
  end if;

  insert into public.task_comments (task_id, author_id, org_id, body)
  values (t.id, v_me, v_org, left(trim(p_body), 2000))
  returning * into row;

  select name into v_name from public.profiles where id = v_me;
  insert into public.org_events (org_id, type, actor_id, payload)
  values (v_org, 'task.comment', v_me, jsonb_build_object(
    'taskId', t.id, 'title', t.title, 'by', v_name,
    'snippet', left(trim(p_body), 120),
    'for', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select distinct u as x from unnest(array[t.assigned_to, t.created_by]) u
      where u is not null and u <> v_me) s)
  ));

  return row;
end;
$$;
grant execute on function public.add_task_comment(uuid, text) to authenticated;
