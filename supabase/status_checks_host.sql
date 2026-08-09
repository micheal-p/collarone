-- ============================================================================
-- Collarone — record WHICH deployment a health check came from
--
-- The public status page was building its uptime history from a monitor that
-- was pinging the wrong host.
--
-- The scheduled check in .github/workflows/status-ping.yml called
-- collarone.vercel.app. Production has since moved to the VPS behind
-- collarone.app. Both deployments talk to THIS database, and status_checks had
-- no host column, so every ping to the stale Vercel build was recorded as
-- ordinary uptime for the live product. Verified at the time of writing:
--
--   collarone.app        → build 8b82b4e-202608092259   (live)
--   collarone.vercel.app → build "dev"                  (stale)
--
-- That is worse than having no monitor. A monitor that is silent during an
-- outage merely fails to help; this one was actively publishing "operational"
-- for a host nobody uses, so the status page would have shown a green line
-- straight through a real outage.
--
-- Recording the host makes the mistake impossible to repeat quietly: a check
-- is now attributable, and uptime can be computed for the host that actually
-- serves customers.
--
-- Idempotent; safe to re-run.
-- ============================================================================

alter table public.status_checks
  add column if not exists host text not null default 'unknown';

-- Existing rows genuinely cannot be attributed — they predate the column and
-- came from either deployment. Left as 'unknown' rather than guessed, so the
-- uptime figure is honest about what it does not know.
create index if not exists status_checks_host_time on public.status_checks (host, checked_at desc);

comment on column public.status_checks.host is
  'The hostname that served this check. Uptime for the live product must filter on the production host — rows from a stale deployment are not evidence that customers could reach anything.';
