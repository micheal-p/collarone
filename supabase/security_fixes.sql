-- ============================================================================
-- Security fixes — 2026-07-20. Run AFTER website_builder.sql / site_paystack.sql
-- and after organizations.sql / pricing_v2.sql. Idempotent.
-- ============================================================================

-- FIX 1 (cross-tenant leak): _build_site_payload(uuid) took an arbitrary org id
-- with no same_org() check and returned that org's draft site content AND its
-- merchant bank account details (name/number/note), regardless of `published`.
-- It was granted directly to `authenticated`, so any signed-in user could call
-- it with another org's id and read those details. Its only legitimate callers
-- (public_get_site, preview_get_site) are themselves SECURITY DEFINER and run as
-- the owner, so they keep working without this grant. Revoke direct access.
-- NB: a same_org() guard *inside* the function is deliberately NOT used — it
-- would break anon viewing of published sites through public_get_site.
revoke execute on function public._build_site_payload(uuid) from authenticated;
revoke execute on function public._build_site_payload(uuid) from anon;
revoke execute on function public._build_site_payload(uuid) from public;

-- FIX 2 (signup-trigger regression): sso.sql shipped a pre-multitenancy
-- handle_new_user() that inserts profiles with no org_id and no org-owner
-- branch. If it ever runs after the multi-tenant migration it silently reverts
-- the trigger and breaks self-serve org signup (org_id is NOT NULL). Re-assert
-- the correct org-aware version here so the live trigger is guaranteed right
-- regardless of migration order. (Kept byte-identical to pricing_v2.sql.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  prov         text := coalesce(new.raw_app_meta_data->>'provider', 'email');
  signup_type  text := new.raw_user_meta_data->>'signup_type';
  org_name     text := new.raw_user_meta_data->>'org_name';
  org_slug     text := new.raw_user_meta_data->>'org_slug';
  org_plan     text := coalesce(new.raw_user_meta_data->>'plan_tier', 'startup');
  org_theme    text := coalesce(new.raw_user_meta_data->>'theme_color', '#FF5B1F');
  org_logo     text := coalesce(new.raw_user_meta_data->>'logo_url', '');
  org_website  text := coalesce(new.raw_user_meta_data->>'website_type', 'none');
  new_org_id   uuid;
begin
  if signup_type = 'org_owner' and org_name is not null and org_slug is not null then
    insert into public.organizations (name, slug, plan_tier, status, theme_color, logo_url, website_type, created_by)
    values (org_name, org_slug, org_plan, 'pending_payment', org_theme, org_logo, org_website, new.id)
    returning id into new_org_id;

    insert into public.profiles (id, email, name, role, org_id, suites, status, must_change_password)
    values (
      new.id, new.email,
      coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      'super_admin', new_org_id, '[]'::jsonb, 'active', false
    )
    on conflict (id) do nothing;
  else
    insert into public.profiles (id, email, name, role, org_id, suites, status, must_change_password)
    values (
      new.id, new.email,
      coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      'staff', '00000000-0000-0000-0000-000000000001', '[]'::jsonb,
      case when prov = 'email' then 'disabled' else 'active' end,
      false
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
