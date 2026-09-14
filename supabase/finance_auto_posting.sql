-- ============================================================================
-- Collarone — the books write themselves
-- Run AFTER finance_ledger.sql. Idempotent; safe to re-run.
-- ============================================================================
--
-- WHAT WAS MISSING
--
-- The ledger was complete and unreachable. ledger_post_entry() had exactly one
-- caller: the "New journal entry" form, where a person hand-types debits and
-- credits. Nothing else in the product ever posted. So:
--
--   approve an expense   -> the books did not change
--   issue an invoice     -> the books did not change
--   take a payment       -> the books did not change
--   run payroll          -> the books did not change
--
-- Profit & loss and the balance sheet are built from entries, so they stayed
-- empty forever unless the owner personally knew double-entry bookkeeping.
-- Production bore that out exactly: 78 seeded accounts across three
-- organisations, and zero journal entries, zero expenses, zero budgets.
--
-- The chart of accounts already had VAT payable, PAYE payable, Pension, NHF and
-- NSITF waiting, and the comment above ledger_post_entry already said it was
-- "used by the UI and by the automatic postings". The automatic postings were
-- planned and never written. This is that file.
--
-- WHY TRIGGERS AND NOT API CALLS
--
-- A posting made by a separate call can fail on its own, leaving an expense
-- approved and the books silently short by that amount — nothing throws, and
-- the divergence is only discovered when somebody reconciles. That is the same
-- fail-silent shape as the payroll geo gate and the login redirect guard.
-- Inside a trigger the posting shares the transaction with the thing that
-- caused it, so either both happen or neither does, and the books cannot drift
-- from operations.
--
-- WHY A SEPARATE POSTING FUNCTION
--
-- ledger_post_entry() demands is_finance_manager(). That is right for someone
-- typing a journal by hand, and wrong here: the person releasing a payroll run
-- or recording an invoice payment has already been authorised to do THAT, and
-- the posting is a consequence of it, not a second privilege. ledger_post_auto()
-- takes the organisation explicitly, so it also works when the caller is a
-- webhook running as the service role with no my_org_id().
--
-- Money is Naira throughout, as everywhere else in this schema: numeric, whole
-- naira and kobo, no currency column and no conversion anywhere.

-- ---------------------------------------------------------------------------
-- 1. Accounts the automatic postings need
-- ---------------------------------------------------------------------------
-- Staff loans are an ASSET: the business is owed the money back, and each
-- payroll deduction reduces it. Without this account a run with loan
-- repayments cannot balance.
create or replace function public.seed_ledger_accounts_extra(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.ledger_accounts (org_id, code, name, type, is_system) values
    (p_org, '1250', 'Staff loans', 'asset', true)
  on conflict (org_id, code) do nothing;
end;
$$;
-- Definer, writes, and takes the organisation as an argument — so left callable
-- it would let any signed-in person insert an account into somebody else's
-- chart. Nothing outside this file needs it: the posting triggers are
-- themselves definer and call it as the owner. Caught by
-- test/definer_org_scope.mjs, which is exactly the shape it watches for.
revoke execute on function public.seed_ledger_accounts_extra(uuid) from public, anon, authenticated;

do $$
declare o record;
begin
  for o in select id from public.organizations loop
    perform public.seed_ledger_accounts_extra(o.id);
  end loop;
end $$;

-- Which expense account a category lands in. Without this every expense in the
-- business piles into "General & administrative", and a profit & loss where one
-- line is 90% of costs tells the owner nothing.
alter table public.expense_categories
  add column if not exists ledger_code text not null default '6900';

-- Best guess from the name, once, for categories that already exist. The owner
-- can change it afterwards; this only stops everything starting in one bucket.
update public.expense_categories set ledger_code = case
  when name ~* 'rent|lease'                      then '6100'
  when name ~* 'diesel|fuel|power|electric|util' then '6200'
  when name ~* 'transport|logistic|travel|fare'  then '6300'
  when name ~* 'bank|charge|commission'          then '6400'
  when name ~* 'salar|wage|staff cost'           then '6000'
  when name ~* 'stock|goods|material|purchase'   then '5000'
  else '6900' end
where ledger_code = '6900';

-- ---------------------------------------------------------------------------
-- 2. The posting engine used by every trigger below
-- ---------------------------------------------------------------------------
-- Same guarantees as ledger_post_entry: it balances or it raises, it writes
-- nothing until the arithmetic checks out, and (org_id, source_type, source_id)
-- makes a second attempt a no-op rather than a duplicate. Not granted to
-- anybody: triggers only.
create or replace function public.ledger_post_auto(
  p_org         uuid,
  p_entry_date  date,
  p_memo        text,
  p_lines       jsonb,          -- [{code, debit, credit, description}]
  p_source_type text,
  p_source_id   uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_entry uuid;
  l jsonb;
  v_acct uuid;
  v_debits numeric := 0;
  v_credits numeric := 0;
begin
  if p_org is null then raise exception 'ledger_post_auto: no organisation'; end if;

  -- Drop zero lines: a business with no pension deduction should not get a
  -- ₦0.00 line on every payslip entry, and ledger_line_one_side would refuse it.
  select coalesce(jsonb_agg(x), '[]'::jsonb) into p_lines
    from jsonb_array_elements(p_lines) x
   where round(coalesce((x->>'debit')::numeric, 0), 2) > 0
      or round(coalesce((x->>'credit')::numeric, 0), 2) > 0;

  if jsonb_array_length(p_lines) < 2 then return null; end if;  -- nothing of substance

  for l in select * from jsonb_array_elements(p_lines) loop
    v_debits  := v_debits  + round(coalesce((l->>'debit')::numeric, 0), 2);
    v_credits := v_credits + round(coalesce((l->>'credit')::numeric, 0), 2);
  end loop;
  if round(v_debits, 2) <> round(v_credits, 2) then
    raise exception 'Automatic posting (%) does not balance: debits ₦% vs credits ₦%',
      p_source_type, round(v_debits, 2), round(v_credits, 2);
  end if;

  insert into public.ledger_entries (org_id, entry_date, memo, status, source_type, source_id, created_by)
  values (p_org, p_entry_date, coalesce(p_memo, ''), 'draft', p_source_type, p_source_id, auth.uid())
  on conflict (org_id, source_type, source_id) do nothing
  returning id into v_entry;
  if v_entry is null then return null; end if;   -- already posted from this source

  for l in select * from jsonb_array_elements(p_lines) loop
    select id into v_acct from public.ledger_accounts
     where org_id = p_org and code = (l->>'code') and active;
    if v_acct is null then
      -- A missing account means the chart was edited out from under us. Seed
      -- and retry once rather than block somebody's payroll over it.
      perform public.seed_ledger_accounts(p_org);
      perform public.seed_ledger_accounts_extra(p_org);
      select id into v_acct from public.ledger_accounts
       where org_id = p_org and code = (l->>'code') and active;
      if v_acct is null then
        raise exception 'Automatic posting (%): no active account with code %', p_source_type, (l->>'code');
      end if;
    end if;
    insert into public.ledger_lines (org_id, entry_id, account_id, debit, credit, description)
    values (p_org, v_entry, v_acct,
            round(coalesce((l->>'debit')::numeric, 0), 2),
            round(coalesce((l->>'credit')::numeric, 0), 2),
            coalesce(l->>'description', ''));
  end loop;

  update public.ledger_entries set status = 'posted', posted_at = now() where id = v_entry;
  return v_entry;
end;
$$;
revoke execute on function public.ledger_post_auto(uuid, date, text, jsonb, text, uuid) from public, anon, authenticated;

-- Undo, when the thing that caused a posting is undone. Mirrors the entry
-- rather than deleting it — ledger_entry_guard() refuses deletion of a posted
-- entry, which is exactly what makes these books worth trusting.
create or replace function public.ledger_unpost_auto(p_org uuid, p_source_type text, p_source_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_entry public.ledger_entries; v_new uuid; l record;
begin
  select * into v_entry from public.ledger_entries
   where org_id = p_org and source_type = p_source_type and source_id = p_source_id and status = 'posted';
  if not found then return; end if;

  insert into public.ledger_entries (org_id, entry_date, memo, status, source_type, source_id, created_by)
  values (p_org, current_date, 'Reversal of ' || coalesce(v_entry.memo, ''), 'draft',
          p_source_type || ':reversal', p_source_id, auth.uid())
  on conflict (org_id, source_type, source_id) do nothing
  returning id into v_new;
  if v_new is null then return; end if;   -- already reversed

  for l in select * from public.ledger_lines where entry_id = v_entry.id loop
    insert into public.ledger_lines (org_id, entry_id, account_id, debit, credit, description)
    values (p_org, v_new, l.account_id, l.credit, l.debit, 'Reversal: ' || l.description);
  end loop;

  update public.ledger_entries set status = 'posted', posted_at = now() where id = v_new;
  update public.ledger_entries set status = 'void' where id = v_entry.id;
end;
$$;
revoke execute on function public.ledger_unpost_auto(uuid, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Expenses
-- ---------------------------------------------------------------------------
-- Approved: the business owes it.        Dr expense + Dr VAT, Cr payables
-- Paid:     the money actually left.     Dr payables, Cr bank
-- Two entries on purpose. An expense approved in March and paid in April
-- belongs in March's profit and April's cash, and collapsing them into one
-- would misstate both.
create or replace function public.trg_expense_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_net numeric; v_vat numeric; v_code text; v_memo text;
begin
  v_net := round(coalesce(new.amount, 0), 2);
  v_vat := round(coalesce(new.total_amount, new.amount) - coalesce(new.amount, 0), 2);
  select coalesce(c.ledger_code, '6900') into v_code
    from public.expense_categories c where c.id = new.category_id;
  v_code := coalesce(v_code, '6900');
  v_memo := coalesce(nullif(new.description, ''), 'Expense')
            || case when coalesce(new.vendor, '') <> '' then ' — ' || new.vendor else '' end;

  if new.status = 'approved' and coalesce(old.status, '') is distinct from 'approved'
     and coalesce(old.status, '') <> 'paid' then
    perform public.ledger_post_auto(new.org_id, new.expense_date, v_memo,
      jsonb_build_array(
        jsonb_build_object('code', v_code,  'debit', v_net, 'credit', 0, 'description', v_memo),
        jsonb_build_object('code', '2100',  'debit', v_vat, 'credit', 0, 'description', 'Input VAT'),
        jsonb_build_object('code', '2000',  'debit', 0, 'credit', v_net + v_vat, 'description', 'Owed for ' || v_memo)
      ), 'expense', new.id);
  end if;

  if new.status = 'paid' and coalesce(old.status, '') is distinct from 'paid' then
    -- An expense can be paid without passing through approved (petty cash paid
    -- on the spot), so make sure the cost itself is in the books first.
    perform public.ledger_post_auto(new.org_id, new.expense_date, v_memo,
      jsonb_build_array(
        jsonb_build_object('code', v_code, 'debit', v_net, 'credit', 0, 'description', v_memo),
        jsonb_build_object('code', '2100', 'debit', v_vat, 'credit', 0, 'description', 'Input VAT'),
        jsonb_build_object('code', '2000', 'debit', 0, 'credit', v_net + v_vat, 'description', 'Owed for ' || v_memo)
      ), 'expense', new.id);
    perform public.ledger_post_auto(new.org_id, new.expense_date, 'Paid: ' || v_memo,
      jsonb_build_array(
        jsonb_build_object('code', '2000', 'debit', v_net + v_vat, 'credit', 0, 'description', 'Settled ' || v_memo),
        jsonb_build_object('code', '1010', 'debit', 0, 'credit', v_net + v_vat, 'description', 'Paid ' || v_memo)
      ), 'expense_payment', new.id);
  end if;

  -- Taken back: reverse, newest first.
  if new.status in ('pending', 'rejected') and coalesce(old.status, '') in ('approved', 'paid') then
    perform public.ledger_unpost_auto(new.org_id, 'expense_payment', new.id);
    perform public.ledger_unpost_auto(new.org_id, 'expense', new.id);
  end if;

  return new;
end;
$$;
drop trigger if exists trg_expense_post on public.expenses;
create trigger trg_expense_post after insert or update of status on public.expenses
  for each row execute function public.trg_expense_post();

-- ---------------------------------------------------------------------------
-- 4. Invoices and the money they bring in
-- ---------------------------------------------------------------------------
-- Issued: Dr receivable, Cr sales + Cr VAT. Only invoices — a quote or a
-- delivery note promises nobody any money and must never touch the books.
create or replace function public.trg_trade_doc_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_sub numeric; v_vat numeric; v_memo text;
begin
  if new.doc_type <> 'invoice' then return new; end if;

  -- vat_amount and total are already computed on the row; recomputing them from
  -- subtotal * vat_rate would give a second opinion about the same invoice, and
  -- the customer was billed the one printed on the document.
  v_sub := round(coalesce(new.subtotal, 0), 2);
  v_vat := round(coalesce(new.vat_amount, 0), 2);
  v_memo := 'Invoice ' || coalesce(new.doc_no, '') || ' — ' || coalesce(new.party_name, 'customer');

  if new.status in ('issued', 'part_paid', 'paid')
     and coalesce(old.status, '') not in ('issued', 'part_paid', 'paid') then
    perform public.ledger_post_auto(new.org_id, new.created_at::date, v_memo,
      jsonb_build_array(
        jsonb_build_object('code', '1200', 'debit', round(coalesce(new.total, v_sub + v_vat), 2), 'credit', 0, 'description', v_memo),
        jsonb_build_object('code', '4000', 'debit', 0, 'credit', v_sub, 'description', v_memo),
        jsonb_build_object('code', '2100', 'debit', 0, 'credit', v_vat, 'description', 'VAT on ' || coalesce(new.doc_no, ''))
      ), 'invoice', new.id);
  end if;

  if new.status = 'void' and coalesce(old.status, '') in ('issued', 'part_paid', 'paid') then
    perform public.ledger_unpost_auto(new.org_id, 'invoice', new.id);
  end if;

  return new;
end;
$$;
drop trigger if exists trg_trade_doc_post on public.trade_documents;
create trigger trg_trade_doc_post after insert or update of status on public.trade_documents
  for each row execute function public.trg_trade_doc_post();

-- A payment lands in the bank (or the till) and clears what the customer owed.
create or replace function public.trg_trade_payment_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_doc public.trade_documents; v_code text; v_memo text;
begin
  select * into v_doc from public.trade_documents where id = new.doc_id;
  if not found then return new; end if;
  -- Cash in hand only when somebody says cash; anything else settles in a bank.
  v_code := case when lower(coalesce(new.method, '')) = 'cash' then '1000' else '1010' end;
  v_memo := 'Payment for ' || coalesce(v_doc.doc_no, 'invoice')
            || case when coalesce(new.reference, '') <> '' then ' (' || new.reference || ')' else '' end;

  perform public.ledger_post_auto(v_doc.org_id, current_date, v_memo,
    jsonb_build_array(
      jsonb_build_object('code', v_code, 'debit', round(new.amount, 2), 'credit', 0, 'description', v_memo),
      jsonb_build_object('code', '1200', 'debit', 0, 'credit', round(new.amount, 2), 'description', 'Cleared by ' || v_memo)
    ), 'invoice_payment', new.id);
  return new;
end;
$$;
drop trigger if exists trg_trade_payment_post on public.trade_doc_payments;
create trigger trg_trade_payment_post after insert on public.trade_doc_payments
  for each row execute function public.trg_trade_payment_post();

-- ---------------------------------------------------------------------------
-- 5. Payroll
-- ---------------------------------------------------------------------------
-- One entry for the whole run, at approval — that is the moment the company
-- owes the money, whoever it is owed to. Every statutory deduction goes to the
-- account that has been sitting empty waiting for it, so a month later the
-- owner can see exactly what is owed to FIRS, to the PFA, to NHF and to NSITF
-- without opening payroll at all.
create or replace function public.trg_payroll_run_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if new.status = 'approved' and coalesce(old.status, '') is distinct from 'approved' then
    -- The net figure is DERIVED, not stored independently (payroll_sync_deductions):
    --   net = gross - pension_employee - nhf - paye - other_deductions + nontaxable_earnings
    -- Two consequences the books have to respect, or the entry will not balance
    -- for any real run:
    --   * other_deductions is itself manual_deductions + loan_deductions, and
    --     those settle against different things — a loan repayment reduces an
    --     asset, a manual deduction is owed to somebody.
    --   * nontaxable_earnings is money paid out that never entered gross: a
    --     reimbursement, the company repaying what the employee already spent.
    --     It needs its own cost line or the entry is short by exactly that much.
    select coalesce(sum(gross), 0) gross, coalesce(sum(paye), 0) paye,
           coalesce(sum(pension_employee), 0) pe, coalesce(sum(pension_employer), 0) pr,
           coalesce(sum(nhf), 0) nhf, coalesce(sum(nsitf), 0) nsitf,
           coalesce(sum(loan_deductions), 0) loans, coalesce(sum(manual_deductions), 0) manual,
           coalesce(sum(nontaxable_earnings), 0) reimb, coalesce(sum(net), 0) net
      into t from public.payroll_lines where run_id = new.id;

    perform public.ledger_post_auto(new.org_id, current_date,
      'Payroll ' || new.period_month || '/' || new.period_year,
      jsonb_build_array(
        jsonb_build_object('code', '6000', 'debit', round(t.gross, 2),  'credit', 0, 'description', 'Gross pay'),
        jsonb_build_object('code', '6010', 'debit', round(t.pr, 2),     'credit', 0, 'description', 'Employer pension'),
        jsonb_build_object('code', '6020', 'debit', round(t.nsitf, 2),  'credit', 0, 'description', 'NSITF'),
        jsonb_build_object('code', '6900', 'debit', round(t.reimb, 2),  'credit', 0, 'description', 'Reimbursements paid with salaries'),
        jsonb_build_object('code', '2200', 'debit', 0, 'credit', round(t.paye, 2),        'description', 'PAYE withheld'),
        jsonb_build_object('code', '2210', 'debit', 0, 'credit', round(t.pe + t.pr, 2),   'description', 'Pension, employee and employer'),
        jsonb_build_object('code', '2220', 'debit', 0, 'credit', round(t.nhf, 2),         'description', 'NHF withheld'),
        jsonb_build_object('code', '2230', 'debit', 0, 'credit', round(t.nsitf, 2),       'description', 'NSITF payable'),
        jsonb_build_object('code', '1250', 'debit', 0, 'credit', round(t.loans, 2),       'description', 'Staff loan repayments'),
        jsonb_build_object('code', '2000', 'debit', 0, 'credit', round(t.manual, 2),      'description', 'Other staff deductions'),
        jsonb_build_object('code', '2300', 'debit', 0, 'credit', round(t.net, 2),         'description', 'Net pay owed to staff')
      ), 'payroll', new.id);
  end if;

  -- Money actually leaves when the bank file is sent.
  if new.status in ('released', 'disbursed') and coalesce(old.status, '') not in ('released', 'disbursed') then
    select coalesce(sum(net), 0) net into t from public.payroll_lines where run_id = new.id;
    perform public.ledger_post_auto(new.org_id, current_date,
      'Salaries paid, ' || new.period_month || '/' || new.period_year,
      jsonb_build_array(
        jsonb_build_object('code', '2300', 'debit', round(t.net, 2), 'credit', 0, 'description', 'Net pay settled'),
        jsonb_build_object('code', '1010', 'debit', 0, 'credit', round(t.net, 2), 'description', 'Paid to staff bank accounts')
      ), 'payroll_payment', new.id);
  end if;

  if new.status in ('draft', 'review') and coalesce(old.status, '') in ('approved', 'released', 'disbursed') then
    perform public.ledger_unpost_auto(new.org_id, 'payroll_payment', new.id);
    perform public.ledger_unpost_auto(new.org_id, 'payroll', new.id);
  end if;

  return new;
end;
$$;
drop trigger if exists trg_payroll_run_post on public.payroll_runs;
create trigger trg_payroll_run_post after update of status on public.payroll_runs
  for each row execute function public.trg_payroll_run_post();

-- ---------------------------------------------------------------------------
-- 6. Opening balances
-- ---------------------------------------------------------------------------
-- A business that already exists does not start from nothing: there is money in
-- the bank, stock on the shelf, customers who owe, and bills outstanding.
-- Without a way to say so the balance sheet can never be right, however
-- diligent the bookkeeping afterwards. Whatever does not balance is the
-- owner's stake, which is what equity means.
create or replace function public.ledger_set_opening_balances(
  p_as_at date,
  p_cash numeric default 0, p_bank numeric default 0, p_receivable numeric default 0,
  p_inventory numeric default 0, p_equipment numeric default 0,
  p_payable numeric default 0, p_loans numeric default 0
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org_id();
  v_assets numeric; v_liab numeric; v_equity numeric; v_lines jsonb;
begin
  if v_org is null then raise exception 'Not signed in'; end if;
  if not public.is_finance_manager() then
    raise exception 'Only a finance manager can set opening balances.';
  end if;
  if exists (select 1 from public.ledger_entries
              where org_id = v_org and source_type = 'opening' and status = 'posted') then
    raise exception 'Opening balances are already set. Post an adjusting journal entry instead — they are the one thing that must not move under the accounts built on them.';
  end if;

  v_assets := round(coalesce(p_cash,0) + coalesce(p_bank,0) + coalesce(p_receivable,0)
                  + coalesce(p_inventory,0) + coalesce(p_equipment,0), 2);
  v_liab   := round(coalesce(p_payable,0) + coalesce(p_loans,0), 2);
  v_equity := round(v_assets - v_liab, 2);

  v_lines := jsonb_build_array(
    jsonb_build_object('code','1000','debit',round(coalesce(p_cash,0),2),'credit',0,'description','Opening cash'),
    jsonb_build_object('code','1010','debit',round(coalesce(p_bank,0),2),'credit',0,'description','Opening bank'),
    jsonb_build_object('code','1200','debit',round(coalesce(p_receivable,0),2),'credit',0,'description','Owed by customers'),
    jsonb_build_object('code','1300','debit',round(coalesce(p_inventory,0),2),'credit',0,'description','Opening stock'),
    jsonb_build_object('code','1500','debit',round(coalesce(p_equipment,0),2),'credit',0,'description','Equipment and assets'),
    jsonb_build_object('code','2000','debit',0,'credit',round(coalesce(p_payable,0),2),'description','Owed to suppliers'),
    jsonb_build_object('code','1250','debit',0,'credit',round(coalesce(p_loans,0),2),'description','Outstanding staff loans')
  );
  -- Equity takes whichever side makes the sheet balance: a business carrying
  -- more debt than assets has negative equity, and saying so is the point.
  v_lines := v_lines || jsonb_build_array(
    case when v_equity >= 0
      then jsonb_build_object('code','3000','debit',0,'credit',v_equity,'description','Owner''s stake at start')
      else jsonb_build_object('code','3000','debit',-v_equity,'credit',0,'description','Owner''s stake at start') end);

  return public.ledger_post_auto(v_org, p_as_at, 'Opening balances', v_lines, 'opening', v_org);
end;
$$;
grant execute on function public.ledger_set_opening_balances(date, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Bank-only movements
-- ---------------------------------------------------------------------------
-- A bank charge, interest or a transfer has no document behind it, so nothing
-- else will ever post it. Without this the bank can never be reconciled to the
-- last naira, and "do my books agree with the bank" stays unanswerable.
create or replace function public.ledger_post_bank_line(p_line uuid, p_code text, p_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org_id();
  v_line public.bank_statement_lines;
  v_amt numeric;
begin
  if v_org is null then raise exception 'Not signed in'; end if;
  if not public.is_finance_manager() then
    raise exception 'Only a finance manager can record a bank line to the books.';
  end if;
  select * into v_line from public.bank_statement_lines where id = p_line and org_id = v_org;
  if not found then raise exception 'That bank line is not in this workspace.'; end if;

  v_amt := round(abs(coalesce(v_line.amount, 0)), 2);
  if v_amt = 0 then raise exception 'That line is for ₦0.00, there is nothing to record.'; end if;

  return public.ledger_post_auto(v_org, v_line.line_date,
    coalesce(nullif(p_note, ''), nullif(v_line.description, ''), 'Bank movement'),
    case when coalesce(v_line.amount, 0) < 0
      then jsonb_build_array(   -- money out
        jsonb_build_object('code', p_code, 'debit', v_amt, 'credit', 0, 'description', coalesce(v_line.description, '')),
        jsonb_build_object('code', '1010', 'debit', 0, 'credit', v_amt, 'description', 'Out of the bank'))
      else jsonb_build_array(   -- money in
        jsonb_build_object('code', '1010', 'debit', v_amt, 'credit', 0, 'description', 'Into the bank'),
        jsonb_build_object('code', p_code, 'debit', 0, 'credit', v_amt, 'description', coalesce(v_line.description, '')))
    end, 'bank', p_line);
end;
$$;
grant execute on function public.ledger_post_bank_line(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. What the owner actually asks: how much money do we have
-- ---------------------------------------------------------------------------
create or replace function public.finance_cash_position()
returns table (code text, name text, balance numeric)
language sql security definer set search_path = public stable as $$
  select a.code, a.name,
         round(coalesce(sum(l.debit), 0) - coalesce(sum(l.credit), 0), 2) as balance
    from public.ledger_accounts a
    left join public.ledger_lines l on l.account_id = a.id
    left join public.ledger_entries e on e.id = l.entry_id and e.status = 'posted'
   where a.org_id = public.my_org_id() and a.code in ('1000', '1010')
   group by a.code, a.name
   order by a.code;
$$;
grant execute on function public.finance_cash_position() to authenticated;
