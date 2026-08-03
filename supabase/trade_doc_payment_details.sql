-- ============================================================================
-- Where the customer actually sends the money. Run after trade_doc_settings.sql.
-- Idempotent.
--
-- An invoice that doesn't say where to pay is not an invoice, it's a statement
-- of opinion. Nothing in trade_doc_settings held bank details, so every invoice
-- this platform has ever produced left the customer to guess, or to phone and
-- ask. The pay-by-card link is not a substitute: it needs Paystack switched on,
-- and plenty of Nigerian B2B customers pay by transfer regardless.
--
-- Account NUMBER is not a secret — it is printed on invoices precisely so people
-- can pay it — so this lives with the rest of the letterhead settings and is
-- readable by anyone in the org who can see trade docs. (Contrast
-- org_payment_gateways, which holds Paystack SECRET keys and is service-role
-- only with no policies.)
-- ============================================================================

alter table public.trade_doc_settings
  add column if not exists bank_name      text not null default '',
  add column if not exists account_name   text not null default '',
  add column if not exists account_number text not null default '',
  add column if not exists payment_note   text not null default '';

comment on column public.trade_doc_settings.payment_note is
  'Free text under the bank details, e.g. "Quote the invoice number as your reference" or a second account.';

-- Replaces the 11-argument version. Named arguments with defaults, so the
-- client can keep sending the old set while the new fields default to ''.
create or replace function public.upsert_trade_doc_settings(
  p_company_name text default '', p_address text default '', p_tagline text default '',
  p_phone text default '', p_email text default '', p_logo_url text default '', p_accent_color text default '#0A0E1A',
  p_signature_name text default '', p_signature_title text default '', p_signature_url text default '',
  p_template_key text default 'classic',
  p_bank_name text default '', p_account_name text default '', p_account_number text default '',
  p_payment_note text default ''
) returns public.trade_doc_settings language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org_id();
  row public.trade_doc_settings;
begin
  if v_org is null then raise exception 'Not signed in'; end if;
  if not public.is_super_admin() and not public.has_trade_docs_suite() then
    raise exception 'You do not have access to trade documents';
  end if;
  if p_template_key not in ('classic','modern','bold','minimal','corporate','elegant') then
    raise exception 'Unknown template';
  end if;

  insert into public.trade_doc_settings as t (
    org_id, company_name, address, tagline, phone, email, logo_url, accent_color,
    signature_name, signature_title, signature_url, template_key,
    bank_name, account_name, account_number, payment_note, updated_at
  ) values (
    v_org, p_company_name, p_address, p_tagline, p_phone, p_email, p_logo_url, p_accent_color,
    p_signature_name, p_signature_title, p_signature_url, p_template_key,
    trim(p_bank_name), trim(p_account_name), trim(p_account_number), p_payment_note, now()
  )
  on conflict (org_id) do update set
    company_name = excluded.company_name, address = excluded.address, tagline = excluded.tagline,
    phone = excluded.phone, email = excluded.email, logo_url = excluded.logo_url,
    accent_color = excluded.accent_color, signature_name = excluded.signature_name,
    signature_title = excluded.signature_title, signature_url = excluded.signature_url,
    template_key = excluded.template_key,
    bank_name = excluded.bank_name, account_name = excluded.account_name,
    account_number = excluded.account_number, payment_note = excluded.payment_note,
    updated_at = now()
  returning * into row;

  return row;
end;
$$;

grant execute on function public.upsert_trade_doc_settings(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

-- ---- the customer's own page must show the bank details too ----------------
-- get_public_invoice() returned only the PER-DOCUMENT payment_instructions, a
-- field almost nobody fills in per invoice. So the /inv/<token> page a customer
-- opens from WhatsApp said "How to pay" and then, usually, nothing. The org's
-- standing bank details are now the fallback, which means every invoice link
-- answers the question without anyone retyping it.
create or replace function public.get_public_invoice(p_token uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  doc public.trade_documents;
  s   public.trade_doc_settings;
  org_name text;
  card_enabled boolean := false;
  v_pay text;
begin
  select * into doc from public.trade_documents
    where share_token = p_token and doc_type = 'invoice' and status in ('issued','part_paid','paid');
  if doc.id is null then return null; end if;

  select name into org_name from public.organizations where id = doc.org_id;
  select * into s from public.trade_doc_settings where org_id = doc.org_id;
  select enabled into card_enabled from public.org_payment_gateways
    where org_id = doc.org_id and provider = 'paystack';

  -- per-document instructions win; otherwise build one from the letterhead
  v_pay := nullif(trim(coalesce(doc.payment_instructions, '')), '');
  if v_pay is null and coalesce(s.account_number, '') <> '' then
    v_pay := concat_ws(E'\n',
      concat_ws(' · ',
        nullif(coalesce(s.account_name, ''), ''),
        nullif(coalesce(s.bank_name, ''), ''),
        nullif(coalesce(s.account_number, ''), '')),
      nullif(coalesce(s.payment_note, ''), ''),
      'Quote ' || doc.doc_no || ' as your payment reference.');
  end if;

  return jsonb_build_object(
    'doc_no', doc.doc_no, 'status', doc.status, 'issued_at', doc.created_at,
    'due_date', doc.due_date, 'party_name', doc.party_name,
    'items', doc.items, 'subtotal', doc.subtotal, 'vat_rate', doc.vat_rate,
    'vat_amount', doc.vat_amount, 'total', doc.total, 'amount_paid', doc.amount_paid,
    'notes', doc.notes, 'payment_instructions', coalesce(v_pay, ''),
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

-- Drop the 11-argument version. `create or replace` with a different signature
-- creates an OVERLOAD, not a replacement, so the old one survived and a caller
-- sending the original field set would still resolve to it and silently save no
-- bank details. One function, one signature.
drop function if exists public.upsert_trade_doc_settings(
  text, text, text, text, text, text, text, text, text, text, text
);
