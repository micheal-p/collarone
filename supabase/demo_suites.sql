-- ============================================================================
-- Collarone — public suite demos (operator idea, 2026-07-22): a prospect can
-- try a suite in a sandboxed demo with a guided tour BEFORE paying, and
-- leaves a quick experience questionnaire after. The platform admin decides
-- which suites are demo-ready. Idempotent.
-- ============================================================================

-- which suites are open for public demo — anon-readable (the landing shows
-- "Try it" buttons from this), platform-admin managed.
create table if not exists public.platform_demo_suites (
  suite_key  text primary key,
  enabled    boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.platform_demo_suites enable row level security;
drop policy if exists "platform_demo_suites_select" on public.platform_demo_suites;
create policy "platform_demo_suites_select" on public.platform_demo_suites for select to anon, authenticated using (true);
drop policy if exists "platform_demo_suites_write" on public.platform_demo_suites;
create policy "platform_demo_suites_write" on public.platform_demo_suites
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- a sensible starter set — the admin can switch any on/off from Platform Control
insert into public.platform_demo_suites (suite_key, enabled) values
  ('payroll', true), ('tasks', true), ('crm', true), ('inventory', true), ('trade-docs', true),
  ('hr', false), ('leave', false), ('visitors', false), ('attendance', false), ('procurement', false),
  ('finance', false), ('projects', false), ('documents', false), ('automation', false), ('compliance', false)
on conflict (suite_key) do nothing;

-- post-demo questionnaire — anonymous insert (the prospect has no account),
-- platform-admin read. Length caps keep junk small.
create table if not exists public.demo_feedback (
  id         uuid primary key default gen_random_uuid(),
  suite_key  text not null,
  ease       int not null check (ease between 1 and 5),
  would_pay  text not null check (would_pay in ('yes', 'maybe', 'no')),
  comment    text not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists demo_feedback_suite_idx on public.demo_feedback (suite_key, created_at desc);
alter table public.demo_feedback enable row level security;
drop policy if exists "demo_feedback_insert" on public.demo_feedback;
create policy "demo_feedback_insert" on public.demo_feedback for insert to anon, authenticated with check (true);
drop policy if exists "demo_feedback_select" on public.demo_feedback;
create policy "demo_feedback_select" on public.demo_feedback for select using (public.is_platform_admin());
