-- ============================================================================
-- Collarone — custody paperwork: Handover Notes + Goods Return Notes.
-- Run after trade_documents.sql + trade_docs_receivables.sql. Idempotent.
--
-- The idea (operator, 2026-07-22): whenever company property changes hands,
-- paper follows it — a staff member collecting a loaner/tool/asset signs a
-- numbered HANDOVER NOTE (HOV-000001) in their name; bringing it back
-- produces a GOODS RETURN NOTE (RTN-000001). Both ride the existing
-- letterhead/numbering engine, so Inventory takeouts and IT Asset
-- assignments generate the same documents a GRN or invoice does.
-- ============================================================================

alter table public.trade_doc_counters drop constraint if exists trade_doc_counters_doc_type_check;
alter table public.trade_doc_counters add constraint trade_doc_counters_doc_type_check
  check (doc_type in ('invoice','receipt','grn','srp','handover','return_note'));

alter table public.trade_documents drop constraint if exists trade_documents_doc_type_check;
alter table public.trade_documents add constraint trade_documents_doc_type_check
  check (doc_type in ('invoice','receipt','grn','srp','handover','return_note'));

-- create_trade_document: same body as trade_documents.sql, with the two
-- custody types in the allowed list and prefix map. (Stock linkage stays
-- GRN/SRP-only — custody docs never move sale stock; Inventory's own
-- takeout bookkeeping handles the equipment quantities.)
create or replace function public.create_trade_document(
  p_doc_type text, p_party_name text default '', p_party_phone text default '',
  p_party_email text default '', p_party_address text default '',
  p_contact_id uuid default null, p_vendor_id uuid default null, p_warehouse_id uuid default null,
  p_items jsonb default '[]'::jsonb, p_vat_rate numeric default 0.075,
  p_due_date date default null, p_reference text default '', p_notes text default '',
  p_link_stock boolean default false
) returns public.trade_documents language plpgsql security definer set search_path = public as $$
declare
  caller_org uuid;
  v_seq int;
  v_prefix text;
  v_doc_no text;
  v_subtotal numeric := 0;
  v_vat numeric := 0;
  v_total numeric := 0;
  v_line record;
  row public.trade_documents;
begin
  if not public.has_trade_docs_suite() then raise exception 'Not authorised to create trade documents'; end if;
  if p_doc_type not in ('invoice','receipt','grn','srp','handover','return_note') then raise exception 'Invalid document type'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one line item'; end if;
  caller_org := public.my_org_id();

  for v_line in select coalesce((e->>'qty')::numeric, 0) as qty, coalesce((e->>'unit_price')::numeric, 0) as unit_price
                from jsonb_array_elements(p_items) e loop
    v_subtotal := v_subtotal + (v_line.qty * v_line.unit_price);
  end loop;
  v_vat := round(v_subtotal * coalesce(p_vat_rate, 0), 2);
  v_total := v_subtotal + v_vat;

  v_prefix := case p_doc_type
    when 'invoice' then 'INV' when 'receipt' then 'RCT' when 'grn' then 'GRN'
    when 'handover' then 'HOV' when 'return_note' then 'RTN' else 'SRP' end;

  insert into public.trade_doc_counters (org_id, doc_type, next_no) values (caller_org, p_doc_type, 2)
  on conflict (org_id, doc_type) do update set next_no = public.trade_doc_counters.next_no + 1
  returning next_no - 1 into v_seq;
  v_doc_no := v_prefix || '-' || lpad(v_seq::text, 6, '0');

  insert into public.trade_documents (
    org_id, doc_type, doc_no, party_name, party_phone, party_email, party_address,
    contact_id, vendor_id, warehouse_id, items, subtotal, vat_rate, vat_amount, total,
    due_date, reference, notes, created_by
  ) values (
    caller_org, p_doc_type, v_doc_no, coalesce(trim(p_party_name), ''), coalesce(trim(p_party_phone), ''),
    coalesce(trim(p_party_email), ''), coalesce(trim(p_party_address), ''),
    p_contact_id, p_vendor_id, p_warehouse_id, p_items, v_subtotal, coalesce(p_vat_rate, 0), v_vat, v_total,
    p_due_date, coalesce(trim(p_reference), ''), coalesce(trim(p_notes), ''), auth.uid()
  ) returning * into row;

  if p_link_stock and p_doc_type in ('grn','srp') and p_warehouse_id is not null then
    begin
      for v_line in select (e->>'item_id')::uuid as item_id, coalesce((e->>'qty')::numeric, 0) as qty
                    from jsonb_array_elements(p_items) e loop
        if v_line.item_id is not null and v_line.qty > 0 then
          perform public.record_stock_movement(
            v_line.item_id, p_warehouse_id, case when p_doc_type = 'grn' then 'in' else 'out' end,
            v_line.qty, null, v_doc_no, 'Auto-linked from ' || v_doc_no
          );
        end if;
      end loop;
      update public.trade_documents set stock_linked = true where id = row.id;
      row.stock_linked := true;
    exception when others then
      null;
    end;
  end if;

  return row;
end;
$$;
grant execute on function public.create_trade_document(text, text, text, text, text, uuid, uuid, uuid, jsonb, numeric, date, text, text, boolean) to authenticated;

-- ---- return inspection metadata ---------------------------------------------
-- Condition, reported issues, and a compressed photo ride the Goods Return
-- Note itself (meta jsonb: {condition, issues, photo_url}) and print on it.
alter table public.trade_documents add column if not exists meta jsonb not null default '{}'::jsonb;

create or replace function public.set_trade_doc_meta(p_doc_id uuid, p_meta jsonb)
returns public.trade_documents language plpgsql security definer set search_path = public as $$
declare
  doc public.trade_documents;
begin
  if not public.has_trade_docs_suite() then raise exception 'Not authorised'; end if;
  update public.trade_documents set meta = coalesce(p_meta, '{}'::jsonb)
    where id = p_doc_id and org_id = public.my_org_id()
    returning * into doc;
  if doc.id is null then raise exception 'Document not found'; end if;
  return doc;
end;
$$;
grant execute on function public.set_trade_doc_meta(uuid, jsonb) to authenticated;
