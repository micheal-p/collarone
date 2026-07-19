-- ============================================================================
-- Application-level incidents on the status page.
-- The status_checks trigger only catches server/database outages — a crash
-- inside the app (a browser-side script error) never fails a health check,
-- so it has to be recorded here explicitly. First entry: the Admin -> Users
-- page crash shipped in the brand re-skin (2026-07-17) and fixed 2026-07-19.
-- ============================================================================

alter table public.status_incidents drop constraint if exists status_incidents_kind_check;
alter table public.status_incidents add constraint status_incidents_kind_check
  check (kind in ('api_down', 'db_down', 'degraded', 'app_bug'));

insert into public.status_incidents (kind, started_at, resolved_at, duration_sec, notes)
select
  'app_bug',
  '2026-07-17T11:47:39+01:00'::timestamptz,
  '2026-07-19T21:26:35+01:00'::timestamptz,
  extract(epoch from ('2026-07-19T21:26:35+01:00'::timestamptz - '2026-07-17T11:47:39+01:00'::timestamptz))::int,
  'The Admin -> Users page failed to load because of a script error introduced in a design update. Servers and customer data were unaffected throughout. Fixed and redeployed; automatic in-app error reporting has been added so issues like this are detected the moment they happen.'
where not exists (
  select 1 from public.status_incidents
  where kind = 'app_bug' and started_at = '2026-07-17T11:47:39+01:00'::timestamptz
);
