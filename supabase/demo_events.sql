-- ============================================================================
-- Collarone — demo starts, so demo feedback becomes a funnel (started ->
-- responded -> would-pay) instead of a bare list. Anon insert, admin read.
-- Run after demo_suites.sql. Idempotent.
-- ============================================================================
create table if not exists public.demo_events (
  id         uuid primary key default gen_random_uuid(),
  suite_key  text not null,
  event      text not null check (event in ('started')),
  created_at timestamptz not null default now()
);
create index if not exists demo_events_suite_idx on public.demo_events (suite_key, created_at desc);
alter table public.demo_events enable row level security;
drop policy if exists "demo_events_insert" on public.demo_events;
create policy "demo_events_insert" on public.demo_events for insert to anon, authenticated with check (true);
drop policy if exists "demo_events_select" on public.demo_events;
create policy "demo_events_select" on public.demo_events for select using (public.is_platform_admin());
