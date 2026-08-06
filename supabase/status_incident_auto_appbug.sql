-- ============================================================================
-- App-level incidents record THEMSELVES. Idempotent.
--
-- The July Admin->Users crash had to be hand-written into status_incidents
-- (status_incident_app_bug.sql), so the 03 Aug stale-chunk flood — 161
-- browser crashes — never appeared in Incident history at all and the page
-- kept saying fully healthy. Two fixes here, plus one backfill:
--
-- 1. The status_checks trigger closed "the most recent open incident" of ANY
--    kind on a healthy server check — which would instantly close an open
--    app_bug incident (the server being up is exactly the situation an
--    app_bug describes). It now only closes server-kind incidents.
--
-- 2. /api/health now opens an app_bug incident when client_errors crosses
--    the degraded threshold and closes it when the rate drops (service-role
--    writes; RLS on this table has no client write path). This file is the
--    schema-side guarantee the trigger won't fight it.
--
-- 3. Backfill: the 03 Aug flood becomes an honest history entry, same as the
--    July one. Started at the first burst, resolved when the nginx
--    cache-header fix went live on 05 Aug.
-- ============================================================================

create or replace function public.log_status_incident()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_open public.status_incidents;
  v_kind text;
begin
  if new.api_ok and new.db_ok then
    -- Healthy SERVER check: close the most recent open SERVER incident.
    -- app_bug incidents are opened/closed by /api/health from the
    -- client_errors rate — a healthy server says nothing about them.
    select * into v_open from public.status_incidents
      where resolved_at is null and kind <> 'app_bug'
      order by started_at desc limit 1;
    if v_open.id is not null then
      update public.status_incidents
      set resolved_at = new.checked_at, duration_sec = extract(epoch from (new.checked_at - v_open.started_at))::int
      where id = v_open.id;
    end if;
  else
    v_kind := case when not new.db_ok then 'db_down' when not new.api_ok then 'api_down' else 'degraded' end;
    select * into v_open from public.status_incidents
      where resolved_at is null and kind <> 'app_bug'
      order by started_at desc limit 1;
    if v_open.id is null then
      insert into public.status_incidents (kind, started_at) values (v_kind, new.checked_at);
    end if;
  end if;
  return new;
end;
$$;

-- Backfill the 03 Aug stale-chunk flood so history stops lying by omission.
insert into public.status_incidents (kind, started_at, resolved_at, duration_sec, notes)
select
  'app_bug',
  '2026-08-03T09:16:00+01:00'::timestamptz,
  '2026-08-05T13:30:00+01:00'::timestamptz,
  extract(epoch from ('2026-08-05T13:30:00+01:00'::timestamptz - '2026-08-03T09:16:00+01:00'::timestamptz))::int,
  'Browsers holding an outdated copy of the app kept requesting files that no longer existed after a deploy, producing script errors (161 occurrences at peak). Servers and customer data were unaffected throughout. Fixed by correcting how the app page is cached so browsers always fetch the current version, plus an automatic one-time reload guard in the app itself. Error spikes now open an incident here automatically.'
where not exists (
  select 1 from public.status_incidents
  where kind = 'app_bug' and started_at = '2026-08-03T09:16:00+01:00'::timestamptz
);
