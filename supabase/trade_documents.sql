-- ============================================================================
-- Collarone — Trade Documents suite (new, Stage 6 catalog item)
-- Run after procurement.sql and inventory.sql (GRN/SRP can optionally move
-- stock through record_stock_movement, so those suites' functions must
-- already exist). Idempotent. Native multi-tenant from day one.
--
-- Generates the four pieces of paperwork a Nigerian SME actually runs on:
--   invoice — bill a customer
--   receipt — acknowledge a payment
--   grn     — Goods Received Note (goods coming IN from a vendor)
--   srp     — Stock Release/Requisition Pass (goods going OUT — dispatch or
--             internal requisition), the counterpart to a GRN
-- Sequential per-org, per-type document numbers (INV-000001 etc.) — real
-- invoicing needs sequential numbers, not random suffixes like site_orders.
-- ============================================================================

create or replace function public.has_trade_docs_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"trade-docs"}]'::jsonb);
$$;
grant execute on function public.has_trade_docs_suite() to authenticated;

create or replace function public.is_trade_docs_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"trade-docs","role":"manager"}]'::jsonb);
$$;
grant execute on function public.is_trade_docs_manager() to authenticated;

create table if not exists public.trade_doc_counters (
  org_id   uuid not null references public.organizations(id),
  doc_type text not null check (doc_type in ('invoice','receipt','grn','srp')),
  next_no  int not null default 1,
  primary key (org_id, doc_type)
);
alter table public.trade_doc_counters enable row level security;
drop policy if exists "trade_doc_counters_select" on public.trade_doc_counters;
create policy "trade_doc_counters_select" on public.trade_doc_counters for select using (
  public.same_org(org_id) and public.has_trade_docs_suite()
);
-- written only from inside create_trade_document() below, never directly.

create table if not exists public.trade_documents (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  doc_type       text not null check (doc_type in ('invoice','receipt','grn','srp')),
  doc_no         text not null,
  party_name     text not null default '',
  party_phone    text not null default '',
  party_email    text not null default '',
  party_address  text not null default '',
  contact_id     uuid references public.crm_contacts(id) on delete set null,
  vendor_id      uuid references public.vendors(id) on delete set null,
  warehouse_id   uuid references public.warehouses(id) on delete set null,
  items          jsonb not null default '[]'::jsonb,   -- [{description, item_id?, qty, unit_price}]
  subtotal       numeric not null default 0,
  vat_rate       numeric not null default 0.075,
  vat_amount     numeric not null default 0,
  total          numeric not null default 0,
  status         text not null default 'issued' check (status in ('draft','issued','paid','void')),
  due_date       date,
  reference      text not null default '',
  notes          text not null default '',
  stock_linked   boolean not null default false,
  created_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  unique (org_id, doc_type, doc_no)
);

create index if not exists trade_documents_org_idx on public.trade_documents (org_id, doc_type, created_at desc);

alter table public.trade_documents enable row level security;
drop policy if exists "trade_documents_select" on public.trade_documents;
create policy "trade_documents_select" on public.trade_documents for select using (
  public.same_org(org_id) and public.has_trade_docs_suite()
);
drop policy if exists "trade_documents_update" on public.trade_documents;
create policy "trade_documents_update" on public.trade_documents for update using (
  public.same_org(org_id) and public.has_trade_docs_suite()
);
drop policy if exists "trade_documents_delete" on public.trade_documents;
create policy "trade_documents_delete" on public.trade_documents for delete using (
  public.same_org(org_id) and public.is_trade_docs_manager()
);
-- inserts only through create_trade_document() below

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
  if p_doc_type not in ('invoice','receipt','grn','srp') then raise exception 'Invalid document type'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one line item'; end if;
  caller_org := public.my_org_id();

  for v_line in select coalesce((e->>'qty')::numeric, 0) as qty, coalesce((e->>'unit_price')::numeric, 0) as unit_price
                from jsonb_array_elements(p_items) e loop
    v_subtotal := v_subtotal + (v_line.qty * v_line.unit_price);
  end loop;
  v_vat := round(v_subtotal * coalesce(p_vat_rate, 0), 2);
  v_total := v_subtotal + v_vat;

  v_prefix := case p_doc_type when 'invoice' then 'INV' when 'receipt' then 'RCT' when 'grn' then 'GRN' else 'SRP' end;

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

  -- Best-effort stock linkage for GRN (in) / SRP (out) — never blocks the
  -- document itself. Needs the caller to also hold inventory-manager rights
  -- (record_stock_movement checks that on its own) and each line item to
  -- carry a real item_id; lines without one are simply skipped.
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
      -- caller lacked inventory rights, or an item didn't resolve — the
      -- document still stands, it just isn't linked to a stock movement.
      null;
    end;
  end if;

  return row;
end;
$$;
grant execute on function public.create_trade_document(text, text, text, text, text, uuid, uuid, uuid, jsonb, numeric, date, text, text, boolean) to authenticated;

-- ---- Phase 2 whitelist --------------------------------------------------------
-- Canonical home for this trigger moves to automation.sql (run after this
-- file) — it appends 'trade-docs' and 'automation' to the full superset list.
