-- The host alert: tell the person their visitor has arrived.
--
-- config/suites.js has sold "front-desk check-in, host alerts, visitor logs"
-- since the suite shipped, and the host alert did not exist. Reception typed
-- the visit in and then phoned or walked upstairs anyway, which is the exact
-- job the module claimed to remove. The board's instruction was blunt and
-- correct: build it or delete the sentence.
--
-- Building it is now cheap, because notify_events.sql already established the
-- pattern — a trigger queues the message, the health cron delivers it through
-- whichever mail provider is configured. This is the third use of that path.
--
-- Fires on arrival, not on pre-registration: someone booked in for next Tuesday
-- should not be announced today.

create or replace function public.notify_host_of_visitor()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_phone text;
begin
  -- Only when the visitor is actually here.
  if tg_op = 'UPDATE' and new.checked_in_at is not distinct from old.checked_in_at then return new; end if;
  if new.checked_in_at is null then return new; end if;

  select name, phone into v_name, v_phone from public.visitors where id = new.visitor_id;

  perform public.queue_notification(
    new.org_id, 'visitor_arrived',
    'visit:' || new.id || ':arrived',
    new.host_id,
    coalesce(v_name, 'A visitor') || ' is at reception',
    coalesce(v_name, 'A visitor')
      || case when coalesce(v_phone, '') <> '' then ' (' || v_phone || ')' else '' end
      || ' has arrived to see you'
      || case when coalesce(new.purpose, '') <> '' then ' about ' || new.purpose else '' end
      || '.'
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_host_of_visitor on public.visits;
create trigger trg_notify_host_of_visitor
  after insert or update of checked_in_at on public.visits
  for each row execute function public.notify_host_of_visitor();
