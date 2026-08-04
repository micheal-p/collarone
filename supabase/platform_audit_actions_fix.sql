-- ============================================================================
-- Collarone — the platform-admin audit log was refusing to record two of the
-- three most sensitive actions it exists to record. Idempotent.
--
-- The check constraint only allowed ('confirm_payment','delete_org',
-- 'impersonate'). But client/api/admin.js also logs four more:
--   - 'refund_transaction'  a refund               (admin.js:315)
--   - 'guest_mode'          guesting into a tenant (admin.js:363)
--   - 'payment_gateway'     setting a tenant's Paystack keys (:400)
--   - 'set_billing_state'   suspend / read-only / cancel (:475)
-- None were in the list, so every one of those inserts failed with 23514 —
-- and because logAudit() ignores the insert's .error, all four went through
-- UNLOGGED. The log had a hole exactly where it mattered most: guesting into
-- a tenant (which is a full read/write session as their super_admin) was not
-- being recorded at all. 'impersonate' was the old name for what the code now
-- calls 'guest_mode'; it is kept so existing rows still validate.
--
-- An audit log must never reject a write: a refused row is a lost record of a
-- sensitive act, which is the opposite of what the table is for. If a new
-- action needs auditing, it belongs in this list BEFORE the code ships it —
-- the CI guard below fails the build if admin.js emits an action this
-- constraint would reject.
-- ============================================================================

alter table public.platform_admin_audit_log
  drop constraint if exists platform_admin_audit_log_action_check;

alter table public.platform_admin_audit_log
  add constraint platform_admin_audit_log_action_check
  check (action in (
    'confirm_payment',
    'delete_org',
    'impersonate',     -- legacy name for guest_mode; kept for old rows
    'guest_mode',
    'payment_gateway',
    'refund_transaction',
    'set_billing_state'
  ));
