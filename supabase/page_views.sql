-- ============================================================================
-- Collarone — anonymous page-view counter with geography, for the Platform
-- Admin analytics page. No PII: no IP address, no user id, no cookie/session
-- id — just a path, a country (from Vercel's edge geolocation header, read
-- server-side in client/api/track.js), and a timestamp.
-- ============================================================================

create table if not exists public.page_views (
  id         bigint generated always as identity primary key,
  path       text not null,
  country    text not null default 'XX',
  created_at timestamptz not null default now()
);

create index if not exists page_views_created_at_idx on public.page_views (created_at);

alter table public.page_views enable row level security;

-- Written only by client/api/track.js via the service role (so it can read
-- the request's geolocation header) — no insert policy needed for anon/authenticated.
-- Read only by platform admins, same gate as organizations/profiles/transactions.
drop policy if exists page_views_select_platform_admin on public.page_views;
create policy page_views_select_platform_admin on public.page_views
  for select using (is_platform_admin());
