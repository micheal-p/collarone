-- ============================================================================
-- Support access without impersonation. Idempotent.
--
-- Guest mode used to mint a full magic-link session as the tenant's own
-- super_admin, so a support visitor was indistinguishable from a real member
-- and could write anything. The fix (spec: "never mint a tenant user session"):
-- the support session stays the PLATFORM ADMIN's own identity, and carries a
-- claim that scopes them, read-only, into one tenant:
--
--   sub  = <platform admin's own user id>      (never a tenant account)
--   mode = 'support_read'
--   act_tenant = <the tenant being viewed>
--
-- my_org_id() honours act_tenant FOR READS, so the admin can see the workspace;
-- writes are refused because (a) the admin is not a member for membership-gated
-- policies and (b) the block_support_writes trigger and the storage policies
-- reject mode=support_read. Nothing on the tenant's side ever sees a real
-- member act, and every chat row keeps its true author.
--
-- REQUIRES ONE MANUAL STEP the connection cannot do: enable this hook in
-- Supabase → Authentication → Hooks → "Customize Access Token" =
-- public.custom_access_token_hook. Until it is enabled, no token carries the
-- claim, so guest mode grants NO access (fail-safe), and this whole file is
-- inert for everyone else.
-- ============================================================================

-- ---- 1. the short-lived grant the hook reads --------------------------------
create table if not exists public.support_grants (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references auth.users(id) on delete cascade,
  tenant_id  uuid not null references public.organizations(id) on delete cascade,
  reason     text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  consumed_at timestamptz            -- set when the admin ends the session
);
create index if not exists support_grants_admin_active
  on public.support_grants (admin_id, expires_at) where consumed_at is null;

-- Service-role only for the app: RLS on, no policies for authenticated/anon.
-- supabase_auth_admin gets its own SELECT policy below — the hook runs as that
-- role WITHOUT rls bypass, so a table grant alone is not enough to read here.
alter table public.support_grants enable row level security;

drop policy if exists "support_grants_auth_hook_read" on public.support_grants;
create policy "support_grants_auth_hook_read" on public.support_grants
  for select to supabase_auth_admin using (true);

-- The hook also checks platform_admins directly (not via the security-definer
-- helper), so that table needs the same auth-role read path.
drop policy if exists "platform_admins_auth_hook_read" on public.platform_admins;
create policy "platform_admins_auth_hook_read" on public.platform_admins
  for select to supabase_auth_admin using (true);

-- ---- 2. the access-token hook ----------------------------------------------
-- Runs at every token mint/refresh. Adds the support claims only when the user
-- is a platform admin AND holds a live, unconsumed grant. Everyone else's token
-- is returned untouched.
create or replace function public.custom_access_token_hook(event jsonb)
  returns jsonb language plpgsql stable as $$
declare
  uid    uuid  := (event->>'user_id')::uuid;
  claims jsonb := coalesce(event->'claims', '{}'::jsonb);
  g      record;
begin
  if exists (select 1 from public.platform_admins where user_id = uid) then
    select tenant_id into g
    from public.support_grants
    where admin_id = uid and consumed_at is null and expires_at > now()
    order by created_at desc
    limit 1;
    if g.tenant_id is not null then
      claims := jsonb_set(claims, '{mode}',       to_jsonb('support_read'::text));
      claims := jsonb_set(claims, '{act_tenant}', to_jsonb(g.tenant_id::text));
      event  := jsonb_set(event,  '{claims}',     claims);
    end if;
  end if;
  return event;
end; $$;

-- Supabase's auth admin role runs the hook and must read the two tables.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
grant select on public.support_grants, public.platform_admins to supabase_auth_admin;
-- No one else may call it.
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- ---- 3. the CANONICAL claim-reading helpers ---------------------------------
-- This file owns the one true definition of is_support_session() and
-- my_org_id(). organizations.sql and support_readonly_enforcement.sql only
-- create fallbacks when the function is missing (fresh database), so replaying
-- any file in any order can never regress these.
--
-- auth.jwt() is Supabase's builtin claims reader; it already collapses the
-- empty-string GUC to NULL — the ''::jsonb crash the old hand-copied
-- nullif(...) expressions guarded against, now guarded in exactly one place.

create or replace function public.is_support_session()
  returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'mode') = 'support_read', false);
$$;

-- my_org_id honours act_tenant FOR READS. Additive for normal requests: the
-- mode check fails immediately and it returns the profile's org exactly as
-- before. A forged act_tenant on a non-admin token is ignored — and the claim
-- alone is not enough: the grant row must still be live and unconsumed, so
-- ending a session (or its 30-minute expiry) cuts access on the very next
-- query even for a token minted moments before. Claims no longer outlive the
-- grant. The one-row FROM subquery parses the JWT once per call instead of
-- 2-3 times — this runs inside every RLS policy, so it matters.
create or replace function public.my_org_id()
  returns uuid language sql stable security definer set search_path to 'public' as $$
  select case
    when (j.c ->> 'mode') = 'support_read'
     and (j.c ->> 'act_tenant') is not null
     and public.is_platform_admin()
     and exists (
       select 1 from public.support_grants g
       where g.admin_id = auth.uid()
         and g.tenant_id = (j.c ->> 'act_tenant')::uuid
         and g.consumed_at is null
         and g.expires_at > now()
     )
    then (j.c ->> 'act_tenant')::uuid
    else (select org_id from public.profiles where id = auth.uid())
  end
  from (select auth.jwt() as c) j;
$$;
