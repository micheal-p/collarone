-- Lock two SECURITY DEFINER functions that were executable by anyone.
--
-- Found by auditing all 163 definer functions in the live database for the
-- signature that produced the HR hole: a function that WRITES, has no
-- organisation scope, no `= auth.uid()` self-scope, and is not platform-only.
-- Thirteen matched. Ten were fine on inspection (the public storefront and
-- careers entry points genuinely take an org id by design; the billing,
-- punch, recurring-invoice, org-delete and watchdog functions were already
-- service-role only). Two were not.
--
-- 1. advance_billing_lifecycle() — the dunning ladder. It walks EVERY
--    organisation and moves active -> past_due -> read_only -> suspended.
--    It was executable by `anon`, so a logged-out stranger could run a
--    cross-tenant write over the whole customers table. The transitions are
--    date-gated, so calling it early cannot change any outcome — but it is a
--    heavy write over every row, repeatable for free, which is a cheap way to
--    load the database, and it has no business being reachable at all. Its
--    only legitimate caller is the health cron in client/api/health.js:312,
--    which uses the service role.
--
-- 2. seed_ledger_accounts(uuid) — added yesterday with the general ledger. It
--    takes an organisation id and inserts the default chart. Being executable
--    by `anon` made it a cross-tenant write: anyone could seed accounts into
--    any company's books. `on conflict do nothing` limits the damage to noise
--    rather than corruption, but noise in someone's chart of accounts is still
--    someone else writing to their books. My own oversight, from the migration
--    that also calls it — and the reason to run this audit rather than trust
--    that new code follows the rule.
--
-- The service role bypasses grants entirely, so both keep working.

revoke execute on function public.advance_billing_lifecycle() from anon, authenticated, public;
revoke execute on function public.seed_ledger_accounts(uuid)  from anon, authenticated, public;

-- Revoking from PUBLIC also strips the grant service_role inherits through it,
-- which is exactly how attendance_apply_punch broke on 2026-08-07. Grant back
-- explicitly, every time.
grant execute on function public.advance_billing_lifecycle() to service_role;
grant execute on function public.seed_ledger_accounts(uuid)  to service_role;
