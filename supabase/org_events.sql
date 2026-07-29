-- ============================================================================
-- Collarone — org_events: the event spine. Run after organizations.sql.
-- Idempotent.
--
-- One append-only log every suite can EMIT to and READ from — the mechanism
-- that makes the suites genuinely joined ("brothers") instead of 15 silos:
-- an org-wide activity feed, a notification centre, and cross-suite
-- automations (hire → payroll + attendance) all hang off this one table.
--
-- Seeded tonight with the BILLING domain (payment.confirmed, payment.refunded,
-- billing.renewal_due, billing.past_due/read_only/suspended); other suites
-- adopt the same emit helper as they grow into it.
--
-- Writes: service-role only (server-side emitters — no client can forge an
-- event). Reads: same_org, so the feed is tenant-scoped by RLS from birth.
-- ============================================================================
create table if not exists public.org_events (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  type       text not null,              -- dot-namespaced: 'payment.confirmed', 'hr.hired', ...
  actor_id   uuid,                       -- who caused it; null = the system
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists org_events_org_idx  on public.org_events (org_id, created_at desc);
create index if not exists org_events_type_idx on public.org_events (org_id, type, created_at desc);

alter table public.org_events enable row level security;
drop policy if exists org_events_select on public.org_events;
create policy org_events_select on public.org_events
  for select to authenticated using (public.same_org(org_id));
-- no insert/update/delete policies: service role only
