-- ============================================================================
-- The watchdog: the platform examines ITSELF every 30 minutes. Idempotent.
--
-- Born from a week of humans discovering problems the system already knew
-- about: a poisoned email failing signups four times, deploys dying for an
-- afternoon, stale shifts haunting boards — all invisible until a founder
-- happened to look. The watchdog looks on a clock, records findings, and the
-- health endpoint carries them, so silence itself becomes detectable.
--
-- The runner lives in server/index.js (a 30-min interval in the long-lived
-- Express process) calling /api/watchdog. Findings land here + client_errors.
-- ============================================================================

create table if not exists public.watchdog_runs (
  id             uuid primary key default gen_random_uuid(),
  ran_at         timestamptz not null default now(),
  findings       jsonb not null default '[]'::jsonb,
  findings_count int not null default 0
);
create index if not exists watchdog_runs_ran_idx on public.watchdog_runs (ran_at desc);
alter table public.watchdog_runs enable row level security;
drop policy if exists "watchdog_runs_platform_read" on public.watchdog_runs;
create policy "watchdog_runs_platform_read" on public.watchdog_runs
  for select using (public.is_platform_admin());
-- Writes: service role only (no client policies).

-- ---- auth-schema probes (PostgREST can't see auth.*, so these bridge) -------

-- The exact class that poisoned Dominion's email: an identity whose user is
-- gone. Zero is the only healthy number.
create or replace function public.watchdog_dangling_identities()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from auth.identities i
  where not exists (select 1 from auth.users u where u.id = i.user_id);
$$;
revoke execute on function public.watchdog_dangling_identities() from authenticated, anon, public;
grant execute on function public.watchdog_dangling_identities() to service_role;

-- Auth users with no profile (excluding legitimate job-poster stubs): a
-- half-finished signup that will tell its owner "already registered".
create or replace function public.watchdog_orphan_users()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from auth.users u
  where not exists (select 1 from public.profiles p where p.id = u.id)
    and coalesce(u.raw_user_meta_data->>'poster', 'false') <> 'true'
    and u.created_at < now() - interval '15 minutes';  -- grace for in-flight signups
$$;
revoke execute on function public.watchdog_orphan_users() from authenticated, anon, public;
grant execute on function public.watchdog_orphan_users() to service_role;

-- ---- global auto-close ------------------------------------------------------
-- The lazy per-org auto-close only fires when someone opens the suite; the
-- watchdog closes stale shifts for EVERY org on the clock, so a quiet
-- company's timesheet heals too. Same 20-hour age rule and provisional flag.
create or replace function public.watchdog_autoclose_all()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record; s public.attendance_settings; v_close timestamptz; n int := 0;
begin
  for r in
    select ar.id, ar.org_id, ar.clock_in_at from public.attendance_records ar
    where ar.clock_out_at is null and ar.clock_in_at < now() - interval '20 hours'
  loop
    select * into s from public.attendance_settings where org_id = r.org_id;
    v_close := ((r.clock_in_at at time zone 'Africa/Lagos')::date
                + coalesce(s.work_close, '17:00'::time)) at time zone 'Africa/Lagos';
    if v_close <= r.clock_in_at then v_close := r.clock_in_at + interval '8 hours'; end if;
    update public.attendance_records set clock_out_at = v_close, auto_closed = true where id = r.id;
    n := n + 1;
  end loop;
  return n;
end; $$;
revoke execute on function public.watchdog_autoclose_all() from authenticated, anon, public;
grant execute on function public.watchdog_autoclose_all() to service_role;
