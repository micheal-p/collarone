-- ============================================================================
-- Collarone — which bank layout an organisation uses, and which they've checked
--
-- The disbursement file now comes in several layouts because different banks'
-- bulk-payment portals want different columns. Two things have to persist per
-- organisation:
--
--   default_format_id — the layout they use every month, so the payroll
--                       manager is not re-choosing it on every run.
--
--   verified_formats  — the layouts someone has compared against the template
--                       their bank actually gave them.
--
-- The second one is the important one. Our bank-specific layouts are
-- reconstructions: those portals sit behind corporate logins and their
-- templates change without notice. A wrong column order produces a rejected
-- salary file, so the app refuses to download an unchecked bank layout until a
-- human has looked at the preview beside their bank's own template and said it
-- matches. Storing that per organisation means it is asked once, not monthly.
--
-- Deliberately NOT stored on organizations: this is payroll-manager territory,
-- and organizations is readable by everyone in the workspace. A separate table
-- gets its own policy.
--
-- Idempotent; safe to re-run.
-- ============================================================================

create table if not exists public.payroll_export_prefs (
  org_id            uuid primary key references public.organizations(id) on delete cascade,
  default_format_id text not null default 'generic',
  -- Format ids the org has confirmed against their bank's real template.
  verified_formats  text[] not null default '{}',
  updated_by        uuid references public.profiles(id),
  updated_at        timestamptz not null default now()
);

alter table public.payroll_export_prefs enable row level security;

-- Read: anyone who can run payroll needs to know the chosen layout.
drop policy if exists "payroll_export_prefs_select" on public.payroll_export_prefs;
create policy "payroll_export_prefs_select" on public.payroll_export_prefs for select using (
  public.same_org(org_id) and (public.is_payroll_manager() or public.is_super_admin())
);

-- Write: confirming a layout is a statement that someone checked it against
-- the bank's template. Only a payroll manager can make that statement.
drop policy if exists "payroll_export_prefs_write" on public.payroll_export_prefs;
create policy "payroll_export_prefs_write" on public.payroll_export_prefs for all using (
  public.same_org(org_id) and (public.is_payroll_manager() or public.is_super_admin())
) with check (
  public.same_org(org_id) and (public.is_payroll_manager() or public.is_super_admin())
);

-- ---- upsert -----------------------------------------------------------------
-- org_id comes from the caller's own profile, never from an argument, so this
-- cannot be pointed at another tenant's row. The same mistake this codebase
-- has already made twice in SECURITY DEFINER functions.
create or replace function public.set_payroll_export_prefs(
  p_default_format_id text,
  p_verified_formats  text[]
) returns public.payroll_export_prefs
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org_id();
  v_row public.payroll_export_prefs;
begin
  if not (public.is_payroll_manager() or public.is_super_admin()) then
    raise exception 'Only a payroll manager can change the bank export settings.';
  end if;
  if v_org is null then
    raise exception 'No organisation on your profile.';
  end if;

  insert into public.payroll_export_prefs as p (org_id, default_format_id, verified_formats, updated_by, updated_at)
  values (v_org, coalesce(p_default_format_id, 'generic'), coalesce(p_verified_formats, '{}'), auth.uid(), now())
  on conflict (org_id) do update
    set default_format_id = coalesce(excluded.default_format_id, p.default_format_id),
        verified_formats  = coalesce(excluded.verified_formats, p.verified_formats),
        updated_by        = auth.uid(),
        updated_at        = now()
  returning * into v_row;

  return v_row;
end $$;

-- Two separate grants have to be removed, which is easy to get half-right.
--
-- Postgres grants EXECUTE to PUBLIC on every new function, AND Supabase ships
-- a default-privileges rule that grants EXECUTE to anon and authenticated on
-- anything created in this schema. Revoking from PUBLIC alone leaves the
-- explicit anon grant untouched — verified on this database, where the
-- function was still anon-executable after a `revoke ... from public`.
--
-- Nothing unauthenticated has any business setting an organisation's payroll
-- export layout, so anon is revoked by name.
revoke all on function public.set_payroll_export_prefs(text, text[]) from public;
revoke all on function public.set_payroll_export_prefs(text, text[]) from anon;
grant execute on function public.set_payroll_export_prefs(text, text[]) to authenticated;

-- ---- support sessions stay read-only ---------------------------------------
-- Every tenant table carries the a_block_support_writes trigger, so a support
-- session (guest mode, which impersonates a tenant super_admin) can look but
-- not touch. support_readonly_enforcement.sql attaches it to every table in
-- the schema and is meant to be re-run whenever one is added — which is
-- exactly the step that gets forgotten. It was forgotten here, and CI caught
-- it: "tenant tables missing the support-write block: payroll_export_prefs".
--
-- Attaching it in the same migration that creates the table means this file is
-- correct on its own, rather than correct only if someone remembers to run a
-- second one afterwards.
drop trigger if exists a_block_support_writes on public.payroll_export_prefs;
create trigger a_block_support_writes
  before insert or update or delete on public.payroll_export_prefs
  for each row execute function public.block_support_writes();
