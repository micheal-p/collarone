-- ============================================================================
-- Rate-lock storage — 2026-07-20. Idempotent.
-- The landing page and Terms promise "your rate is locked at sign-up." Until
-- now nothing stored the rate: seat-credit charges recomputed it from a live
-- constant keyed by plan_tier, and that constant used the OLD tier names
-- (starter/growth/scale) while orgs carry the NEW names (startup/standard/
-- enterprise) — so every lookup missed and every org was charged the
-- ₦1,000 fallback regardless of tier. Store the locked rate on the org at
-- signup and read it back everywhere instead.
-- ============================================================================

alter table public.organizations
  add column if not exists base_fee_kobo        bigint,
  add column if not exists per_seat_kobo        bigint,
  add column if not exists included_suites      int,
  add column if not exists extra_suite_fee_kobo bigint,
  add column if not exists rate_locked_at       timestamptz;

-- Backfill existing orgs from the CURRENT published prices (their effective
-- rate today = the rate they are locked into). Per-seat is the flat published
-- PER_STAFF_FEE of ₦2,000. Handles both old and new tier vocabularies.
update public.organizations set
  base_fee_kobo = case plan_tier
      when 'startup' then 1500000 when 'standard' then 2500000 when 'enterprise' then 4500000
      when 'starter' then 1500000 when 'growth'   then 2500000 when 'scale'      then 4500000
      else 1500000 end,
  per_seat_kobo = 200000,
  included_suites = case plan_tier
      when 'startup' then 3 when 'standard' then 5 when 'enterprise' then 8
      when 'starter' then 3 when 'growth'   then 5 when 'scale'      then 8
      else 3 end,
  extra_suite_fee_kobo = case plan_tier
      when 'startup' then 800000 when 'standard' then 600000 when 'enterprise' then 400000
      when 'starter' then 800000 when 'growth'   then 600000 when 'scale'      then 400000
      else 800000 end,
  rate_locked_at = coalesce(rate_locked_at, created_at)
where base_fee_kobo is null;
