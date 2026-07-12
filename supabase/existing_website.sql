-- ============================================================================
-- Collarone — "I already have a website" path
-- A company with an existing site shouldn't be forced to migrate into the
-- builder to use the rest of the platform. Storing the external URL directly
-- on organizations (not org_sites) keeps the two paths — "built with us" vs
-- "already have one" — mutually exclusive and simple, with no awkward
-- nullable theme_key on org_sites.
-- ============================================================================

alter table public.organizations add column if not exists external_website_url text not null default '';
