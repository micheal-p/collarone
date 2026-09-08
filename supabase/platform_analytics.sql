-- ============================================================================
-- Collarone — visitor analytics aggregated in the database, for Platform Control
-- Run AFTER page_views.sql. Idempotent.
-- ============================================================================
--
-- THE BUG THIS FIXES
--
-- The analytics page fetched raw page_views rows through PostgREST and counted
-- them in the browser, asking for .limit(20000). Supabase caps every API
-- response at 1,000 rows, so once the site passed a thousand visits in 90 days
-- the page silently showed only the newest thousand — while Cloudflare was
-- reporting 10,000+ page views for the same period. Same shape as the status
-- page bug fixed in status_daily.sql: never derive a window from a LIMITed
-- sample. Aggregate in SQL; ship totals, not rows.
--
-- WHAT IS NEW IN THE BEACON
--
-- Three anonymous dimensions per page view, none of which identify a person:
--   device    phone | tablet | desktop | bot, classified from the user agent by
--             client/api/_lib/visitorSignals.js. The UA string itself is NOT
--             stored. 'bot' is kept, not dropped, because it is the honest
--             explanation of why Cloudflare's count and ours differ.
--   referrer  the host a visit STARTED from (google.com, linkedin.com, ...),
--             sent by the browser once per page load and never for in-app
--             navigation. Internal hosts are discarded server-side.
--   city      Cloudflare's cf-ipcity, present only when the "Add visitor
--             location headers" managed transform is on for the zone. Null
--             otherwise. Still no IP is stored anywhere.

alter table public.page_views add column if not exists device   text;
alter table public.page_views add column if not exists referrer text;
alter table public.page_views add column if not exists city     text;

-- One call, one JSON document, every panel on the analytics page. p_days
-- bounds the breakdowns and the daily series; the totals block always carries
-- the fixed windows the KPI tiles show, plus the previous period for a delta.
create or replace function public.platform_analytics_summary(p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  d      int := least(greatest(coalesce(p_days, 30), 1), 400);
  since  timestamptz := now() - (d || ' days')::interval;
  before timestamptz := now() - ((d * 2) || ' days')::interval;
  result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform Control only' using errcode = '42501';
  end if;

  with v as (
    select path, country, created_at, device, referrer, city
    from public.page_views
    where path not like '/platform-admin%'
  )
  select jsonb_build_object(
    'days', d,
    'first_seen', (select min(created_at) from v),
    'totals', jsonb_build_object(
      'all',    (select count(*) from v),
      'd1',     (select count(*) from v where created_at >= now() - interval '1 day'),
      'd7',     (select count(*) from v where created_at >= now() - interval '7 days'),
      'd30',    (select count(*) from v where created_at >= now() - interval '30 days'),
      'd90',    (select count(*) from v where created_at >= now() - interval '90 days'),
      'window', (select count(*) from v where created_at >= since),
      'prev',   (select count(*) from v where created_at >= before and created_at < since),
      'unknown_country', (select count(*) from v where created_at >= since and country = 'XX')
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'views', views) order by day)
      from (
        select date_trunc('day', created_at)::date as day, count(*)::int as views
        from v where created_at >= since group by 1
      ) x
    ), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object('code', country, 'views', views) order by views desc)
      from (
        select country, count(*)::int as views
        from v where created_at >= since and country <> 'XX'
        group by 1 order by 2 desc limit 12
      ) x
    ), '[]'::jsonb),
    'cities', coalesce((
      select jsonb_agg(jsonb_build_object('city', city, 'code', country, 'views', views) order by views desc)
      from (
        select city, country, count(*)::int as views
        from v where created_at >= since and city is not null
        group by 1, 2 order by 3 desc limit 10
      ) x
    ), '[]'::jsonb),
    'paths', coalesce((
      select jsonb_agg(jsonb_build_object('path', path, 'views', views) order by views desc)
      from (
        select path, count(*)::int as views
        from v where created_at >= since
        group by 1 order by 2 desc limit 10
      ) x
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('device', coalesce(device, 'unknown'), 'views', views) order by views desc)
      from (
        select device, count(*)::int as views
        from v where created_at >= since
        group by 1
      ) x
    ), '[]'::jsonb),
    'referrers', coalesce((
      select jsonb_agg(jsonb_build_object('host', referrer, 'views', views) order by views desc)
      from (
        select referrer, count(*)::int as views
        from v where created_at >= since and referrer is not null
        group by 1 order by 2 desc limit 10
      ) x
    ), '[]'::jsonb),
    'direct', (select count(*) from v where created_at >= since and referrer is null and device is not null)
  ) into result;

  return result;
end;
$$;

revoke execute on function public.platform_analytics_summary(int) from public, anon;
grant execute on function public.platform_analytics_summary(int) to authenticated;

-- The rail's badge numbers: what is waiting on the operator, in one round trip
-- instead of six list fetches on every page of Platform Control.
create or replace function public.platform_counts()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case when public.is_platform_admin() then jsonb_build_object(
    'organizations',    (select count(*) from public.organizations),
    'pending_payments', (select count(*) from public.billing_transactions where status = 'pending'),
    'inbox_new',        (select count(*) from public.platform_contact_messages where status = 'new'),
    'errors_open',      (select count(*) from public.client_errors where resolved_at is null and occurred_at >= now() - interval '7 days'),
    'tickets_open',     (select count(*) from public.support_tickets where status = 'open'),
    'posters_pending',  (select count(*) from public.job_posters where status = 'pending')
  ) else null end;
$$;

revoke execute on function public.platform_counts() from public, anon;
grant execute on function public.platform_counts() to authenticated;
