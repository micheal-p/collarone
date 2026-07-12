-- ============================================================================
-- Collarone — pricing model v2: à la carte suites at every tier
-- Tiers are now about support level/contract terms, not which suites are
-- available — every customer on every tier picks their own suites.
-- Startup ₦15,000/mo incl. 3 suites, +₦8,000/extra suite.
-- Standard ₦25,000/mo incl. 5 suites, +₦6,000/extra suite.
-- Enterprise ₦45,000/mo incl. 8 suites, +₦4,000/extra suite (or fully custom
-- via direct negotiation, per the "request what you want built" positioning).
-- Annual billing = 15% off the total. Real Paystack automation still not
-- built — this is a pricing/display change, billing stays human-confirmed.
-- ============================================================================

alter table public.organizations drop constraint if exists organizations_plan_tier_check;
alter table public.organizations add constraint organizations_plan_tier_check
  check (plan_tier in ('starter','growth','scale','startup','standard','enterprise'));

update public.organizations set plan_tier = 'enterprise' where plan_tier = 'scale';
update public.organizations set plan_tier = 'startup' where plan_tier = 'starter';
update public.organizations set plan_tier = 'standard' where plan_tier = 'growth';

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
