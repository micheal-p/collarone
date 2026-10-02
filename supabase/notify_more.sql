-- ============================================================================
-- Collarone — the alerts that were still missing, and a way to see them all.
-- Run after notification_outbox.sql, notify_events.sql, notify_reminders.sql,
-- procurement.sql, attendance_phase1.sql and compliance.sql. Idempotent.
--
-- 1. YOUR OWN ALERTS, IN THE BELL. Every personal alert (task assigned, leave
--    submitted and decided, probation due, purchase decided, documents and
--    certificates expiring, and the ones below) is written to
--    notification_outbox and delivered only by email. Email is not switched
--    on yet, so the drain marks them "skipped" and nobody hears a thing. The
--    bell reads org_events, which every member of the company can see, so
--    personal alerts cannot go there ("Adaeze's probation ends" is not for the
--    whole office). Each outbox row already names its recipient, so this lets
--    a person read their own rows and nobody else's, and the bell shows them.
--
-- 2. A NEW PURCHASE REQUEST tells the people who can approve it. Until now the
--    requester was told the decision, but the approver was never told there
--    was anything to decide.
--
-- 3. STILL CLOCKED IN 14 hours later: the employee is reminded once, so the
--    shift is corrected while they still remember when they left. (After 20
--    hours attendance_autoclose_stale closes it provisionally.)
--
-- 4. COMPLIANCE DEADLINES: one reminder five days before a statutory filing
--    falls due, and one if it is a day or more late, to the people who hold the
--    Compliance suite. Only for companies that use it, only for rules they
--    have not switched off, and never for a period already marked done.
-- ============================================================================

-- ---- 1. read your own alerts -----------------------------------------------
drop policy if exists "notification_outbox_own_select" on public.notification_outbox;
create policy "notification_outbox_own_select" on public.notification_outbox
  for select to authenticated
  using (recipient_id = auth.uid());
grant select on public.notification_outbox to authenticated;

create index if not exists notification_outbox_recipient_idx
  on public.notification_outbox (recipient_id, created_at desc);

-- ---- 2. a purchase request needs approving ----------------------------------
-- To every procurement manager (owners included), never to the requester
-- themselves, at most five people so a big company is not all copied in.
create or replace function public.notify_purchase_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_who text; v_to uuid;
begin
  if new.status <> 'pending' then return new; end if;
  select name into v_who from public.profiles where id = new.requested_by;
  for v_to in
    select id from public.profiles
     where org_id = new.org_id and status = 'active' and id <> new.requested_by
       and (role = 'super_admin' or suites @> '[{"key":"procurement","role":"manager"}]'::jsonb)
     order by case when role = 'super_admin' then 1 else 0 end, created_at
     limit 5
  loop
    perform public.queue_notification(
      new.org_id, 'purchase_submitted',
      'purchase:' || new.id || ':submitted:' || v_to,
      v_to,
      'Purchase request to approve: ' || left(coalesce(new.item_description, 'an item'), 80),
      coalesce(v_who, 'Someone') || ' asked to buy "' || coalesce(new.item_description, 'an item') || '"'
        || case when coalesce(new.total_cost, 0) > 0
                then ', about ₦' || to_char(round(new.total_cost), 'FM999,999,999,999') else '' end
        || '. Approve or reject it in Buying & Procurement.'
    );
  end loop;
  return new;
end;
$$;
revoke execute on function public.notify_purchase_submitted() from public, anon, authenticated;

drop trigger if exists trg_notify_purchase_submitted on public.purchase_requests;
create trigger trg_notify_purchase_submitted
  after insert on public.purchase_requests
  for each row execute function public.notify_purchase_submitted();

-- ---- 3 + 4. the daily ones ---------------------------------------------------
-- Dates arriving, not events, so they run from the same sweep that calls
-- queue_expiry_reminders (client/api/health.js), and dedupe on the date so a
-- sweep that runs often never nags more than once.
create or replace function public.queue_more_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_period text;
  v_due date;
  v_year int;
  v_month int;
  v_day int;
begin
  -- 3. Still clocked in after 14 hours.
  for r in
    select a.id, a.org_id, a.employee_id, a.clock_in_at
      from public.attendance_records a
      join public.profiles p on p.id = a.employee_id
     where a.clock_out_at is null
       and a.clock_in_at < now() - interval '14 hours'
       and a.clock_in_at > now() - interval '3 days'   -- old ones are the auto-close's job
       and p.status = 'active'
  loop
    perform public.queue_notification(
      r.org_id, 'clockout_missing',
      'clockout:' || r.id,
      r.employee_id,
      'You are still clocked in since ' || to_char(r.clock_in_at at time zone 'Africa/Lagos', 'Dy DD Mon, HH24:MI'),
      'You clocked in at ' || to_char(r.clock_in_at at time zone 'Africa/Lagos', 'HH24:MI on Dy DD Mon')
        || ' and have not clocked out. If you have left, clock out in Time & Attendance, or ask your manager to put in the time you actually left.'
    );
    n := n + 1;
  end loop;

  -- 4. Statutory deadlines, for companies that use the Compliance suite.
  for r in
    select o.id as org_id, cr.key, cr.title, cr.authority, cr.frequency, cr.due_day, cr.default_month,
           pr.annual_month, pr.annual_day, pr.start_period
      from public.organizations o
      cross join public.compliance_rules cr
      left join public.org_compliance_prefs pr on pr.org_id = o.id and pr.rule_key = cr.key
     where o.status in ('active', 'past_due', 'read_only')
       and coalesce(pr.enabled, true)
       and exists (select 1 from public.profiles h
                    where h.org_id = o.id and h.status = 'active'
                      and h.suites @> '[{"key":"compliance"}]'::jsonb)
  loop
    if r.frequency = 'monthly' then
      -- The period that falls due this month is LAST month (PAYE for
      -- September is due 10 October). Same rule as complianceApi.js.
      v_period := to_char(date_trunc('month', v_today) - interval '1 month', 'YYYY-MM');
      v_year := extract(year from v_today); v_month := extract(month from v_today);
      v_day := least(coalesce(r.due_day, 28), extract(day from (date_trunc('month', v_today) + interval '1 month - 1 day'))::int);
      v_due := make_date(v_year, v_month, v_day);
      if r.start_period is not null and v_period < r.start_period then continue; end if;
    else
      v_month := coalesce(r.annual_month, r.default_month);
      if v_month is null then continue; end if;   -- the company has not said when yet
      v_year := extract(year from v_today);
      v_period := v_year::text;
      v_day := least(coalesce(r.annual_day, r.due_day, 28),
                     extract(day from (make_date(v_year, v_month, 1) + interval '1 month - 1 day'))::int);
      v_due := make_date(v_year, v_month, v_day);
    end if;

    if exists (select 1 from public.compliance_marks m
                where m.org_id = r.org_id and m.rule_key = r.key and m.period = v_period) then
      continue;
    end if;

    if v_due between v_today and v_today + 5 or v_due between v_today - 7 and v_today - 1 then
      perform public.queue_notification(
        r.org_id, 'compliance_due',
        'compliance:' || r.org_id || ':' || r.key || ':' || v_period || ':' || case when v_due >= v_today then 'soon' else 'late' end,
        h.id,
        case when v_due >= v_today
             then r.title || ' is due ' || to_char(v_due, 'DD Mon')
             else r.title || ' was due ' || to_char(v_due, 'DD Mon') || ' and is not marked done' end,
        r.title || ' (' || r.authority || ') for ' ||
          case when r.frequency = 'monthly' then to_char(to_date(v_period, 'YYYY-MM'), 'FMMonth YYYY') else v_period end
          || case when v_due >= v_today then ' is due on ' else ' was due on ' end || to_char(v_due, 'DD Mon YYYY')
          || '. Once it is filed, mark it done in the Compliance Calendar so the reminders stop.'
      )
      from (select p.id from public.profiles p
             where p.org_id = r.org_id and p.status = 'active'
               and p.suites @> '[{"key":"compliance"}]'::jsonb
             order by case when p.suites @> '[{"key":"compliance","role":"manager"}]'::jsonb then 0 else 1 end, p.created_at
             limit 3) h;
      n := n + 1;
    end if;
  end loop;

  return n;
end;
$$;
revoke execute on function public.queue_more_reminders() from public, anon, authenticated;
grant execute on function public.queue_more_reminders() to service_role;
