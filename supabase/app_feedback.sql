-- ============================================================================
-- Collarone — REAL in-app feedback from real customers (operator direction:
-- insight must come from real usage, not only demos). A logged-in user rates
-- the suite they're in and writes what should improve; Platform Control
-- reads it with the org and person attached. Run after demo_suites.sql.
-- Idempotent.
-- ============================================================================
create table if not exists public.app_feedback (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  suite_key  text not null,
  rating     int not null check (rating between 1 and 5),
  comment    text not null default '' check (char_length(comment) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists app_feedback_suite_idx on public.app_feedback (suite_key, created_at desc);
alter table public.app_feedback enable row level security;
drop policy if exists "app_feedback_insert" on public.app_feedback;
create policy "app_feedback_insert" on public.app_feedback for insert with check (
  public.same_org(org_id) and user_id = auth.uid()
);
drop policy if exists "app_feedback_select" on public.app_feedback;
create policy "app_feedback_select" on public.app_feedback for select using (public.is_platform_admin());
