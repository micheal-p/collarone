-- ============================================================================
-- Collarone — notification outbox. Run after promo_codes.sql. Idempotent.
--
-- Every automated billing notification (dunning emails, renewal-due nudges,
-- trial-expiry) claims a row here BEFORE sending, keyed by a dedupe_key that
-- encodes org + kind + billing period. A second run of the same cron cycle
-- hits the unique key and skips — so a customer is never double-emailed no
-- matter how often the scheduler fires. Also doubles as a visible send log
-- for Platform Control ("what did we send this org, when, did it deliver").
--
-- Service-role only: RLS enabled with no policies — the anon/authenticated
-- keys can neither read recipients nor forge sends.
-- ============================================================================
create table if not exists public.notification_outbox (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  kind        text not null,               -- renewal_due | past_due | read_only | suspended | trial_expired | ...
  dedupe_key  text not null unique,        -- e.g. '<org>:past_due:<period_end>'
  channels    jsonb not null default '["email","banner"]'::jsonb,
  email_to    text,
  subject     text,
  status      text not null default 'claimed' check (status in ('claimed','sent','partial','failed','skipped')),
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index if not exists notification_outbox_org_idx on public.notification_outbox (org_id, created_at desc);
alter table public.notification_outbox enable row level security;
