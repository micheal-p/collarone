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
