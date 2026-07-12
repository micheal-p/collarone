-- ============================================================================
-- Collarone — careers page: real org-scoping fix
-- Run after website_builder.sql. Idempotent.
--
-- Real gap found: public_job_postings (careers.sql) has NEVER been org-scoped
-- — it's a superuser-owned view granted to anon, so it silently bypasses RLS
-- and returns every org's open requisitions mixed together on one single,
-- global /careers page. Harmless while only one org had data; a real
-- cross-tenant leak the moment a second org posts a job. Also: the
-- unauthenticated /careers page had zero notion of "whose careers page is
-- this" — same missing-org-scope class as the old website_type enum before
-- the website builder, and the same fix shape as public_get_site().
-- ============================================================================

-- CREATE OR REPLACE VIEW can't reorder existing columns, only append new
-- ones at the end — drop-then-create instead of trying to insert org_id
-- before the pre-existing trailing department_name column.
drop view if exists public.public_job_postings;
create view public.public_job_postings as
select
  r.id, r.title, r.location, r.employment_type, r.headcount, r.description,
  r.min_experience_years, r.salary_min, r.salary_max, r.created_at,
  d.name as department_name,
  r.org_id, o.slug as org_slug, o.name as org_name
from public.job_requisitions r
join public.organizations o on o.id = r.org_id
left join public.departments d on d.id = r.department_id
where r.status = 'open';

-- (grant already exists from careers.sql — re-stated for clarity, harmless to repeat)
grant select on public.public_job_postings to anon, authenticated;

-- Small anon-facing lookup so the careers page can show "X's careers page"
-- and real branding even when there are zero open postings right now.
create or replace function public.public_get_careers_org(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when o.id is null then null else
    jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'logoUrl', coalesce(s.logo_url, o.logo_url))
  end
  from public.organizations o
  left join public.org_sites s on s.org_id = o.id
  where o.slug = p_slug;
$$;
grant execute on function public.public_get_careers_org(text) to anon, authenticated;
