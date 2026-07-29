-- ============================================================================
-- Collarone — refund/adjustment records. Run after billing.sql. Idempotent.
--
-- A refund here is a RECORD of money returned (the actual transfer happens in
-- the Paystack dashboard or by bank transfer — Collarone never holds or moves
-- customer funds itself). Marking a confirmed transaction refunded:
--   • sets status='refunded' + refunded_at/refunded_by/refund_reason,
--   • for credit packs, claws the granted credits back via a negative ledger
--     entry (safe + visible; balance can show the org already spent them),
--   • never silently changes org access — suspending/downgrading stays an
--     explicit, separate platform-admin action so a refund can't accidentally
--     lock a workspace.
-- ============================================================================
alter table public.billing_transactions drop constraint if exists billing_transactions_status_check;
alter table public.billing_transactions add constraint billing_transactions_status_check
  check (status in ('pending','confirmed','failed','cancelled','refunded'));

alter table public.billing_transactions add column if not exists refunded_at timestamptz;
alter table public.billing_transactions add column if not exists refunded_by uuid;
alter table public.billing_transactions add column if not exists refund_reason text;
