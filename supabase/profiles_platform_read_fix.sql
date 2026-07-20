-- ============================================================================
-- Fix cross-tenant profile leak — 2026-07-20. Idempotent.
-- profiles_select ended with `OR is_platform_admin()`, giving any platform
-- admin an unconditional read of EVERY org's profiles. Since the founding-org
-- admin is also a platform admin, the tenant Users page (GET /users) showed
-- users from OTHER orgs (e.g. Dr CV's admin inside Collarone's list).
--
-- Fix: strip the blanket clause so profile reads are strictly org-scoped, and
-- move the platform dashboard's legitimate cross-org read into a single
-- controlled SECURITY DEFINER function.
-- ============================================================================

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (
  id = auth.uid()
  or (public.is_super_admin()   and public.same_org(org_id))
  or (public.has_hr_suite()     and public.same_org(org_id))
  or (public.has_payroll_suite()   and public.same_org(org_id))
  or (public.has_inventory_suite() and public.same_org(org_id))
);

-- The one sanctioned cross-org profile read, for the Platform Control dashboard.
create or replace function public.platform_all_profiles()
returns table(id uuid, org_id uuid, name text, email text, role text, created_at timestamptz, last_login_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.org_id, p.name::text, p.email::text, p.role::text, p.created_at, p.last_login_at
  from public.profiles p
  where public.is_platform_admin()
  order by p.created_at desc;
$$;
revoke execute on function public.platform_all_profiles() from anon;
grant execute on function public.platform_all_profiles() to authenticated;
