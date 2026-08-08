-- Turn the notifications on.
--
-- notification_outbox has existed since the billing work, complete with
-- dedupe keys and a drain in the health cron — but almost nothing ever wrote
-- to it. So the product computed everything it needed to tell people and then
-- told nobody: a task assigned to you sat there until you happened to look, a
-- leave request waited on an approver who did not know it existed, and the
-- decision came back to an employee who had to keep checking.
--
-- These three are the "someone is waiting on you" class. They are the ones
-- where silence actually stops work, as distinct from the automation checks
-- (expiring documents, low stock) which are reminders and already surface as
-- banners.
--
-- Delivery is deliberately not this file's problem. A trigger writes a row;
-- the health cron drains it through the shared sender, which today is Resend
-- and becomes Twilio SendGrid the moment SENDGRID_API_KEY exists. Until a key
-- is set, rows are written and marked skipped — so switching email on does not
-- unleash a backlog of stale news, which is the mistake worth avoiding.

alter table public.notification_outbox add column if not exists body text;
alter table public.notification_outbox add column if not exists recipient_id uuid references public.profiles(id) on delete cascade;

-- One helper so the three triggers below stay short and consistent.
create or replace function public.queue_notification(
  p_org uuid, p_kind text, p_dedupe text, p_recipient uuid, p_subject text, p_body text
) returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if p_recipient is null then return; end if;
  select email into v_email from public.profiles where id = p_recipient;
  if v_email is null then return; end if;
  insert into public.notification_outbox (org_id, kind, dedupe_key, recipient_id, email_to, subject, body, channels)
  values (p_org, p_kind, p_dedupe, p_recipient, v_email, p_subject, p_body, '["email","banner"]'::jsonb)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- ---- 1. a task assigned to you ---------------------------------------------
-- Fires on assignment and on RE-assignment, but never when the same person is
-- simply edited — being told twice about a task you already have is how people
-- learn to ignore notifications.
create or replace function public.notify_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor text;
begin
  if new.assigned_to is null then return new; end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then return new; end if;
  if new.assigned_to = auth.uid() then return new; end if;  -- you assigned it to yourself

  select name into v_actor from public.profiles where id = auth.uid();
  perform public.queue_notification(
    new.org_id, 'task_assigned',
    'task:' || new.id || ':assigned:' || new.assigned_to,
    new.assigned_to,
    'A task was assigned to you: ' || left(new.title, 90),
    coalesce(v_actor, 'Someone') || ' assigned you "' || new.title || '"'
      || case when new.due_date is not null then ', due ' || to_char(new.due_date, 'DD Mon YYYY') else '' end
      || '. Open Task & Report in your workspace to see it.'
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_task_assigned on public.tasks;
create trigger trg_notify_task_assigned
  after insert or update of assigned_to on public.tasks
  for each row execute function public.notify_task_assigned();

-- ---- 2. a leave request needs deciding --------------------------------------
-- Goes to the requester's manager if they have one, otherwise the owner. A
-- request nobody knows about is the single most common reason leave sits
-- unanswered for a week.
create or replace function public.notify_leave_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_approver uuid; v_who text;
begin
  if new.status <> 'pending' then return new; end if;
  select manager_id, name into v_approver, v_who from public.profiles where id = new.user_id;
  if v_approver is null then
    select id into v_approver from public.profiles
     where org_id = new.org_id and role = 'super_admin' and status = 'active' limit 1;
  end if;

  perform public.queue_notification(
    new.org_id, 'leave_submitted',
    'leave:' || new.id || ':submitted',
    v_approver,
    'Leave request from ' || coalesce(v_who, 'a team member'),
    coalesce(v_who, 'A team member') || ' has requested leave from '
      || to_char(new.start_date, 'DD Mon') || ' to ' || to_char(new.end_date, 'DD Mon YYYY')
      || '. Open Leave in your workspace to approve or decline it.'
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_leave_submitted on public.leave_requests;
create trigger trg_notify_leave_submitted
  after insert on public.leave_requests
  for each row execute function public.notify_leave_submitted();

-- ---- 3. your leave was decided ----------------------------------------------
-- Includes the reason, because a decision without one is how resentment
-- starts — the field is already captured and was never surfaced.
create or replace function public.notify_leave_decided()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status not in ('approved', 'rejected') then return new; end if;
  if new.status is not distinct from old.status then return new; end if;

  perform public.queue_notification(
    new.org_id, 'leave_decided',
    'leave:' || new.id || ':' || new.status,
    new.user_id,
    'Your leave request was ' || new.status,
    'Your leave from ' || to_char(new.start_date, 'DD Mon') || ' to ' || to_char(new.end_date, 'DD Mon YYYY')
      || ' was ' || new.status || '.'
      || case when coalesce(new.decision_comment, '') <> ''
              then ' Reason given: ' || new.decision_comment else '' end
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_leave_decided on public.leave_requests;
create trigger trg_notify_leave_decided
  after update of status on public.leave_requests
  for each row execute function public.notify_leave_decided();

grant execute on function public.queue_notification(uuid, text, text, uuid, text, text) to authenticated, service_role;
