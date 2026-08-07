-- ============================================================================
-- Backfill: the signup-failure incident of 5–7 Aug. Idempotent.
--
-- A leftover auth-identity fragment (from a raw test-data cleanup on 5 Aug)
-- made account creation fail with an unhelpful error for any affected email —
-- discovered when a real founder-adjacent signup failed four times on the
-- morning of the 7th, traced via the new signup failure records, and fixed by
-- removing the fragment (verified by re-running the exact failing signup).
-- Those days showed serene green "100% healthy" tooltips while it happened.
-- Partial impact: signups for affected accounts, everything else unaffected.
-- ============================================================================

insert into public.status_incidents (kind, started_at, resolved_at, duration_sec, impact, notes)
select
  'app_bug',
  '2026-08-05T13:00:00+01:00'::timestamptz,
  '2026-08-07T13:35:00+01:00'::timestamptz,
  extract(epoch from ('2026-08-07T13:35:00+01:00'::timestamptz - '2026-08-05T13:00:00+01:00'::timestamptz))::int,
  0.25,
  'Creating a new workspace failed with an unhelpful error for affected email addresses, caused by a leftover fragment in the authentication store after a maintenance cleanup. Signups for unaffected addresses and every existing workspace worked normally throughout. Found via the automatic signup-failure records, fixed by removing the fragment, and verified by re-running the exact failing signup successfully. The start time is the approximate time of the cleanup that caused it.'
where not exists (
  select 1 from public.status_incidents
  where kind = 'app_bug' and started_at = '2026-08-05T13:00:00+01:00'::timestamptz
);
