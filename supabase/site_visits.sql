-- ============================================================================
-- Collarone — per-site visitor tracking for customer websites. Same
-- anonymous shape as the platform's page_views (page, country, timestamp —
-- no IPs, no cookies), but org-scoped: each business sees its own site's
-- traffic in the Website builder's Insights tab. Written only by
-- client/api/track.js via the service role (it reads Vercel's geo header);
-- read by the org itself under RLS.
-- ============================================================================

create table if not exists public.site_visits (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  page       text not null default 'home',
  country    text not null default 'XX',
  created_at timestamptz not null default now()
);

create index if not exists site_visits_org_time_idx on public.site_visits (org_id, created_at desc);

alter table public.site_visits enable row level security;

drop policy if exists site_visits_org_read on public.site_visits;
create policy site_visits_org_read on public.site_visits
  for select using (public.same_org(org_id) or public.is_platform_admin());
-- no anon/authenticated insert policy: service-role writes only
