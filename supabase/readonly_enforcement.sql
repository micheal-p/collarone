-- ============================================================================
-- Database-level read-only enforcement — 2026-07-20. Idempotent.
-- The app-facade guard (client.ts) blocks most writes, but suites that call
-- Supabase directly bypass it and a raw token could too. This makes read-only
-- a real wall: a BEFORE INSERT/UPDATE/DELETE trigger on every tenant business
-- table refuses the write when the caller's org is read_only or suspended.
--
-- SAFETY — the enforcement FAILS OPEN. my_org_is_writable() returns true for
-- active orgs, true when the org/status can't be resolved (e.g. service-role
-- writes, where auth.uid() is null), and the trigger allows the write if the
-- check itself errors. The only path that blocks is a definitively read_only /
-- suspended org — so an enforcement bug can never lock out a paying customer.
-- ============================================================================

create or replace function public.my_org_is_writable()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select o.status not in ('read_only', 'suspended')
       from public.profiles p
       join public.organizations o on o.id = p.org_id
      where p.id = auth.uid()
      limit 1),
    true);  -- fail OPEN: unknown caller / service role / no profile -> allow
$$;
revoke execute on function public.my_org_is_writable() from anon;

create or replace function public.enforce_org_writable()
returns trigger language plpgsql security definer set search_path = public as $$
declare writable boolean;
begin
  begin
    writable := public.my_org_is_writable();
  exception when others then
    writable := true;  -- never let an enforcement fault block a legitimate write
  end;
  if writable is false then
    raise exception 'Your workspace is read-only until your subscription is renewed.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

-- Attach to every table carrying org_id EXCEPT the infrastructure a read-only
-- org still needs to touch (or that only the service role writes): billing +
-- payment, notices, the org/profile rows themselves, and platform/analytics
-- tables. Business-suite tables (hr, leave, tasks, crm, inventory, ...) all
-- carry org_id and are covered automatically.
do $$
declare
  t text;
  deny text[] := array[
    'organizations', 'profiles', 'org_notices', 'billing_transactions',
    'org_credit_ledger', 'org_payment_gateways', 'automation_runs',
    'ai_draft_requests', 'status_checks', 'status_incidents', 'client_errors',
    'platform_admins', 'platform_admin_audit_log', 'platform_contact_messages',
    'page_views', 'site_visits', 'promo_codes'
  ];
begin
  for t in
    select distinct c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
     where n.nspname = 'public' and c.relkind = 'r'
       and a.attname = 'org_id' and a.attnum > 0 and not a.attisdropped
       and c.relname <> all(deny)
  loop
    execute format('drop trigger if exists trg_org_writable on public.%I', t);
    execute format('create trigger trg_org_writable before insert or update or delete on public.%I for each row execute function public.enforce_org_writable()', t);
  end loop;
end $$;
