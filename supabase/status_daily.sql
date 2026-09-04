-- ============================================================================
-- Collarone — per-day status roll-up for the public status page
-- Run AFTER the status_checks table exists. Idempotent.
-- ============================================================================
--
-- THE BUG THIS FIXES
--
-- /status fetched the newest 500 raw status_checks rows and grouped them in the
-- browser. How much HISTORY that covers depends entirely on how densely checks
-- were recorded, which nobody controls: health.js logs opportunistically on page
-- loads (throttled to one per five minutes) on top of the scheduled ping. On
-- 2026-09-04 the newest 500 rows reached back only to 16 August — twenty days —
-- while the table held 1,863 checks going back to 12 July.
--
-- So the public page understated the monitored record by two thirds, and it
-- would have quietly shrunk further as traffic grew. Raising the limit only
-- moves the cliff.
--
-- Aggregating in the database removes the coupling: one row per day, at most
-- p_days rows, regardless of how many checks back it. The page can then show
-- the true monitored window without shipping thousands of rows to a browser.
--
-- Deliberately callable by anon: this is the public status page, it exposes no
-- tenant data, and it takes no organisation id — only counts of whether the API
-- and database answered.
create or replace function public.public_status_daily(p_days int default 90)
returns table (day date, total int, ok int, down int)
language sql
security definer
set search_path = public
stable
as $$
  select
    date_trunc('day', checked_at)::date            as day,
    count(*)::int                                  as total,
    count(*) filter (where api_ok and db_ok)::int  as ok,
    count(*) filter (where not db_ok)::int         as down
  from public.status_checks
  where checked_at >= now() - (least(greatest(coalesce(p_days, 90), 1), 400) || ' days')::interval
  group by 1
  order by 1;
$$;

revoke execute on function public.public_status_daily(int) from public;
grant execute on function public.public_status_daily(int) to anon, authenticated;
