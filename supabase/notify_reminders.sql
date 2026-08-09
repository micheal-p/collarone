-- The four remaining reminders: things the product already knew and never said.
--
-- Each of these is computed and rendered somewhere in the UI today, which means
-- it only reaches a human who happens to open that tab. An expired staff ID or
-- a missed probation decision is exactly the failure HR software is bought to
-- prevent, so "it was on a screen you didn't open" is not a defence.
--
-- Unlike the first three notifications (task assigned, leave submitted, leave
-- decided) these are not events — they are DATES ARRIVING, so they cannot be
-- triggers. They run from the daily sweep, and dedupe on the date itself so a
-- daily job cannot nag daily: one message per document per expiry date.
--
-- Deliberately quiet: 14 days ahead, once. Software that reminds you every
-- morning for a fortnight gets muted, and then the one that mattered is muted
-- too.

create or replace function public.queue_expiry_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; horizon date := current_date + 14;
begin
  -- 1. Employee documents about to expire (contracts, IDs, permits).
  for r in
    select d.id, d.title, d.expiry_date, d.org_id, d.employee_id,
           coalesce(p.name, 'an employee') emp
      from public.employee_documents d
      join public.profiles p on p.id = d.employee_id
     where d.expiry_date is not null
       and d.expiry_date between current_date and horizon
       and p.status = 'active'
  loop
    perform public.queue_notification(
      r.org_id, 'document_expiring',
      'empdoc:' || r.id || ':' || r.expiry_date,
      -- To the HR manager, not the employee: renewing a work permit is HR's
      -- job, and telling the employee alone achieves nothing.
      (select id from public.profiles
        where org_id = r.org_id and status = 'active'
          and (role = 'super_admin' or suites @> '[{"key":"hr","role":"manager"}]'::jsonb)
        order by case when role = 'super_admin' then 1 else 0 end limit 1),
      r.title || ' expires ' || to_char(r.expiry_date, 'DD Mon'),
      r.emp || '''s "' || r.title || '" expires on ' || to_char(r.expiry_date, 'DD Mon YYYY')
        || '. Renew it or upload the replacement in HR → Documents.'
    );
    n := n + 1;
  end loop;

  -- 2. Training certificates about to lapse.
  for r in
    select t.id, t.title, t.certificate_expiry, t.org_id,
           coalesce(p.name, 'an employee') emp, p.id emp_id
      from public.trainings t
      join public.profiles p on p.id = t.employee_id
     where t.certificate_expiry is not null
       and t.certificate_expiry between current_date and horizon
       and p.status = 'active'
  loop
    perform public.queue_notification(
      r.org_id, 'certificate_expiring',
      'training:' || r.id || ':' || r.certificate_expiry,
      r.emp_id,   -- the person who has to re-sit it
      'Your ' || r.title || ' certificate expires ' || to_char(r.certificate_expiry, 'DD Mon'),
      'Your "' || r.title || '" certificate expires on ' || to_char(r.certificate_expiry, 'DD Mon YYYY')
        || '. Speak to HR about renewing it.'
    );
    n := n + 1;
  end loop;

  -- 3. Probation ending, decision still not made.
  for r in
    select p.id, p.name, p.org_id, p.probation_end_date
      from public.profiles p
     where p.probation_end_date is not null
       and p.confirmed_at is null
       and p.status = 'active'
       and p.probation_end_date between current_date - 7 and horizon
  loop
    perform public.queue_notification(
      r.org_id, 'probation_due',
      'probation:' || r.id || ':' || r.probation_end_date,
      (select id from public.profiles
        where org_id = r.org_id and status = 'active'
          and (role = 'super_admin' or suites @> '[{"key":"hr","role":"manager"}]'::jsonb)
        order by case when role = 'super_admin' then 1 else 0 end limit 1),
      r.name || '''s probation ends ' || to_char(r.probation_end_date, 'DD Mon'),
      r.name || '''s probation ends on ' || to_char(r.probation_end_date, 'DD Mon YYYY')
        || ' and no decision has been recorded. Confirm, extend or exit them in HR → Onboarding.'
    );
    n := n + 1;
  end loop;

  return n;
end;
$$;
revoke execute on function public.queue_expiry_reminders() from public, anon, authenticated;
grant execute on function public.queue_expiry_reminders() to service_role;

-- 4. Purchase approved — an event, so a trigger, like the first three.
create or replace function public.notify_purchase_decided()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status not in ('approved', 'rejected') then return new; end if;
  if new.status is not distinct from old.status then return new; end if;

  perform public.queue_notification(
    new.org_id, 'purchase_decided',
    'purchase:' || new.id || ':' || new.status,
    new.requested_by,
    'Your purchase request was ' || new.status,
    'Your request for "' || coalesce(new.item_description, 'an item') || '" was ' || new.status || '.'
      || case when new.status = 'approved'
              then ' You can go ahead and order it.'
              else ' Speak to whoever approves spending if you need to discuss it.' end
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_purchase_decided on public.purchase_requests;
create trigger trg_notify_purchase_decided
  after update of status on public.purchase_requests
  for each row execute function public.notify_purchase_decided();

revoke execute on function public.notify_purchase_decided() from public, anon, authenticated;
