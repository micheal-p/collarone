-- ============================================================================
-- is_support_session() and my_org_id() cast request.jwt.claims to jsonb, but
-- the claim GUC can be an EMPTY STRING (not just NULL) depending on the
-- connection/role context — and ''::jsonb raises "invalid input syntax for
-- type json", whereas NULL::jsonb is fine. Because is_support_session() runs
-- inside block_support_writes() (a trigger on 122 tables) and my_org_id() runs
-- inside every RLS policy, an empty-string claim would crash writes and reads.
--
-- Surfaced by the cross-tenant RLS probe, whose superuser inserts hit the
-- trigger with an empty claim. Fix: nullif(..., '') before the cast, so both
-- '' and NULL collapse to a clean NULL and the guards return false / the
-- profile org. Idempotent.
-- ============================================================================

create or replace function public.is_support_session()
  returns boolean language sql stable as $$
  select coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'mode') = 'support_read',
    false
  );
$$;

create or replace function public.my_org_id()
  returns uuid language sql stable security definer set search_path to 'public' as $$
  select case
    when (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'mode') = 'support_read'
     and (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'act_tenant') is not null
     and public.is_platform_admin()
    then (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'act_tenant')::uuid
    else (select org_id from public.profiles where id = auth.uid())
  end;
$$;
