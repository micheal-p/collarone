-- ============================================================================
-- Collarone — real commerce for built stores: cart orders without a payment
-- gateway. The Nigerian reality this is built for: most small merchants
-- don't have (and can't easily open) a Paystack account, so checkout takes
-- the order and payment happens the way it already works here — bank
-- transfer to the merchant's own account (details shown at checkout, proof
-- sent on WhatsApp) or cash on delivery. Orders land in the builder's
-- Orders tab and the customer lands in CRM. Idempotent.
-- ============================================================================

-- how the merchant gets paid — shown to shoppers at checkout
alter table public.org_sites add column if not exists bank_name text not null default '';
alter table public.org_sites add column if not exists bank_account_name text not null default '';
alter table public.org_sites add column if not exists bank_account_number text not null default '';
alter table public.org_sites add column if not exists enable_transfer boolean not null default true;
alter table public.org_sites add column if not exists enable_cod boolean not null default true;
alter table public.org_sites add column if not exists payment_note text not null default '';

create table if not exists public.site_orders (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  order_no       text not null unique,
  customer_name  text not null,
  phone          text not null,
  email          text not null default '',
  address        text not null default '',
  note           text not null default '',
  items          jsonb not null,               -- [{id, name, price, qty}] — prices resolved server-side
  total_naira    numeric not null check (total_naira >= 0),
  payment_method text not null check (payment_method in ('transfer','cod')),
  status         text not null default 'new' check (status in ('new','confirmed','fulfilled','cancelled')),
  created_at     timestamptz not null default now()
);

create index if not exists site_orders_org_idx on public.site_orders (org_id, created_at desc);

alter table public.site_orders enable row level security;

drop policy if exists site_orders_org_read on public.site_orders;
create policy site_orders_org_read on public.site_orders
  for select using (public.same_org(org_id));

drop policy if exists site_orders_org_update on public.site_orders;
create policy site_orders_org_update on public.site_orders
  for update using (public.same_org(org_id) and public.is_super_admin())
  with check (public.same_org(org_id));
-- inserts only through public_place_order below

-- SUPERSEDED by site_paystack.sql (adds the 'card' method + orderId in the
-- return) — do not re-run this definition after that file has been applied.
-- Anonymous checkout. Prices are re-read from site_products server-side —
-- the client only sends product ids and quantities, so a tampered cart
-- can't change what anything costs.
create or replace function public.public_place_order(
  p_org_slug text, p_name text, p_phone text, p_email text, p_address text,
  p_note text, p_method text, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_site record;
  v_admin_id uuid;
  v_item record;
  v_product record;
  v_lines jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_qty int;
  v_order_no text;
  v_contact_id uuid;
begin
  select id into v_org_id from public.organizations where slug = p_org_slug;
  if v_org_id is null then raise exception 'Unknown store'; end if;
  select * into v_site from public.org_sites where org_id = v_org_id and published = true;
  if v_site.org_id is null then raise exception 'This store is not taking orders right now'; end if;

  if coalesce(trim(p_name), '') = '' then raise exception 'Your name is required'; end if;
  if coalesce(trim(p_phone), '') = '' then raise exception 'A phone number is required so the store can reach you'; end if;
  if p_method not in ('transfer','cod') then raise exception 'Choose how you want to pay'; end if;
  if p_method = 'transfer' and not v_site.enable_transfer then raise exception 'This store does not accept transfers'; end if;
  if p_method = 'cod' and not v_site.enable_cod then raise exception 'This store does not offer pay on delivery'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Your cart is empty'; end if;
  if jsonb_array_length(p_items) > 40 then raise exception 'Too many items in one order'; end if;

  for v_item in select (e->>'id')::uuid as id, (e->>'qty')::int as qty from jsonb_array_elements(p_items) e loop
    v_qty := greatest(1, least(coalesce(v_item.qty, 1), 99));
    select id, name, price into v_product from public.site_products
    where id = v_item.id and org_id = v_org_id and active = true;
    if v_product.id is null then raise exception 'An item in your cart is no longer available'; end if;
    v_lines := v_lines || jsonb_build_object('id', v_product.id, 'name', v_product.name, 'price', coalesce(v_product.price, 0), 'qty', v_qty);
    v_total := v_total + coalesce(v_product.price, 0) * v_qty;
  end loop;

  v_order_no := 'ORD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.site_orders (org_id, order_no, customer_name, phone, email, address, note, items, total_naira, payment_method)
  values (v_org_id, v_order_no, trim(p_name), trim(p_phone), coalesce(trim(p_email), ''), coalesce(trim(p_address), ''), coalesce(trim(p_note), ''), v_lines, v_total, p_method);

  -- the buyer becomes/updates a CRM contact with the order in their history
  select id into v_admin_id from public.profiles where org_id = v_org_id and role = 'super_admin' limit 1;
  if v_admin_id is not null then
    if coalesce(trim(p_email), '') <> '' then
      select id into v_contact_id from public.crm_contacts where org_id = v_org_id and lower(email) = lower(trim(p_email)) limit 1;
    end if;
    if v_contact_id is null and coalesce(trim(p_phone), '') <> '' then
      select id into v_contact_id from public.crm_contacts where org_id = v_org_id and phone = trim(p_phone) limit 1;
    end if;
    if v_contact_id is null then
      insert into public.crm_contacts (org_id, name, email, phone, notes, created_by)
      values (v_org_id, trim(p_name), coalesce(trim(p_email), ''), trim(p_phone), 'Customer — first ordered through the website.', v_admin_id)
      returning id into v_contact_id;
    end if;
    insert into public.crm_activities (org_id, contact_id, type, source, notes, created_by)
    values (v_org_id, v_contact_id, 'web_message', 'order',
      '[Order ' || v_order_no || '] ' || jsonb_array_length(v_lines) || ' item(s), ₦' || to_char(v_total, 'FM999,999,999') ||
      ' — ' || case when p_method = 'transfer' then 'paying by bank transfer' else 'pay on delivery' end || '.',
      v_admin_id);
  end if;

  return jsonb_build_object(
    'orderNo', v_order_no,
    'total', v_total,
    'method', p_method,
    'bank', case when p_method = 'transfer' then jsonb_build_object(
      'bankName', v_site.bank_name, 'accountName', v_site.bank_account_name, 'accountNumber', v_site.bank_account_number, 'note', v_site.payment_note
    ) else null end
  );
end;
$$;
grant execute on function public.public_place_order(text, text, text, text, text, text, text, jsonb) to anon, authenticated;

-- _build_site_payload lives ONLY in website_builder.sql (canonical) — a
-- second create-or-replace here was a landmine: re-running whichever file
-- was older silently reverted the payload. See website_builder.sql.
