// Tenant #1 — fixed UUID, mirrors supabase/organizations.sql. Departments are
// an OTG-only concept for now (open-read RLS gap, not yet org-scoped) — see
// the Phase 1 plan for why every other org falls back to free-text instead.
export const OTG_ORG_ID = '00000000-0000-0000-0000-000000000001';
