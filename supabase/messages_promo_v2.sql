-- ============================================================================
-- Collarone — website messages become a real inbox + promo codes v2
--
-- Messages: submissions from the site contact form / embed widget get their
-- own activity type ('web_message') instead of hiding among hand-logged
-- notes, a replied_at marker so the dashboard can show what's been answered,
-- and contact dedupe by email so one person messaging twice isn't two
-- contacts. (Direct email replies will send over SMTP from the org's own
-- collarone.app mailbox once that exists — the reply UI ships "coming soon".)
--
-- Promo codes v2: beyond a % discount, a code can grant seat credits and/or
-- a time-boxed trial ("free for 3 days / 1 month" — set per code). Trials
-- stamp organizations.trial_ends_at; expiry enforcement runs in
-- client/api/health.js alongside the throttled status check.
-- ============================================================================

-- crm_activities type CHECK is owned by crm.sql (canonical) — the
-- drop-by-name/recreate block that lived here was a landmine when files were
-- re-run out of order.
alter table public.crm_activities add column if not exists replied_at timestamptz;

-- promo codes v2 + trial window on orgs
alter table public.promo_codes add column if not exists grant_credits int not null default 0 check (grant_credits >= 0);
alter table public.promo_codes add column if not exists trial_days int check (trial_days is null or trial_days > 0);
alter table public.organizations add column if not exists trial_ends_at timestamptz;

-- public_submit_lead is owned by funnel_fixes.sql (6-arg version with
-- p_source). The 5-arg definition that lived here must NOT be recreated:
-- it would overload the new signature and 5-arg calls would silently hit
-- the stale code path.
