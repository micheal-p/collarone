-- ============================================================================
-- Collarone — record WHICH watchdog checks ran, not only what they found
-- Run AFTER watchdog.sql. Idempotent.
-- ============================================================================
--
-- Every watchdog check is wrapped in `try { ... } catch { /* independent */ }`.
-- That isolation is right: one broken check must not kill the other ten.
--
-- But it means a check that THREW and a check that PASSED produce exactly the
-- same result — no finding. If watchdog_geo_signal_lost errored on every run,
-- the watchdog would report zero findings and look perfectly healthy, forever.
--
-- That is the same fail-silent shape as the login guard that let a backslash
-- through, the payroll gate that skipped on an empty value, and the CI retry
-- that never executed. It was also, concretely, what stopped me verifying the
-- correctness checks after deploying them: "0 findings" could not be
-- distinguished from "all four are dead".
--
-- So each run now records the checks that actually completed and any that
-- raised. A check quietly falling out of the rotation becomes visible instead
-- of looking like good news.
alter table public.watchdog_runs
  add column if not exists checks_ran jsonb not null default '{}'::jsonb;

comment on column public.watchdog_runs.checks_ran is
  'Which checks completed and which raised, so an errored check is not indistinguishable from a clean one. Shape: {"ok": ["signup_failures", ...], "failed": [{"kind": "...", "error": "..."}]}';
