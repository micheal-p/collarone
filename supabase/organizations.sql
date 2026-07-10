-- ============================================================================
-- Collarone — multi-tenancy foundation (Phase 1: account/org/theme shell)
-- Run AFTER schema.sql (and all other existing migrations). Idempotent.
--
-- Scope, deliberately: this makes account creation, org identity, theming and
-- billing multi-tenant. It does NOT yet make the operational suites (hr, leave,
-- tasks, visitors, payroll) safe for a second company — those tables still
-- assume a single tenant. The enforce_phase1_suite_scope trigger below is the
-- guardrail that keeps a non-OTG org's admin from self-granting suite access
-- while that's still true. See supabase/billing.sql for the companion billing
-- schema, and the project plan (`.claude/plans/inherited-seeking-kahn.md`) for
-- the full phase breakdown.
-- ============================================================================

-- OTG is tenant #1 — fixed UUID so app code and future migrations can refer to
-- it as a constant instead of looking it up.
-- id: 00000000-0000-0000-0000-000000000001

create table if not exists public.organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text not null unique,
  plan_tier      text not null check (plan_tier in ('starter','growth','scale')),
  status         text not null default 'pending_payment' check (status in ('pending_payment','active','suspended','cancelled')),
  theme_color    text not null default '#FF5B1F',
  logo_url       text not null default '',
  website_type   text not null default 'none' check (website_type in ('none','ecommerce','hr_corporate','job_board')),
  suites_enabled boolean not null default false,   -- true only for OTG until Phase 2 org-scopes the suite tables
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

alter table public.organizations enable row level security;

-- Seed tenant #1 (Origin Tech Group) — safe to re-run.
insert into public.organizations (id, name, slug, plan_tier, status, theme_color, suites_enabled)
values ('00000000-0000-0000-0000-000000000001', 'Origin Tech Group', 'origin-tech-group', 'scale', 'active', '#FF5B1F', true)
on conflict (id) do nothing;

-- ---- profiles.org_id --------------------------------------------------------
alter table public.profiles add column if not exists org_id uuid references public.organizations(id);
update public.profiles set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.profiles alter column org_id set not null;

-- ---- org-scoping helpers -----------------------------------------------------
create or replace function public.my_org_id()
returns uuid language sql security definer stable set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.same_org(target_org uuid)
returns boolean language sql stable as $$
  select target_org = public.my_org_id();
$$;

grant execute on function public.my_org_id() to authenticated;
grant execute on function public.same_org(uuid) to authenticated;

-- ---- platform admins (Collarone ops — distinct from an org's own super_admin) ---
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;
grant execute on function public.is_platform_admin() to authenticated;

drop policy if exists "platform_admins_select" on public.platform_admins;
create policy "platform_admins_select" on public.platform_admins for select
  using ( public.is_platform_admin() );
-- No insert/update/delete policy for `authenticated` — seeded by hand via the
-- SQL editor only:
--   insert into public.platform_admins values ('<aniebiet-auth-uid>');

-- ---- organizations RLS -------------------------------------------------------
drop policy if exists "organizations_select" on public.organizations;
create policy "organizations_select" on public.organizations for select
  using ( public.same_org(id) or public.is_platform_admin() );

drop policy if exists "organizations_update_admin" on public.organizations;
create policy "organizations_update_admin" on public.organizations for update
  using ( (public.is_super_admin() and public.same_org(id)) or public.is_platform_admin() )
  with check ( (public.is_super_admin() and public.same_org(id)) or public.is_platform_admin() );

-- Insert happens only via handle_new_user() (SECURITY DEFINER) or the service
-- role — no direct insert policy for `authenticated`.

-- ---- profiles RLS, re-scoped now that a second org can exist -----------------
-- Replaces the schema.sql versions: adds "and same_org(...)" so a super_admin
-- only sees/edits their OWN company's staff, plus an is_platform_admin() escape
-- hatch for Collarone ops support.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (
    id = auth.uid()
    or (public.is_super_admin() and public.same_org(org_id))
    or public.is_platform_admin()
  );

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update
  using (
    (public.is_super_admin() and public.same_org(org_id))
    or public.is_platform_admin()
  )
  with check (
    (public.is_super_admin() and public.same_org(org_id))
    or public.is_platform_admin()
  );

-- ---- Phase 1 guardrail: non-OTG orgs cannot hold suite grants ---------------
-- Closes the self-grant loophole at the DB layer, independent of UI state: a
-- non-OTG super_admin could otherwise set their own suites to [{"key":"hr"}]
-- and, because hr.sql's RLS isn't org-aware yet, see OTG's real HR data.
-- Drop this trigger in Phase 2 once every operational-suite table carries a
-- real org_id and org-scoped RLS.
create or replace function public.enforce_phase1_suite_scope()
returns trigger language plpgsql as $$
begin
  if new.org_id <> '00000000-0000-0000-0000-000000000001' then
    new.suites := '[]'::jsonb;
  end if;
  return new;
end;
$$;

drop trigger if exists phase1_suite_scope on public.profiles;
create trigger phase1_suite_scope
  before insert or update on public.profiles
  for each row execute function public.enforce_phase1_suite_scope();

-- ---- self-serve org signup: extend handle_new_user() -------------------------
-- Branches on raw_user_meta_data->>'signup_type' in addition to the existing
-- provider check. 'org_owner' = a brand-new company signing up via /signup:
-- creates the organizations row (pending_payment) and a super_admin profile
-- scoped to it. The org — not the profile — carries the "not paid yet" gate,
-- so the login flow can tell "your account works, your org doesn't" apart
-- from "your account is disabled" (the existing admin-invited-but-not-yet-
-- provisioned case, unchanged below).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  prov         text := coalesce(new.raw_app_meta_data->>'provider', 'email');
  signup_type  text := new.raw_user_meta_data->>'signup_type';
  org_name     text := new.raw_user_meta_data->>'org_name';
  org_slug     text := new.raw_user_meta_data->>'org_slug';
  org_plan     text := coalesce(new.raw_user_meta_data->>'plan_tier', 'starter');
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
-- trigger on_auth_user_created already points at this function (schema.sql) —
-- create or replace above is enough, no need to redrop/recreate the trigger.

-- ---- org slug availability check (self-serve signup wizard) -----------------
create or replace function public.org_slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.organizations where slug = p_slug);
$$;
grant execute on function public.org_slug_available(text) to anon, authenticated;

-- ---- org-logos storage bucket -------------------------------------------------
insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

drop policy if exists "org_logos_select" on storage.objects;
drop policy if exists "org_logos_insert" on storage.objects;
drop policy if exists "org_logos_update" on storage.objects;

create policy "org_logos_select" on storage.objects
  for select using (bucket_id = 'org-logos');

-- Keyed by the uploader's own auth uid (folder prefix), same convention as the
-- avatars bucket — works during signup before the organizations row's final
-- state is known, since the uploader is already authenticated at that point.
create policy "org_logos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'org-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "org_logos_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'org-logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Pre-signup: the wizard uploads a logo before the account exists, so it needs
-- an anonymous write path — scoped to a pending/ prefix (insert-only, no read
-- policy beyond the bucket-wide public one above), same convention as the
-- candidate-resumes anonymous upload in careers.sql.
drop policy if exists "org_logos_anon_insert" on storage.objects;
create policy "org_logos_anon_insert" on storage.objects
  for insert to anon
  with check (bucket_id = 'org-logos' and (storage.foldername(name))[1] = 'pending');
