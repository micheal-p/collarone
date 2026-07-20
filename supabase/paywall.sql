-- ============================================================================
-- Paywall / dunning ladder — 2026-07-20. Idempotent.
-- Renewal falls due -> 7-day grace (full access + banner) -> read-only
-- (can sign in and view, cannot write) -> suspended (locked out) at day 30.
--
-- SAFETY: the auto-advance function exists but is only CALLED when the server
-- env flag PAYWALL_ENFORCE=true (see client/api/health.js). Off by default, so
-- no org is ever auto-suspended until the operator turns enforcement on and
-- can watch the first cycle. Manual per-org moves (Platform Control) always work.
-- The founding org (Collarone) is always excluded from the ladder.
-- ============================================================================

-- New lifecycle states between active and suspended.
alter table public.organizations drop constraint if exists organizations_status_check;
alter table public.organizations add constraint organizations_status_check
  check (status in ('pending_payment','active','past_due','read_only','suspended','cancelled'));

alter table public.organizations
  add column if not exists current_period_end timestamptz,
  add column if not exists grace_until         timestamptz;

-- Existing active orgs get a fresh 30-day period so enabling enforcement never
-- instantly duns anyone; the founding org is never tracked.
update public.organizations
  set current_period_end = now() + interval '30 days'
  where status = 'active' and current_period_end is null
    and id <> '00000000-0000-0000-0000-000000000001';

create or replace function public.advance_billing_lifecycle()
returns table(id uuid, from_status text, to_status text)
language plpgsql security definer set search_path = public as $$
declare FOUNDING constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  -- active + period ended -> past_due, open a 7-day grace window
  return query
  with moved as (
    update public.organizations o
       set status = 'past_due', grace_until = now() + interval '7 days'
     where o.status = 'active' and o.current_period_end is not null
       and o.current_period_end < now() and o.id <> FOUNDING
    returning o.id
  ) select m.id, 'active'::text, 'past_due'::text from moved m;

  -- past_due + grace elapsed -> read_only
  return query
  with moved as (
    update public.organizations o set status = 'read_only'
     where o.status = 'past_due' and o.grace_until is not null
       and o.grace_until < now() and o.id <> FOUNDING
    returning o.id
  ) select m.id, 'past_due'::text, 'read_only'::text from moved m;

  -- read_only for another 23 days (30 total from renewal) -> suspended
  return query
  with moved as (
    update public.organizations o set status = 'suspended'
     where o.status = 'read_only' and o.grace_until is not null
       and o.grace_until < now() - interval '23 days' and o.id <> FOUNDING
    returning o.id
  ) select m.id, 'read_only'::text, 'suspended'::text from moved m;
end;
$$;

revoke execute on function public.advance_billing_lifecycle() from anon, authenticated;
