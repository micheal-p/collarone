-- ============================================================================
-- Careers pages: richer public company info for the apply page's About card.
-- Only exposes what the org already publishes (site tagline/contact appear
-- only when the site is published; external website is by nature public).
-- ============================================================================
create or replace function public.public_get_careers_org(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when o.id is null then null else
    jsonb_build_object(
      'id', o.id, 'name', o.name, 'slug', o.slug,
      'logoUrl', coalesce(s.logo_url, o.logo_url),
      'tagline', case when coalesce(s.published, false) then s.tagline else null end,
      'website', case
        when coalesce(o.external_website_url, '') <> '' then o.external_website_url
        when coalesce(s.published, false) then '/site/' || o.slug
        else null end,
      'contactEmail', case when coalesce(s.published, false) then s.contact_email else null end
    )
  end
  from public.organizations o
  left join public.org_sites s on s.org_id = o.id
  where o.slug = p_slug;
$$;
grant execute on function public.public_get_careers_org(text) to anon, authenticated;
