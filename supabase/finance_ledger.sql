-- ============================================================================
-- Collarone — General Ledger (double-entry)
-- Run after finance.sql. Idempotent. Multi-tenant from the first line.
--
-- Context worth recording: the module board CUT a general ledger, on the
-- grounds that competing with QuickBooks and Zoho Books is three to six months
-- for a customer who already pays an accountant with a licence. The founder
-- overrode that on 2026-08-08 ("also add the ledger stuff"). This is the
-- foundation, built to be correct rather than broad: accounts, balanced
-- journals, and the three statements that fall out of them. No FX, no
-- inventory valuation, no fixed-asset depreciation, no tax return generation.
--
-- The one rule that makes a ledger a ledger: every entry balances, and posted
-- entries never change. Both are enforced in the database, not in the UI —
-- an accountant's trust in the numbers is the entire product here, and a
-- client-side check is not a guarantee.
--
-- NGN only, matching the rest of Finance (plain numeric naira, no FX).
-- ============================================================================

-- ---- chart of accounts ------------------------------------------------------
-- Types drive the sign convention and which statement an account lands on.
-- asset/expense are DEBIT-natured; liability/equity/income are CREDIT-natured.
create table if not exists public.ledger_accounts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  code        text not null,
  name        text not null,
  type        text not null check (type in ('asset','liability','equity','income','expense')),
  parent_id   uuid references public.ledger_accounts(id) on delete set null,
  is_system   boolean not null default false,  -- seeded; renameable, not deletable
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, code)
);
create index if not exists ledger_accounts_org_idx on public.ledger_accounts (org_id, code);

-- ---- journal entries --------------------------------------------------------
-- An entry is a dated, described set of lines. `source` records what produced
-- it so an automatic posting can be traced back to the invoice, expense or
-- payroll run it came from — and so we never post the same source twice.
create table if not exists public.ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  entry_no      bigint,
  entry_date    date not null,
  memo          text not null default '',
  status        text not null default 'draft' check (status in ('draft','posted','void')),
  source_type   text,   -- 'manual' | 'invoice' | 'expense' | 'payroll' | 'bank'
  source_id     uuid,
  created_by    uuid references public.profiles(id),
  posted_at     timestamptz,
  posted_by     uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  unique (org_id, source_type, source_id)
);
create index if not exists ledger_entries_org_date_idx on public.ledger_entries (org_id, entry_date);

create table if not exists public.ledger_lines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  entry_id    uuid not null references public.ledger_entries(id) on delete cascade,
  account_id  uuid not null references public.ledger_accounts(id),
  debit       numeric not null default 0 check (debit  >= 0),
  credit      numeric not null default 0 check (credit >= 0),
  description text not null default '',
  -- A line is one side or the other. Both, or neither, is a data-entry slip.
  constraint ledger_line_one_side check ((debit > 0) <> (credit > 0))
);
create index if not exists ledger_lines_entry_idx   on public.ledger_lines (entry_id);
create index if not exists ledger_lines_account_idx on public.ledger_lines (account_id);

-- ---- entry numbering (per org, gapless within the org) ----------------------
create or replace function public.ledger_next_entry_no(p_org uuid)
returns bigint language sql stable set search_path = public as $$
  select coalesce(max(entry_no), 0) + 1 from public.ledger_entries where org_id = p_org;
$$;

-- ---- THE RULE: posted entries balance, and posted entries are frozen --------
create or replace function public.ledger_entry_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_debit numeric; v_credit numeric; v_lines int;
begin
  if tg_op = 'DELETE' then
    if old.status = 'posted' then
      raise exception 'A posted journal entry cannot be deleted. Reverse it instead — the audit trail is the point.';
    end if;
    return old;
  end if;

  -- Freeze everything once posted, except the move to void (which is how a
  -- mistake is retired; the reversing entry carries the correction).
  if old.status = 'posted' and new.status = 'posted' then
    if new.entry_date is distinct from old.entry_date
       or new.memo is distinct from old.memo then
      raise exception 'A posted journal entry cannot be edited. Post a reversing entry instead.';
    end if;
  end if;
  if old.status = 'void' then
    raise exception 'A voided journal entry cannot be changed.';
  end if;

  -- On the draft -> posted transition, prove it balances and has substance.
  if new.status = 'posted' and old.status <> 'posted' then
    select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*)
      into v_debit, v_credit, v_lines
      from public.ledger_lines where entry_id = new.id;
    if v_lines < 2 then
      raise exception 'A journal entry needs at least two lines — one debit and one credit.';
    end if;
    if round(v_debit, 2) <> round(v_credit, 2) then
      raise exception 'This entry does not balance: debits % vs credits %.',
        round(v_debit, 2), round(v_credit, 2);
    end if;
    new.posted_at := now();
    new.posted_by := auth.uid();
    if new.entry_no is null then
      new.entry_no := public.ledger_next_entry_no(new.org_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ledger_entry_guard on public.ledger_entries;
create trigger trg_ledger_entry_guard
  before update or delete on public.ledger_entries
  for each row execute function public.ledger_entry_guard();

-- Lines of a posted entry are immutable too, or the balance check above would
-- be a formality anyone could walk around after the fact.
create or replace function public.ledger_line_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_status text;
begin
  select status into v_status from public.ledger_entries
   where id = coalesce(new.entry_id, old.entry_id);
  if v_status = 'posted' then
    raise exception 'The lines of a posted entry cannot be changed. Post a reversing entry instead.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_ledger_line_guard on public.ledger_lines;
create trigger trg_ledger_line_guard
  before insert or update or delete on public.ledger_lines
  for each row execute function public.ledger_line_guard();

-- ---- RLS --------------------------------------------------------------------
alter table public.ledger_accounts enable row level security;
alter table public.ledger_entries  enable row level security;
alter table public.ledger_lines    enable row level security;

drop policy if exists ledger_accounts_select on public.ledger_accounts;
create policy ledger_accounts_select on public.ledger_accounts for select
  using (public.same_org(org_id) and public.has_finance_suite());
drop policy if exists ledger_accounts_write on public.ledger_accounts;
create policy ledger_accounts_write on public.ledger_accounts for all
  using (public.same_org(org_id) and public.is_finance_manager() and not public.is_support_session())
  with check (public.same_org(org_id) and public.is_finance_manager() and not public.is_support_session());

drop policy if exists ledger_entries_select on public.ledger_entries;
create policy ledger_entries_select on public.ledger_entries for select
  using (public.same_org(org_id) and public.has_finance_suite());
drop policy if exists ledger_entries_write on public.ledger_entries;
create policy ledger_entries_write on public.ledger_entries for all
  using (public.same_org(org_id) and public.is_finance_manager() and not public.is_support_session())
  with check (public.same_org(org_id) and public.is_finance_manager() and not public.is_support_session());

drop policy if exists ledger_lines_select on public.ledger_lines;
create policy ledger_lines_select on public.ledger_lines for select
  using (public.same_org(org_id) and public.has_finance_suite());
drop policy if exists ledger_lines_write on public.ledger_lines;
create policy ledger_lines_write on public.ledger_lines for all
  using (public.same_org(org_id) and public.is_finance_manager() and not public.is_support_session())
  with check (public.same_org(org_id) and public.is_finance_manager() and not public.is_support_session());

-- ---- default chart of accounts ----------------------------------------------
-- Deliberately small. A Nigerian SME does not need 200 accounts on day one,
-- and a wall of unfamiliar codes is the reason people abandon bookkeeping
-- software. VAT and WHT are split out because they are the two the FIRS
-- actually asks about, and payroll statutories get their own liabilities
-- because that is how the remittance schedule reads.
create or replace function public.seed_ledger_accounts(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.ledger_accounts (org_id, code, name, type, is_system) values
    (p_org, '1000', 'Cash',                        'asset',     true),
    (p_org, '1010', 'Bank',                        'asset',     true),
    (p_org, '1200', 'Accounts receivable',         'asset',     true),
    (p_org, '1300', 'Inventory',                   'asset',     true),
    (p_org, '1500', 'Equipment & assets',          'asset',     true),
    (p_org, '2000', 'Accounts payable',            'liability', true),
    (p_org, '2100', 'VAT payable',                 'liability', true),
    (p_org, '2110', 'WHT payable',                 'liability', true),
    (p_org, '2200', 'PAYE payable',                'liability', true),
    (p_org, '2210', 'Pension payable',             'liability', true),
    (p_org, '2220', 'NHF payable',                 'liability', true),
    (p_org, '2230', 'NSITF payable',               'liability', true),
    (p_org, '2300', 'Salaries payable',            'liability', true),
    (p_org, '3000', 'Owner''s equity',             'equity',    true),
    (p_org, '3900', 'Retained earnings',           'equity',    true),
    (p_org, '4000', 'Sales',                       'income',    true),
    (p_org, '4100', 'Other income',                'income',    true),
    (p_org, '5000', 'Cost of sales',               'expense',   true),
    (p_org, '6000', 'Salaries & wages',            'expense',   true),
    (p_org, '6010', 'Pension (employer)',          'expense',   true),
    (p_org, '6020', 'NSITF (employer)',            'expense',   true),
    (p_org, '6100', 'Rent',                        'expense',   true),
    (p_org, '6200', 'Utilities & diesel',          'expense',   true),
    (p_org, '6300', 'Transport & logistics',       'expense',   true),
    (p_org, '6400', 'Bank charges',                'expense',   true),
    (p_org, '6900', 'General & administrative',    'expense',   true)
  on conflict (org_id, code) do nothing;
end;
$$;
grant execute on function public.seed_ledger_accounts(uuid) to authenticated;

-- Every existing org gets the chart, so the module is never an empty screen.
do $$
declare o record;
begin
  for o in select id from public.organizations loop
    perform public.seed_ledger_accounts(o.id);
  end loop;
end $$;

-- ---- posting helper ----------------------------------------------------------
-- One function for "record this as a balanced entry", used by the UI and by
-- the automatic postings. Takes lines as jsonb: [{code, debit, credit, description}]
create or replace function public.ledger_post_entry(
  p_entry_date date,
  p_memo       text,
  p_lines      jsonb,
  p_source_type text default 'manual',
  p_source_id   uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org_id();
  v_entry uuid;
  l jsonb;
  v_acct uuid;
  v_debits numeric := 0;
  v_credits numeric := 0;
begin
  if v_org is null then raise exception 'Not signed in'; end if;
  if not public.is_finance_manager() then
    raise exception 'Only a finance manager can post to the ledger.';
  end if;
  if jsonb_array_length(p_lines) < 2 then
    raise exception 'A journal entry needs at least two lines — one debit and one credit.';
  end if;

  -- Check the arithmetic before writing anything, so a bad entry never leaves
  -- a half-built draft behind.
  for l in select * from jsonb_array_elements(p_lines) loop
    v_debits  := v_debits  + coalesce((l->>'debit')::numeric, 0);
    v_credits := v_credits + coalesce((l->>'credit')::numeric, 0);
  end loop;
  if round(v_debits, 2) <> round(v_credits, 2) then
    raise exception 'This entry does not balance: debits % vs credits %.', round(v_debits, 2), round(v_credits, 2);
  end if;

  insert into public.ledger_entries (org_id, entry_date, memo, status, source_type, source_id, created_by)
  values (v_org, p_entry_date, coalesce(p_memo, ''), 'draft', p_source_type, p_source_id, auth.uid())
  on conflict (org_id, source_type, source_id) do nothing
  returning id into v_entry;
  -- Already posted from this source: nothing to do, and say so quietly.
  if v_entry is null then return null; end if;

  for l in select * from jsonb_array_elements(p_lines) loop
    select id into v_acct from public.ledger_accounts
     where org_id = v_org and code = (l->>'code') and active;
    if v_acct is null then
      raise exception 'No active account with code %', (l->>'code');
    end if;
    insert into public.ledger_lines (org_id, entry_id, account_id, debit, credit, description)
    values (v_org, v_entry, v_acct,
            coalesce((l->>'debit')::numeric, 0),
            coalesce((l->>'credit')::numeric, 0),
            coalesce(l->>'description', ''));
  end loop;

  update public.ledger_entries set status = 'posted' where id = v_entry;
  return v_entry;
end;
$$;
grant execute on function public.ledger_post_entry(date, text, jsonb, text, uuid) to authenticated;

-- ---- reversal ----------------------------------------------------------------
-- The only sanctioned way to undo. Mirrors every line and marks the original
-- void, so both halves stay visible in the audit trail.
create or replace function public.ledger_reverse_entry(p_entry uuid, p_date date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org_id();
  v_src public.ledger_entries;
  v_new uuid;
begin
  if not public.is_finance_manager() then
    raise exception 'Only a finance manager can reverse a journal entry.';
  end if;
  select * into v_src from public.ledger_entries where id = p_entry and org_id = v_org;
  if v_src.id is null then raise exception 'Entry not found'; end if;
  if v_src.status <> 'posted' then raise exception 'Only a posted entry can be reversed.'; end if;

  insert into public.ledger_entries (org_id, entry_date, memo, status, source_type, source_id, created_by)
  values (v_org, coalesce(p_date, current_date),
          'Reversal of entry ' || coalesce(v_src.entry_no::text, '') || ' — ' || v_src.memo,
          'draft', 'reversal', v_src.id, auth.uid())
  returning id into v_new;

  insert into public.ledger_lines (org_id, entry_id, account_id, debit, credit, description)
  select v_org, v_new, account_id, credit, debit, description
    from public.ledger_lines where entry_id = p_entry;

  update public.ledger_entries set status = 'posted' where id = v_new;
  update public.ledger_entries set status = 'void'   where id = p_entry;
  return v_new;
end;
$$;
grant execute on function public.ledger_reverse_entry(uuid, date) to authenticated;

-- ---- the three statements -----------------------------------------------------
-- Trial balance: every account with its net movement in the window. The whole
-- point is that the two totals match; if they ever don't, something wrote to
-- the tables behind the triggers.
create or replace function public.ledger_trial_balance(p_from date, p_to date)
returns table (code text, name text, type text, debit numeric, credit numeric)
language sql stable security definer set search_path = public as $$
  select a.code, a.name, a.type,
         coalesce(sum(l.debit), 0)  as debit,
         coalesce(sum(l.credit), 0) as credit
  from public.ledger_accounts a
  left join public.ledger_lines l on l.account_id = a.id
  left join public.ledger_entries e on e.id = l.entry_id
   and e.status = 'posted' and e.entry_date between p_from and p_to
  where a.org_id = public.my_org_id()
    and public.has_finance_suite()
  group by a.code, a.name, a.type
  having coalesce(sum(l.debit), 0) <> 0 or coalesce(sum(l.credit), 0) <> 0
  order by a.code;
$$;
grant execute on function public.ledger_trial_balance(date, date) to authenticated;

-- Profit & loss: income less expenses over a window.
create or replace function public.ledger_profit_and_loss(p_from date, p_to date)
returns table (code text, name text, type text, amount numeric)
language sql stable security definer set search_path = public as $$
  select a.code, a.name, a.type,
         case when a.type = 'income'
              then coalesce(sum(l.credit), 0) - coalesce(sum(l.debit), 0)
              else coalesce(sum(l.debit), 0)  - coalesce(sum(l.credit), 0)
         end as amount
  from public.ledger_accounts a
  left join public.ledger_lines l on l.account_id = a.id
  left join public.ledger_entries e on e.id = l.entry_id
   and e.status = 'posted' and e.entry_date between p_from and p_to
  where a.org_id = public.my_org_id()
    and public.has_finance_suite()
    and a.type in ('income','expense')
  group by a.code, a.name, a.type
  having coalesce(sum(l.debit), 0) <> 0 or coalesce(sum(l.credit), 0) <> 0
  order by a.type desc, a.code;
$$;
grant execute on function public.ledger_profit_and_loss(date, date) to authenticated;

-- Balance sheet: cumulative position as at a date. Retained earnings is
-- computed (income less expenses to date) rather than stored, so the sheet
-- always balances without anyone running a year-end close first.
create or replace function public.ledger_balance_sheet(p_as_at date)
returns table (code text, name text, type text, amount numeric)
language sql stable security definer set search_path = public as $$
  with movements as (
    select a.code, a.name, a.type,
           coalesce(sum(l.debit), 0) as d, coalesce(sum(l.credit), 0) as c
    from public.ledger_accounts a
    left join public.ledger_lines l on l.account_id = a.id
    left join public.ledger_entries e on e.id = l.entry_id
     and e.status = 'posted' and e.entry_date <= p_as_at
    where a.org_id = public.my_org_id()
    group by a.code, a.name, a.type
  )
  select code, name, type,
         case when type = 'asset' then d - c else c - d end as amount
    from movements
   where public.has_finance_suite()
     and type in ('asset','liability','equity')
     and (d <> 0 or c <> 0)
  union all
  select '3900*', 'Retained earnings (to date)', 'equity',
         coalesce(sum(case when type = 'income' then c - d else -(d - c) end), 0)
    from movements
   where public.has_finance_suite() and type in ('income','expense')
  order by 1;
$$;
grant execute on function public.ledger_balance_sheet(date) to authenticated;
