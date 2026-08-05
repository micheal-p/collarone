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

-- Service-role only: RLS on, zero policies (same posture as org_payment_gateways).
alter table public.support_grants enable row level security;

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

-- ---- 3. my_org_id honours act_tenant for reads ------------------------------
-- The core helper every policy reads. The change is additive: for any normal
-- request the mode check fails immediately and it returns the profile's org
-- exactly as before — is_platform_admin() is only consulted once a token
-- already claims support_read, which only the hook can put there, and only for
-- a platform admin. A forged act_tenant on a non-admin token is ignored.
create or replace function public.my_org_id()
  returns uuid language sql stable security definer set search_path to 'public' as $$
  select case
    when (current_setting('request.jwt.claims', true)::jsonb ->> 'mode') = 'support_read'
     and (current_setting('request.jwt.claims', true)::jsonb ->> 'act_tenant') is not null
     and public.is_platform_admin()
    then (current_setting('request.jwt.claims', true)::jsonb ->> 'act_tenant')::uuid
    else (select org_id from public.profiles where id = auth.uid())
  end;
$$;
