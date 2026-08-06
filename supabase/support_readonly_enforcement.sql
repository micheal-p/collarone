-- ============================================================================
-- Support sessions are read-only, enforced at the database — not the UI.
-- Idempotent. Safe to ship before the identity half lands: the block only
-- fires when a session carries mode=support_read, so today (no session sets
-- it) it is inert, and the moment one does it fails closed.
--
-- Why a trigger and not just policy WITH CHECK: the read-only guarantee must
-- not depend on remembering to add a clause to every write policy, nor on a
-- Send button never rendering. A BEFORE INSERT/UPDATE/DELETE trigger on every
-- tenant table is the one place a write cannot slip past — including writes
-- that fire from GET-shaped read paths (a read-receipt bump, a last_seen
-- touch). Those are side effects a support view must not emit, and here they
-- are blocked for free.
--
-- The audit log and platform tables are exempt: audit rows are written by the
-- service role (which carries no support claim, so the trigger never fires on
-- them anyway) and must always succeed.
-- ============================================================================

-- Is the current request a support (read-only) session? Fallback only —
-- support_identity.sql owns the CANONICAL is_support_session() (auth.jwt()
-- based, empty-string-claim safe). Created here only when missing (fresh
-- database), so replaying this file can never regress the canonical one.
do $$ begin
  if to_regproc('public.is_support_session') is null then
    create function public.is_support_session()
      returns boolean language sql stable as $fn$
      select coalesce((auth.jwt() ->> 'mode') = 'support_read', false);
    $fn$;
  end if;
end $$;

create or replace function public.block_support_writes()
  returns trigger language plpgsql as $$
begin
  if public.is_support_session() then
    raise exception 'Support sessions are read-only — write to % is not allowed.', tg_table_name
      using errcode = '42501';  -- insufficient_privilege
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

-- Attach to every base table in public except the exemptions. Named with a
-- leading 'a_' so it fires before any other BEFORE trigger — the write is
-- refused before a peer trigger can run a side effect. Re-running re-attaches
-- to any table added since (and the CI probe fails the build if one is missed).
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname not in (
        'platform_admin_audit_log',   -- service-role writes; must always work
        'platform_admins',
        'schema_migrations'
      )
  loop
    execute format('drop trigger if exists a_block_support_writes on public.%I', t.relname);
    execute format(
      'create trigger a_block_support_writes before insert or update or delete on public.%I '
      || 'for each row execute function public.block_support_writes()', t.relname);
  end loop;
end $$;
