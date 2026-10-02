-- regenerated 2026-10-02T02:59Z
-- ============================================================================
-- Collarone — pending migrations, October 2026
-- Paste into the Supabase SQL editor and run once, or:
--   node deploy/apply-sql.mjs supabase/bundles/pending_2026_10.sql --url-file ~/.collarone-db-url
-- Idempotent (safe to run twice), order matters.
--
--   trade_docs_edit.sql       edit a document after it was raised
--   notify_more.sql           personal alerts in the bell + 3 new alerts
--   procurement_orders.sql    purchase orders
--   revoke_anon_execute.sql   re-run so the new functions get the right grants
-- ============================================================================

-- ## trade_docs_edit.sql

-- ============================================================================
-- Collarone — edit a trade document after it was raised.
-- Run after trade_documents.sql, trade_docs_receivables.sql,
-- trade_doc_payment_intents.sql and finance_auto_posting.sql. Idempotent.
--
-- Until now a typo on an invoice could only be fixed by deleting it or by
-- cancelling it and typing the whole thing again. This lets the document be
-- corrected in place, keeping its number and its share link, with the rules a
-- set of books needs:
--
--   * Cancelled, or money already recorded against it: locked. A payment was
--     matched to the amount printed at the time; changing it afterwards would
--     leave the receipt and the invoice disagreeing.
--   * A GRN/SRP that already moved stock: the lines are locked (the warehouse
--     has moved that quantity), everything else can still be fixed.
--   * An invoice that is already in the books (an automatic ledger entry was
--     posted when it was issued): the party, dates and notes can change, the
--     AMOUNTS cannot. ledger_post_auto keeps one entry per invoice, so a
--     changed total could never reach the books and they would silently
--     disagree with the document. The screen offers "correct and re-issue"
--     instead, which cancels this one (reversing its entry) and raises a
--     corrected copy.
--   * A customer may be paying the old amount right now through the card
--     link: an unsettled payment attempt from the last two hours also locks
--     the amounts.
--
-- Drafts can be edited by whoever raised them; anything else by a trade-docs
-- manager, the same people who can change a document's status.
-- ============================================================================

alter table public.trade_documents add column if not exists edited_at timestamptz;
alter table public.trade_documents add column if not exists edited_by uuid references public.profiles(id) on delete set null;

create or replace function public.update_trade_document(
  p_id uuid,
  p_party_name text default '', p_party_phone text default '',
  p_party_email text default '', p_party_address text default '',
  p_contact_id uuid default null, p_vendor_id uuid default null, p_warehouse_id uuid default null,
  p_items jsonb default '[]'::jsonb, p_vat_rate numeric default 0.075,
  p_due_date date default null, p_reference text default '', p_notes text default ''
) returns public.trade_documents language plpgsql security definer set search_path = public as $$
declare
  d public.trade_documents;
  v_line record;
  v_subtotal numeric := 0;
  v_vat numeric := 0;
  v_total numeric := 0;
  v_money_changed boolean;
  v_in_books boolean;
  v_paying boolean;
  row public.trade_documents;
begin
  if not public.has_trade_docs_suite() then raise exception 'Not authorised to edit trade documents'; end if;

  select * into d from public.trade_documents
   where id = p_id and org_id = public.my_org_id()
   for update;
  if not found then raise exception 'That document could not be found. It may have been deleted.'; end if;

  if not (public.is_trade_docs_manager() or (d.status = 'draft' and d.created_by = auth.uid())) then
    raise exception 'Only a manager can edit a document that has already gone out.';
  end if;
  if d.status = 'void' then raise exception '% is cancelled, so it can no longer be edited.', d.doc_no; end if;
  if coalesce(d.amount_paid, 0) > 0 then
    raise exception 'Money has already been recorded against %, so it can no longer be changed. Cancel it and raise a new one instead.', d.doc_no;
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one line item'; end if;
  if d.stock_linked and p_items is distinct from d.items then
    raise exception '% has already moved stock in the warehouse, so its lines can no longer be changed. Raise a new note for the difference.', d.doc_no;
  end if;

  for v_line in select coalesce((e->>'qty')::numeric, 0) as qty, coalesce((e->>'unit_price')::numeric, 0) as unit_price
                from jsonb_array_elements(p_items) e loop
    v_subtotal := v_subtotal + (v_line.qty * v_line.unit_price);
  end loop;
  v_vat := round(v_subtotal * coalesce(p_vat_rate, 0), 2);
  v_total := v_subtotal + v_vat;

  v_money_changed := round(v_total, 2) <> round(coalesce(d.total, 0), 2)
                  or round(v_vat, 2) <> round(coalesce(d.vat_amount, 0), 2);

  if v_money_changed and d.doc_type = 'invoice' then
    select exists (
      select 1 from public.ledger_entries
       where org_id = d.org_id and source_type = 'invoice' and source_id = d.id and status = 'posted'
    ) into v_in_books;
    if v_in_books then
      raise exception '% is already in your books, so its amounts cannot be changed in place. Use "Correct and re-issue" to cancel it and raise a corrected copy.', d.doc_no;
    end if;

    select exists (
      select 1 from public.trade_doc_payment_intents
       where doc_id = d.id and settled_at is null and created_at > now() - interval '2 hours'
    ) into v_paying;
    if v_paying then
      raise exception 'A customer started paying % in the last two hours, so its amounts are locked for now. Try again later, or cancel it and raise a new one.', d.doc_no;
    end if;
  end if;

  update public.trade_documents set
    party_name    = coalesce(trim(p_party_name), ''),
    party_phone   = coalesce(trim(p_party_phone), ''),
    party_email   = coalesce(trim(p_party_email), ''),
    party_address = coalesce(trim(p_party_address), ''),
    contact_id    = p_contact_id,
    vendor_id     = p_vendor_id,
    -- A note that already moved stock stays tied to the warehouse it moved.
    warehouse_id  = case when d.stock_linked then d.warehouse_id else p_warehouse_id end,
    items         = p_items,
    subtotal      = v_subtotal,
    vat_rate      = coalesce(p_vat_rate, 0),
    vat_amount    = v_vat,
    total         = v_total,
    due_date      = p_due_date,
    reference     = coalesce(trim(p_reference), ''),
    notes         = coalesce(trim(p_notes), ''),
    edited_at     = now(),
    edited_by     = auth.uid()
  where id = d.id and org_id = d.org_id
  returning * into row;

  return row;
end;
$$;
revoke execute on function public.update_trade_document(uuid, text, text, text, text, uuid, uuid, uuid, jsonb, numeric, date, text, text) from public, anon;
grant execute on function public.update_trade_document(uuid, text, text, text, text, uuid, uuid, uuid, jsonb, numeric, date, text, text) to authenticated;

-- ## notify_more.sql

-- ============================================================================
-- Collarone — the alerts that were still missing, and a way to see them all.
-- Run after notification_outbox.sql, notify_events.sql, notify_reminders.sql,
-- procurement.sql, attendance_phase1.sql and compliance.sql. Idempotent.
--
-- 1. YOUR OWN ALERTS, IN THE BELL. Every personal alert (task assigned, leave
--    submitted and decided, probation due, purchase decided, documents and
--    certificates expiring, and the ones below) is written to
--    notification_outbox and delivered only by email. Email is not switched
--    on yet, so the drain marks them "skipped" and nobody hears a thing. The
--    bell reads org_events, which every member of the company can see, so
--    personal alerts cannot go there ("Adaeze's probation ends" is not for the
--    whole office). Each outbox row already names its recipient, so this lets
--    a person read their own rows and nobody else's, and the bell shows them.
--
-- 2. A NEW PURCHASE REQUEST tells the people who can approve it. Until now the
--    requester was told the decision, but the approver was never told there
--    was anything to decide.
--
-- 3. STILL CLOCKED IN 14 hours later: the employee is reminded once, so the
--    shift is corrected while they still remember when they left. (After 20
--    hours attendance_autoclose_stale closes it provisionally.)
--
-- 4. COMPLIANCE DEADLINES: one reminder five days before a statutory filing
--    falls due, and one if it is a day or more late, to the people who hold the
--    Compliance suite. Only for companies that use it, only for rules they
--    have not switched off, and never for a period already marked done.
-- ============================================================================

-- ---- 1. read your own alerts -----------------------------------------------
drop policy if exists "notification_outbox_own_select" on public.notification_outbox;
create policy "notification_outbox_own_select" on public.notification_outbox
  for select to authenticated
  using (recipient_id = auth.uid());
grant select on public.notification_outbox to authenticated;

create index if not exists notification_outbox_recipient_idx
  on public.notification_outbox (recipient_id, created_at desc);

-- ---- 2. a purchase request needs approving ----------------------------------
-- To every procurement manager (owners included), never to the requester
-- themselves, at most five people so a big company is not all copied in.
create or replace function public.notify_purchase_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_who text; v_to uuid;
begin
  if new.status <> 'pending' then return new; end if;
  select name into v_who from public.profiles where id = new.requested_by;
  for v_to in
    select id from public.profiles
     where org_id = new.org_id and status = 'active' and id <> new.requested_by
       and (role = 'super_admin' or suites @> '[{"key":"procurement","role":"manager"}]'::jsonb)
     order by case when role = 'super_admin' then 1 else 0 end, created_at
     limit 5
  loop
    perform public.queue_notification(
      new.org_id, 'purchase_submitted',
      'purchase:' || new.id || ':submitted:' || v_to,
      v_to,
      'Purchase request to approve: ' || left(coalesce(new.item_description, 'an item'), 80),
      coalesce(v_who, 'Someone') || ' asked to buy "' || coalesce(new.item_description, 'an item') || '"'
        || case when coalesce(new.total_cost, 0) > 0
                then ', about ₦' || to_char(round(new.total_cost), 'FM999,999,999,999') else '' end
        || '. Approve or reject it in Buying & Procurement.'
    );
  end loop;
  return new;
end;
$$;
revoke execute on function public.notify_purchase_submitted() from public, anon, authenticated;

drop trigger if exists trg_notify_purchase_submitted on public.purchase_requests;
create trigger trg_notify_purchase_submitted
  after insert on public.purchase_requests
  for each row execute function public.notify_purchase_submitted();

-- ---- 3 + 4. the daily ones ---------------------------------------------------
-- Dates arriving, not events, so they run from the same sweep that calls
-- queue_expiry_reminders (client/api/health.js), and dedupe on the date so a
-- sweep that runs often never nags more than once.
create or replace function public.queue_more_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_period text;
  v_due date;
  v_year int;
  v_month int;
  v_day int;
begin
  -- 3. Still clocked in after 14 hours.
  for r in
    select a.id, a.org_id, a.employee_id, a.clock_in_at
      from public.attendance_records a
      join public.profiles p on p.id = a.employee_id
     where a.clock_out_at is null
       and a.clock_in_at < now() - interval '14 hours'
       and a.clock_in_at > now() - interval '3 days'   -- old ones are the auto-close's job
       and p.status = 'active'
  loop
    perform public.queue_notification(
      r.org_id, 'clockout_missing',
      'clockout:' || r.id,
      r.employee_id,
      'You are still clocked in since ' || to_char(r.clock_in_at at time zone 'Africa/Lagos', 'Dy DD Mon, HH24:MI'),
      'You clocked in at ' || to_char(r.clock_in_at at time zone 'Africa/Lagos', 'HH24:MI on Dy DD Mon')
        || ' and have not clocked out. If you have left, clock out in Time & Attendance, or ask your manager to put in the time you actually left.'
    );
    n := n + 1;
  end loop;

  -- 4. Statutory deadlines, for companies that use the Compliance suite.
  for r in
    select o.id as org_id, cr.key, cr.title, cr.authority, cr.frequency, cr.due_day, cr.default_month,
           pr.annual_month, pr.annual_day, pr.start_period
      from public.organizations o
      cross join public.compliance_rules cr
      left join public.org_compliance_prefs pr on pr.org_id = o.id and pr.rule_key = cr.key
     where o.status in ('active', 'past_due', 'read_only')
       and coalesce(pr.enabled, true)
       and exists (select 1 from public.profiles h
                    where h.org_id = o.id and h.status = 'active'
                      and h.suites @> '[{"key":"compliance"}]'::jsonb)
  loop
    if r.frequency = 'monthly' then
      -- The period that falls due this month is LAST month (PAYE for
      -- September is due 10 October). Same rule as complianceApi.js.
      v_period := to_char(date_trunc('month', v_today) - interval '1 month', 'YYYY-MM');
      v_year := extract(year from v_today); v_month := extract(month from v_today);
      v_day := least(coalesce(r.due_day, 28), extract(day from (date_trunc('month', v_today) + interval '1 month - 1 day'))::int);
      v_due := make_date(v_year, v_month, v_day);
      if r.start_period is not null and v_period < r.start_period then continue; end if;
    else
      v_month := coalesce(r.annual_month, r.default_month);
      if v_month is null then continue; end if;   -- the company has not said when yet
      v_year := extract(year from v_today);
      v_period := v_year::text;
      v_day := least(coalesce(r.annual_day, r.due_day, 28),
                     extract(day from (make_date(v_year, v_month, 1) + interval '1 month - 1 day'))::int);
      v_due := make_date(v_year, v_month, v_day);
    end if;

    if exists (select 1 from public.compliance_marks m
                where m.org_id = r.org_id and m.rule_key = r.key and m.period = v_period) then
      continue;
    end if;

    if v_due between v_today and v_today + 5 or v_due between v_today - 7 and v_today - 1 then
      perform public.queue_notification(
        r.org_id, 'compliance_due',
        'compliance:' || r.org_id || ':' || r.key || ':' || v_period || ':' || case when v_due >= v_today then 'soon' else 'late' end,
        h.id,
        case when v_due >= v_today
             then r.title || ' is due ' || to_char(v_due, 'DD Mon')
             else r.title || ' was due ' || to_char(v_due, 'DD Mon') || ' and is not marked done' end,
        r.title || ' (' || r.authority || ') for ' ||
          case when r.frequency = 'monthly' then to_char(to_date(v_period, 'YYYY-MM'), 'FMMonth YYYY') else v_period end
          || case when v_due >= v_today then ' is due on ' else ' was due on ' end || to_char(v_due, 'DD Mon YYYY')
          || '. Once it is filed, mark it done in the Compliance Calendar so the reminders stop.'
      )
      from (select p.id from public.profiles p
             where p.org_id = r.org_id and p.status = 'active'
               and p.suites @> '[{"key":"compliance"}]'::jsonb
             order by case when p.suites @> '[{"key":"compliance","role":"manager"}]'::jsonb then 0 else 1 end, p.created_at
             limit 3) h;
      n := n + 1;
    end if;
  end loop;

  return n;
end;
$$;
revoke execute on function public.queue_more_reminders() from public, anon, authenticated;
grant execute on function public.queue_more_reminders() to service_role;

-- ## procurement_orders.sql

-- ============================================================================
-- Collarone — purchase orders. Run after procurement.sql, trade_documents.sql,
-- trade_docs_custody.sql and trade_docs_quotes.sql. Idempotent.
--
-- A purchase request could be approved and then "marked ordered", but nothing
-- was ever ORDERED: there was no numbered document to send the supplier, so
-- the order itself happened on WhatsApp and the supplier's invoice had nothing
-- to be checked against. A purchase order is that document.
--
-- It is a trade document (doc_type 'purchase_order', numbered PO-000001), so
-- it gets the letterhead, the nine templates, print and PDF that invoices
-- already have, and it can be raised by hand from Invoicing & Trade Docs too.
-- It never touches the books: it is a promise to buy, not money owed yet (the
-- ledger trigger only ever posts invoices), and it never asks for payment.
--
-- From Buying & Procurement, issue_purchase_order() turns one or more approved
-- requests for the same supplier into one order: one line per request, the
-- supplier's details from the vendor record, and each request moves to
-- "ordered" pointing at the order. Procurement managers can read and print
-- purchase orders without holding the invoicing suite.
-- ============================================================================

-- ---- the document type -------------------------------------------------------
-- Every existing type is restated; test/migrations_rerunnable.mjs fails the
-- build on any migration that would narrow a live CHECK list.
alter table public.trade_doc_counters drop constraint if exists trade_doc_counters_doc_type_check;
alter table public.trade_doc_counters add constraint trade_doc_counters_doc_type_check
  check (doc_type in ('invoice','receipt','grn','srp','handover','return_note','quote','purchase_order'));

alter table public.trade_documents drop constraint if exists trade_documents_doc_type_check;
alter table public.trade_documents add constraint trade_documents_doc_type_check
  check (doc_type in ('invoice','receipt','grn','srp','handover','return_note','quote','purchase_order'));

-- Let create_trade_document raise one by hand: same patch-the-live-source
-- approach as trade_docs_quotes.sql, guarded so a re-run does not add the
-- branch twice.
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_trade_document';
  if src is null then raise exception 'create_trade_document missing'; end if;
  if position('purchase_order' in src) = 0 then
    src := replace(src,
      $q$('invoice','receipt','grn','srp','handover','return_note','quote')$q$,
      $q$('invoice','receipt','grn','srp','handover','return_note','quote','purchase_order')$q$);
    src := replace(src, $q$when 'quote' then 'QUO'$q$, $q$when 'quote' then 'QUO' when 'purchase_order' then 'PO'$q$);
    if position('purchase_order' in src) = 0 then
      raise exception 'create_trade_document has changed shape; update procurement_orders.sql to match';
    end if;
    execute src;
  end if;
end $$;

-- ---- who can see them ------------------------------------------------------------
-- The invoicing suite as before, plus procurement managers for purchase orders
-- only (and the letterhead those orders print on).
drop policy if exists "trade_documents_select" on public.trade_documents;
create policy "trade_documents_select" on public.trade_documents for select using (
  public.same_org(org_id) and (
    public.has_trade_docs_suite()
    or (doc_type = 'purchase_order' and public.is_procurement_manager())
  )
);
drop policy if exists "trade_doc_settings_select" on public.trade_doc_settings;
create policy "trade_doc_settings_select" on public.trade_doc_settings for select using (
  public.same_org(org_id) and (public.has_trade_docs_suite() or public.is_procurement_manager())
);

-- ---- requests remember their order -------------------------------------------
alter table public.purchase_requests
  add column if not exists po_doc_id uuid references public.trade_documents(id) on delete set null;
create index if not exists purchase_requests_po_idx on public.purchase_requests (po_doc_id);

-- ---- issue an order from approved requests -------------------------------------
create or replace function public.issue_purchase_order(
  p_request_ids uuid[],
  p_vendor_id uuid default null,
  p_delivery_date date default null,
  p_notes text default ''
) returns public.trade_documents language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org_id();
  v_vendor uuid;
  v_ven public.vendors;
  v_rates numeric[];
  v_count int;
  v_items jsonb;
  v_sub numeric;
  v_vat numeric;
  v_seq int;
  v_doc_no text;
  v_refs text;
  row public.trade_documents;
begin
  if not public.is_procurement_manager() then
    raise exception 'Only a procurement manager can issue a purchase order.';
  end if;
  if p_request_ids is null or cardinality(p_request_ids) = 0 then
    raise exception 'Choose at least one approved request to order.';
  end if;

  -- Lock the requests so two people cannot order the same thing twice.
  perform 1 from public.purchase_requests
   where id = any(p_request_ids) and org_id = v_org
   for update;

  select count(*), array_agg(distinct vat_rate)
    into v_count, v_rates
    from public.purchase_requests
   where id = any(p_request_ids) and org_id = v_org;
  if v_count <> cardinality(p_request_ids) then
    raise exception 'One of those requests could not be found. It may have been deleted.';
  end if;
  if exists (select 1 from public.purchase_requests
              where id = any(p_request_ids) and org_id = v_org and status <> 'approved') then
    raise exception 'Only approved requests can be ordered, and each one only once.';
  end if;
  if cardinality(v_rates) > 1 then
    raise exception 'These requests use different VAT rates, so they need separate orders.';
  end if;

  -- The supplier: the one chosen now, else the one on the requests (they
  -- must agree; one order goes to one supplier).
  v_vendor := p_vendor_id;
  if v_vendor is null then
    select min(vendor_id::text)::uuid into v_vendor from public.purchase_requests
     where id = any(p_request_ids) and org_id = v_org;
    if (select count(distinct vendor_id) from public.purchase_requests
         where id = any(p_request_ids) and org_id = v_org and vendor_id is not null) > 1 then
      raise exception 'These requests name different suppliers. One order goes to one supplier.';
    end if;
  end if;
  if v_vendor is null then raise exception 'Choose the supplier this order goes to.'; end if;
  select * into v_ven from public.vendors where id = v_vendor and org_id = v_org;
  if not found then raise exception 'That supplier could not be found.'; end if;

  select jsonb_agg(jsonb_build_object(
           'description', item_description, 'qty', quantity, 'unit_price', unit_cost)
           order by created_at),
         sum(quantity * unit_cost),
         string_agg(left(item_description, 40), '; ' order by created_at)
    into v_items, v_sub, v_refs
    from public.purchase_requests
   where id = any(p_request_ids) and org_id = v_org;
  v_vat := round(v_sub * coalesce(v_rates[1], 0), 2);

  insert into public.trade_doc_counters (org_id, doc_type, next_no) values (v_org, 'purchase_order', 2)
  on conflict (org_id, doc_type) do update set next_no = public.trade_doc_counters.next_no + 1
  returning next_no - 1 into v_seq;
  v_doc_no := 'PO-' || lpad(v_seq::text, 6, '0');

  insert into public.trade_documents (
    org_id, doc_type, doc_no, party_name, party_phone, party_email, party_address,
    vendor_id, items, subtotal, vat_rate, vat_amount, total, status,
    due_date, reference, notes, created_by
  ) values (
    v_org, 'purchase_order', v_doc_no, v_ven.name, v_ven.phone, v_ven.email, v_ven.address,
    v_vendor, v_items, v_sub, coalesce(v_rates[1], 0), v_vat, v_sub + v_vat, 'issued',
    p_delivery_date, left(v_refs, 200), coalesce(trim(p_notes), ''), auth.uid()
  ) returning * into row;

  update public.purchase_requests
     set status = 'ordered', po_doc_id = row.id, vendor_id = v_vendor
   where id = any(p_request_ids) and org_id = v_org;

  return row;
end;
$$;
revoke execute on function public.issue_purchase_order(uuid[], uuid, date, text) from public, anon;
grant execute on function public.issue_purchase_order(uuid[], uuid, date, text) to authenticated;

-- ## revoke_anon_execute.sql

-- ============================================================================
-- Collarone — unauthenticated callers cannot invoke privileged functions
--
-- A SECURITY DEFINER function bypasses RLS by design. 160 of them in this
-- schema were executable by `anon`, the role PostgREST uses for a request
-- carrying no session — which means anyone on the internet holding the
-- publishable key could call them.
--
-- Being fair about the actual risk, because it matters for how this is
-- described: they were probed as the anon role and they return nothing. Every
-- one scopes internally on my_org_id()/auth.uid(), both null without a
-- session, so the queries inside match no rows. This was a MISSING LAYER, not
-- an open door, and nothing is known to have leaked.
--
-- It is still worth closing. The whole set is one forgotten `if not
-- is_manager() then raise` away from being an open door, and that check lives
-- in 160 separate function bodies. A grant is one line and cannot be
-- forgotten halfway through a function.
--
-- WHY IT HAPPENED: Postgres grants EXECUTE to PUBLIC on every new function,
-- and Supabase adds a default-privileges rule granting EXECUTE to anon and
-- authenticated for anything created in this schema. So `revoke ... from
-- public`, which looks like the careful thing to write, leaves the explicit
-- anon grant untouched. Verified on this database.
--
-- WHAT IS REVOKED, and what is deliberately left alone:
--
--   Revoked — VOLATILE, non-trigger, SECURITY DEFINER functions. These are the
--   ones that DO something: generate_payroll_run, ledger_post_entry,
--   decide_leave_request, record_stock_movement. 60 of them.
--
--   Left alone — STABLE/IMMUTABLE predicates (is_hr_manager, same_org,
--   has_payroll_suite and friends). They are referenced inside RLS policy
--   expressions, which are evaluated as the CALLING role, so revoking EXECUTE
--   would make every policy that mentions one throw for anon — taking down the
--   public storefront and the public invoice page. They also return false for
--   anon and disclose nothing, so there is no reason to touch them.
--
--   Left alone — trigger functions. EXECUTE is not consulted when a trigger
--   fires, so a grant on one is irrelevant either way.
--
--   Left alone — the public API, listed explicitly below. These exist to be
--   called without a session and are the storefront, careers and offer pages.
--
-- Written as a loop rather than 60 statements so that re-running it catches
-- any function added since. test/anon_execute.mjs fails the build if a new
-- privileged function ever becomes anon-callable.
--
-- Idempotent; safe to re-run.
-- ============================================================================

do $$
declare
  fn record;
  -- Functions an unauthenticated visitor is SUPPOSED to reach. Adding a name
  -- here is a deliberate decision that the function is safe with no session:
  -- it must validate its own token or input and must never trust an argument
  -- to identify the caller's organisation.
  public_api text[] := array[
    'public_decide_offer',            -- accept/decline a job offer from an emailed token
    'public_place_order',             -- storefront checkout
    'public_submit_application',      -- careers page application
    'public_submit_contact_message',  -- storefront contact form
    'public_submit_lead',             -- storefront lead capture
    -- Added after this migration was first written, which is exactly how a
    -- re-run breaks a live page: the sweep revokes everything not named here,
    -- and these are reached by visitors with no session at all.
    'public_request_demo',            -- /book-demo, an unauthenticated visitor
    'public_status_daily'             -- /status, the public status page
  ];
  -- Functions no browser ever calls: cron sweeps, platform administration and
  -- internal helpers invoked from inside other functions. They run under the
  -- service key from client/api/*, or as nested calls where the definer's own
  -- rights apply and no grant is consulted at all.
  --
  -- They need their own list because of a mistake worth recording. The loop
  -- below grants `authenticated` back after revoking from PUBLIC — necessary,
  -- or signed-in users lose every function at once. Applied blanket, that
  -- HANDED authenticated a set of functions it never had, platform_delete_org
  -- among them: closing an anon hole while opening a wider one for anyone with
  -- a login. test/definer_org_scope.mjs caught it before it shipped.
  server_only text[] := array[
    'advance_billing_lifecycle',   -- billing sweep, from /api/health
    'apply_confirmed_renewal',     -- Paystack callback, from /api/platform-pay
    'attendance_apply_punch',      -- wall device, from /api/punch
    'generate_recurring_invoices', -- nightly sweep, from /api/health
    'platform_delete_org',         -- platform administration, from /api/admin
    'queue_notification',          -- called from inside other functions
    'queue_expiry_reminders',      -- daily reminders, from /api/health
    'queue_more_reminders',        -- daily reminders, from /api/health
    'ledger_post_auto',            -- automatic posting, called from triggers only
    'ledger_unpost_auto',          -- automatic reversal, called from triggers only
    'seed_ledger_accounts',        -- called from inside other functions
    'seed_ledger_accounts_extra',  -- called from inside other functions
    'seed_org_leave_defaults',     -- called from inside other functions
    'visitors_autoclose_all',      -- watchdog sweep, from /api/watchdog
    'watchdog_autoclose_all'       -- watchdog sweep, from /api/watchdog
  ];
  revoked int := 0;
  locked  int := 0;
begin
  for fn in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef                                   -- bypasses RLS
      and p.provolatile = 'v'                           -- does something
      and p.prorettype <> 'trigger'::regtype::oid       -- not a trigger
      and not (p.proname = any(public_api))
  loop
    -- Both grants have to go. PUBLIC is Postgres's default; anon is Supabase's.
    -- Removing only one leaves the function reachable through the other.
    execute format('revoke all on function public.%I(%s) from public', fn.proname, fn.args);
    execute format('revoke all on function public.%I(%s) from anon', fn.proname, fn.args);
    -- Put back what the application actually needs, because revoking from
    -- PUBLIC would otherwise take these away from signed-in users too — but
    -- only for functions a browser calls. A cron sweep or a platform-admin
    -- action reaches the database through the service key and has no business
    -- being callable by every logged-in user.
    if fn.proname = any(server_only) then
      execute format('revoke all on function public.%I(%s) from authenticated', fn.proname, fn.args);
      locked := locked + 1;
    else
      execute format('grant execute on function public.%I(%s) to authenticated', fn.proname, fn.args);
    end if;
    execute format('grant execute on function public.%I(%s) to service_role', fn.proname, fn.args);
    revoked := revoked + 1;
  end loop;
  raise notice 'anon EXECUTE revoked on % function(s); % of them are service-role only', revoked, locked;
end $$;

-- Stop the next one being born open. Supabase's default-privileges rule is
-- what granted anon in the first place; this removes it for functions created
-- in this schema from now on. Existing grants are unaffected, which is why the
-- loop above still has to run.
alter default privileges in schema public revoke execute on functions from anon;
