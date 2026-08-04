-- ============================================================================
-- Fix a live authorisation bypass in add_task_comment(). Idempotent.
--
-- This is the previous function verbatim with ONE change: coalesce() around the
-- two nullable comparisons in the permission guard.
--
-- The guard read:
--
--   if not (t.assigned_to = v_me or t.created_by = v_me
--           or is_tasks_supervisor() or is_super_admin()) then
--     raise exception 'Only people on this task can comment';
--   end if;
--
-- On an UNASSIGNED task t.assigned_to is NULL, so `t.assigned_to = v_me` is
-- NULL rather than false. NULL or false or false or false is NULL, `not NULL`
-- is NULL, and an IF on NULL does not take its branch. The exception never
-- fired and execution fell straight through to the insert.
--
-- Net effect: any active member of the organisation could comment on any
-- unassigned task in it, including tasks they had nothing to do with, and the
-- comment then appeared in the thread for everyone who could see the task.
-- Confirmed against production on 2026-08-04 using a disposable second profile,
-- inside a transaction that was rolled back.
--
-- NOT cross-tenant: RLS still scoped every read and write to one organisation.
-- What it defeats is the "only people on this task" rule.
--
-- Worth looking for this shape anywhere a permission check compares against a
-- nullable column. A three-valued OR chain does not fail closed, it disables
-- the guard entirely and leaves no trace.
-- ============================================================================

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

  -- coalesce: an unassigned task must read false here, not NULL
  if not (coalesce(t.assigned_to = v_me, false)
          or coalesce(t.created_by = v_me, false)
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
