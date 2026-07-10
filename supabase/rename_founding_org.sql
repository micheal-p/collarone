-- ============================================================================
-- Collarone — rename tenant #1 from its old placeholder identity
-- Run anytime. Idempotent (a plain update, safe to re-run).
-- The founding org was seeded as "Origin Tech Group" — this platform is now
-- Collarone in its own right, so tenant #1 becomes "Collarone" too.
-- ============================================================================

update public.organizations
set name = 'Collarone', slug = 'collarone'
where id = '00000000-0000-0000-0000-000000000001';
