-- ============================================================================
-- Incident IMPACT: how much of the service an incident actually broke.
-- Idempotent.
--
-- Availability treated every incident hour as fully down — 110 hours of
-- browser-side errors dented the number as if the platform was a black
-- screen for four days. Overstating is a lie in the other direction.
--
-- The weights are DECLARED, kind-based, and shown on the page — not invented
-- per incident, because we have no per-user telemetry to measure "73.2%" and
-- fake precision would break the page's own "not hand-typed" promise:
--   db_down / api_down  → 1.00  (full outage: nothing works)
--   degraded            → 0.50  (major: slow or partially failing for many)
--   app_bug             → 0.25  (partial: a feature or subset of users)
-- Availability subtracts duration × impact per incident.
-- ============================================================================

alter table public.status_incidents
  add column if not exists impact numeric not null default 0.25
  check (impact > 0 and impact <= 1);

update public.status_incidents set impact = case kind
  when 'db_down' then 1.0
  when 'api_down' then 1.0
  when 'degraded' then 0.5
  else 0.25
end
where impact = 0.25 and kind <> 'app_bug';

-- Server-check incidents open at full/major impact from birth.
create or replace function public.log_status_incident()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_open public.status_incidents;
  v_kind text;
begin
  if new.api_ok and new.db_ok then
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
      insert into public.status_incidents (kind, started_at, impact)
      values (v_kind, new.checked_at, case v_kind when 'degraded' then 0.5 else 1.0 end);
    end if;
  end if;
  return new;
end;
$$;
