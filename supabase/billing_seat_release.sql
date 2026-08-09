-- Give the seat back when someone leaves.
--
-- A credit is spent when a staff account is created ('staff_created', -1) and
-- nothing ever returns it. hr_finalize_exit disables the account and, since
-- payroll_integrity.sql, stamps the leaving date — but billing was never told,
-- so the company keeps paying for a seat nobody occupies and has to buy a new
-- credit to replace a person who left. On a per-seat product that is the
-- customer quietly overpaying, which is the kind of thing they discover later
-- and never quite forgive.
--
-- Returned on the transition INTO disabled, once per profile. The guard
-- matters: an admin toggling someone disabled, active, disabled must not mint
-- credits, and re-enabling someone should not silently re-charge them either —
-- the seat is charged at creation, so a rehire keeps their original one.

-- The live constraint already carried 'promo_grant', added by a later
-- migration than the one that created this table. Re-declaring the list from
-- billing.sql would have silently DROPPED it and rejected the existing row —
-- the "migrations that undo each other" problem, caught here only because the
-- constraint refused to validate. Extend the live definition; never restate it
-- from an older file.
alter table public.org_credit_ledger drop constraint if exists org_credit_ledger_reason_check;
alter table public.org_credit_ledger add constraint org_credit_ledger_reason_check
  check (reason in ('purchase','staff_created','staff_released','adjustment','refund','promo_grant'));

create or replace function public.release_seat_on_disable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'disabled' and old.status is distinct from 'disabled' then
    -- Only if this profile actually consumed a credit, and only once. Orgs
    -- created before credit-gating have no 'staff_created' row, and must not
    -- receive a credit they never paid for.
    if exists (
      select 1 from public.org_credit_ledger
      where related_profile_id = new.id and reason = 'staff_created'
    ) and not exists (
      select 1 from public.org_credit_ledger
      where related_profile_id = new.id and reason = 'staff_released'
    ) then
      insert into public.org_credit_ledger (org_id, delta, reason, related_profile_id)
      values (new.org_id, 1, 'staff_released', new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_release_seat_on_disable on public.profiles;
create trigger trg_release_seat_on_disable
  after update of status on public.profiles
  for each row execute function public.release_seat_on_disable();

revoke execute on function public.release_seat_on_disable() from public, anon, authenticated;
