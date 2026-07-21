-- ============================================================================
-- Collarone — Trade Docs → real Invoicing & Receivables.
-- Run after trade_documents.sql + trade_doc_settings.sql + site_paystack.sql.
-- Idempotent.
--
-- What this adds to the existing invoice generator:
--   * payment recording — partial payments, running balance, part_paid status
--   * a share token per document → public invoice page (/inv/<token>) the
--     merchant can WhatsApp to a customer
--   * card "pay now" on that page through the merchant's OWN Paystack account
--     (org_payment_gateways — Collarone never holds or routes funds)
--
-- CRM's crm_receivables stays as-is: quick standalone "money owed" entries.
-- Invoice-backed receivables live here, on the documents themselves.
-- ============================================================================

-- ---- columns ---------------------------------------------------------------
alter table public.trade_documents add column if not exists share_token uuid not null default gen_random_uuid();
alter table public.trade_documents add column if not exists amount_paid numeric not null default 0;
alter table public.trade_documents add column if not exists payment_instructions text not null default '';
create unique index if not exists trade_documents_share_token_idx on public.trade_documents (share_token);

-- status gains part_paid
alter table public.trade_documents drop constraint if exists trade_documents_status_check;
alter table public.trade_documents add constraint trade_documents_status_check
  check (status in ('draft','issued','part_paid','paid','void'));

-- ---- payments ledger -------------------------------------------------------
create table if not exists public.trade_doc_payments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  doc_id      uuid not null references public.trade_documents(id) on delete cascade,
  amount      numeric not null check (amount > 0),
  method      text not null default 'transfer' check (method in ('transfer','cash','card','other')),
  reference   text not null default '',
  note        text not null default '',
  paid_at     timestamptz not null default now(),
  recorded_by uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists trade_doc_payments_doc_idx on public.trade_doc_payments (doc_id, paid_at desc);
-- card payments verified against Paystack must be idempotent per reference
create unique index if not exists trade_doc_payments_card_ref_idx
  on public.trade_doc_payments (doc_id, reference) where method = 'card' and reference <> '';

alter table public.trade_doc_payments enable row level security;
drop policy if exists "trade_doc_payments_select" on public.trade_doc_payments;
create policy "trade_doc_payments_select" on public.trade_doc_payments for select using (
  public.same_org(org_id) and public.has_trade_docs_suite()
);
-- writes only through record_trade_doc_payment() (staff) or the service role
-- (/api/invoice-pay.js card verification).

-- ---- record a payment ------------------------------------------------------
create or replace function public.record_trade_doc_payment(
  p_doc_id uuid, p_amount numeric, p_method text default 'transfer',
  p_reference text default '', p_note text default '', p_paid_at timestamptz default now()
) returns public.trade_documents language plpgsql security definer set search_path = public as $$
declare
  doc public.trade_documents;
begin
  if not public.has_trade_docs_suite() then raise exception 'Not authorised'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be above zero'; end if;
  if p_method not in ('transfer','cash','card','other') then raise exception 'Invalid payment method'; end if;

  select * into doc from public.trade_documents where id = p_doc_id;
  if doc.id is null or doc.org_id <> public.my_org_id() then raise exception 'Document not found'; end if;
  if doc.doc_type <> 'invoice' then raise exception 'Payments are recorded against invoices'; end if;
  if doc.status = 'void' then raise exception 'This invoice is void'; end if;
  if doc.amount_paid + p_amount > doc.total then
    raise exception 'Payment would exceed the invoice total (₦% outstanding)', doc.total - doc.amount_paid;
  end if;

  insert into public.trade_doc_payments (org_id, doc_id, amount, method, reference, note, paid_at, recorded_by)
  values (doc.org_id, doc.id, p_amount, p_method, coalesce(trim(p_reference),''), coalesce(trim(p_note),''), coalesce(p_paid_at, now()), auth.uid());

  update public.trade_documents set
    amount_paid = amount_paid + p_amount,
    status = case when amount_paid + p_amount >= total then 'paid' else 'part_paid' end
  where id = doc.id
  returning * into doc;

  return doc;
end;
$$;
grant execute on function public.record_trade_doc_payment(uuid, numeric, text, text, text, timestamptz) to authenticated;

-- ---- public invoice fetch (anon, token-gated) ------------------------------
-- Powers the public /inv/<token> page. Returns ONLY what a customer holding
-- the link needs: the invoice body, the org's letterhead branding, transfer
-- instructions, and whether card payment is available. Never the secret key,
-- never other documents, never staff data. A void or draft invoice 404s.
create or replace function public.get_public_invoice(p_token uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  doc public.trade_documents;
  s   public.trade_doc_settings;
  org_name text;
  card_enabled boolean := false;
begin
  select * into doc from public.trade_documents
    where share_token = p_token and doc_type = 'invoice' and status in ('issued','part_paid','paid');
  if doc.id is null then return null; end if;

  select name into org_name from public.organizations where id = doc.org_id;
  select * into s from public.trade_doc_settings where org_id = doc.org_id;
  select enabled into card_enabled from public.org_payment_gateways
    where org_id = doc.org_id and provider = 'paystack';

  return jsonb_build_object(
    'doc_no', doc.doc_no, 'status', doc.status, 'issued_at', doc.created_at,
    'due_date', doc.due_date, 'party_name', doc.party_name,
    'items', doc.items, 'subtotal', doc.subtotal, 'vat_rate', doc.vat_rate,
    'vat_amount', doc.vat_amount, 'total', doc.total, 'amount_paid', doc.amount_paid,
    'notes', doc.notes, 'payment_instructions', doc.payment_instructions,
    'org', jsonb_build_object(
      'name', coalesce(nullif(s.company_name, ''), org_name, ''),
      'address', coalesce(s.address, ''), 'phone', coalesce(s.phone, ''),
      'email', coalesce(s.email, ''), 'logo_url', coalesce(s.logo_url, ''),
      'accent', coalesce(nullif(s.accent_color, ''), '#0A0E1A'),
      'tagline', coalesce(s.tagline, '')
    ),
    'card_enabled', coalesce(card_enabled, false)
  );
end;
$$;
grant execute on function public.get_public_invoice(uuid) to anon, authenticated;
