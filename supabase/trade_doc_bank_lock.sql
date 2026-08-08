-- Re-lock the bank account that gets printed on every invoice, and refuse an
-- account number that cannot be a real NUBAN.
--
-- Two problems with upsert_trade_doc_settings as it stands.
--
-- 1. WHO CAN CHANGE THE PAYEE. The permission check is
--    `has_trade_docs_suite()` — the suite at ANY role. So a base-role member
--    of the trade-docs suite can rewrite bank_name / account_name /
--    account_number, and every invoice issued afterwards tells customers to
--    pay into that account. That is the single highest-value field in the
--    product and it is guarded like a display preference. Manager only.
--
-- 2. A TYPO SHIPS FOR A MONTH. account_number is free text, so a 9- or
--    11-digit number prints happily on every invoice until a customer
--    complains the transfer bounced. Nigerian NUBANs are exactly 10 digits —
--    cheap to assert, and the assertion belongs in the database so it holds
--    no matter which screen writes it.
--
-- Signature, parameter order and column list are IDENTICAL to the version in
-- trade_doc_payment_details.sql (including the signature_* fields). Only the
-- bank block is newly gated, so a designer with the suite can still fix the
-- letterhead colour or the signature image without a manager present.

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
  cur public.trade_doc_settings;
  v_bank_changed boolean;
begin
  if v_org is null then raise exception 'Not signed in'; end if;
  if not public.is_super_admin() and not public.has_trade_docs_suite() then
    raise exception 'You do not have access to trade documents';
  end if;
  if p_template_key not in ('classic','modern','bold','minimal','corporate','elegant') then
    raise exception 'Unknown template';
  end if;

  select * into cur from public.trade_doc_settings where org_id = v_org;

  -- Only gate an ACTUAL change. The settings screen posts every field on every
  -- save, so comparing against what is stored is what keeps a non-manager able
  -- to edit the rest of the letterhead.
  v_bank_changed :=
       coalesce(cur.bank_name, '')      is distinct from trim(coalesce(p_bank_name, ''))
    or coalesce(cur.account_name, '')   is distinct from trim(coalesce(p_account_name, ''))
    or coalesce(cur.account_number, '') is distinct from trim(coalesce(p_account_number, ''));

  if v_bank_changed then
    if not (public.is_super_admin() or public.is_trade_docs_manager()) then
      raise exception 'Only a trade-documents manager can change the bank account shown on invoices.';
    end if;
    -- Blank is allowed (a business that only takes cards), but a value must be
    -- a plausible NUBAN rather than a half-typed one.
    if trim(coalesce(p_account_number, '')) <> ''
       and trim(p_account_number) !~ '^[0-9]{10}$' then
      raise exception 'A Nigerian account number is exactly 10 digits. Check the number before it goes onto your invoices.';
    end if;
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
