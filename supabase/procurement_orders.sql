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
