-- ============================================================================
-- Microsoft (Azure Entra ID) SSO support — auto-create a profile on first login.
-- Run this in Supabase → SQL Editor (after schema.sql). Idempotent.
-- ============================================================================
-- Behaviour:
--   • Azure (Microsoft) sign-in  -> profile created ACTIVE, role 'staff', NO suites
--     (they can sign in but see nothing until a System Admin grants suites).
--   • Plain email self-signup     -> profile created DISABLED (blocked at login).
--   • Admin-created (via /api/admin) -> trigger inserts disabled, then the function
--     upserts it to active with the chosen role + suites.

-- NOTE: handle_new_user() is DELIBERATELY not defined here any more. This file
-- once shipped a pre-multitenancy version that inserts profiles with no org_id
-- and no org-owner branch; running it after the multi-tenant migration reverts
-- the trigger and breaks self-serve org signup (org_id is NOT NULL). The single
-- source of truth for this function is organizations.sql (re-asserted in
-- pricing_v2.sql and security_fixes.sql). Only the trigger binding remains here.

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
