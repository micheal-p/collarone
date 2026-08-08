-- Money owed: track how much has actually been paid.
--
-- crm_receivables has a `status` of 'part_paid' and nowhere to record HOW MUCH
-- was part-paid. So a ₦500,000 debt with ₦400,000 already received still reads
-- as ₦500,000 outstanding, and the "money owed" total the owner uses to decide
-- who to chase is simply wrong — always overstated, and by an unknowable
-- amount. A debtor book that cannot add up is worse than no debtor book,
-- because it is trusted.
--
-- amount_paid is the fact; status becomes derived from it, so the two can
-- never disagree.

alter table public.crm_receivables
  add column if not exists amount_paid numeric not null default 0 check (amount_paid >= 0);

-- Anything already marked paid is fully paid; part_paid rows are unknown, so
-- they stay at zero rather than inventing a figure. Better an honest "nothing
-- recorded yet" than a made-up number in a debtor book.
update public.crm_receivables set amount_paid = amount_naira
 where status = 'paid' and amount_paid = 0;

alter table public.crm_receivables drop constraint if exists crm_receivables_paid_within_total;
alter table public.crm_receivables
  add constraint crm_receivables_paid_within_total check (amount_paid <= amount_naira);

-- Keep status honest: it follows the money, it is not typed independently.
create or replace function public.crm_receivable_sync_status()
returns trigger language plpgsql set search_path = public as $$
begin
  -- 'written_off' is a decision, not an arithmetic outcome, so it is left alone.
  if new.status = 'written_off' then return new; end if;
  if new.amount_paid <= 0 then
    new.status := 'outstanding';
  elsif new.amount_paid >= new.amount_naira then
    new.status := 'paid';
    new.settled_at := coalesce(new.settled_at, now());
  else
    new.status := 'part_paid';
    new.settled_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_receivable_sync_status on public.crm_receivables;
create trigger trg_crm_receivable_sync_status
  before insert or update of amount_paid, amount_naira on public.crm_receivables
  for each row execute function public.crm_receivable_sync_status();
