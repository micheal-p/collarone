-- ============================================================================
-- Collarone — store operations: delivery fees + inventory sync.
-- Run after site_commerce.sql + site_paystack.sql + inventory.sql. Idempotent.
--
-- CANONICAL NOTE: this file now owns the single source of truth for BOTH
-- public_place_order() and _build_site_payload() — it supersedes the copies
-- in site_commerce.sql and site_paystack.sql (the "identical duplicates"
-- landmine). Future edits happen HERE only.
--
--   Delivery fees: a flat per-order fee the merchant sets, waived above an
--   optional free-delivery threshold. Computed server-side into the order
--   total (so card charges pick it up unchanged via total_naira).
--
--   Inventory sync: a site product can point at a Stock item; when an order
--   is marked FULFILLED through set_site_order_status(), stock moves out of
--   the store's fulfilment warehouse — best-effort, never blocks the order,
--   idempotent via site_orders.stock_synced.
-- ============================================================================

-- ---- columns ---------------------------------------------------------------
alter table public.org_sites add column if not exists delivery_fee_naira numeric not null default 0 check (delivery_fee_naira >= 0);
alter table public.org_sites add column if not exists free_delivery_above numeric check (free_delivery_above > 0);
alter table public.org_sites add column if not exists delivery_note text not null default '';
alter table public.org_sites add column if not exists stock_warehouse_id uuid references public.warehouses(id) on delete set null;

alter table public.site_orders add column if not exists delivery_fee numeric not null default 0;
alter table public.site_orders add column if not exists stock_synced boolean not null default false;

alter table public.site_products add column if not exists inventory_item_id uuid references public.stock_items(id) on delete set null;

-- ---- public_place_order v3 (delivery-fee aware) -----------------------------
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
  v_subtotal numeric := 0;
  v_fee numeric := 0;
  v_total numeric := 0;
  v_qty int;
  v_order_no text;
  v_order_id uuid;
  v_contact_id uuid;
  v_card_enabled boolean;
begin
  select id into v_org_id from public.organizations where slug = p_org_slug;
  if v_org_id is null then raise exception 'Unknown store'; end if;
  select * into v_site from public.org_sites where org_id = v_org_id and published = true;
  if v_site.org_id is null then raise exception 'This store is not taking orders right now'; end if;

  if coalesce(trim(p_name), '') = '' then raise exception 'Your name is required'; end if;
  if coalesce(trim(p_phone), '') = '' then raise exception 'A phone number is required so the store can reach you'; end if;
  if p_method not in ('transfer','cod','card') then raise exception 'Choose how you want to pay'; end if;
  if p_method = 'transfer' and not v_site.enable_transfer then raise exception 'This store does not accept transfers'; end if;
  if p_method = 'cod' and not v_site.enable_cod then raise exception 'This store does not offer pay on delivery'; end if;
  if p_method = 'card' then
    select enabled into v_card_enabled from public.org_payment_gateways where org_id = v_org_id;
    if not coalesce(v_card_enabled, false) then raise exception 'This store does not take card payments'; end if;
    if coalesce(trim(p_email), '') = '' then raise exception 'Your email is required for card payment'; end if;
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Your cart is empty'; end if;
  if jsonb_array_length(p_items) > 40 then raise exception 'Too many items in one order'; end if;

  for v_item in select (e->>'id')::uuid as id, (e->>'qty')::int as qty from jsonb_array_elements(p_items) e loop
    v_qty := greatest(1, least(coalesce(v_item.qty, 1), 99));
    select id, name, price into v_product from public.site_products
    where id = v_item.id and org_id = v_org_id and active = true;
    if v_product.id is null then raise exception 'An item in your cart is no longer available'; end if;
    v_lines := v_lines || jsonb_build_object('id', v_product.id, 'name', v_product.name, 'price', coalesce(v_product.price, 0), 'qty', v_qty);
    v_subtotal := v_subtotal + coalesce(v_product.price, 0) * v_qty;
  end loop;

  -- flat delivery fee, waived above the free-delivery threshold
  if v_site.delivery_fee_naira > 0 and v_subtotal > 0
     and (v_site.free_delivery_above is null or v_subtotal < v_site.free_delivery_above) then
    v_fee := v_site.delivery_fee_naira;
  end if;
  v_total := v_subtotal + v_fee;

  if p_method = 'card' and v_total <= 0 then raise exception 'Card payment needs a total above zero'; end if;

  v_order_no := 'ORD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.site_orders (org_id, order_no, customer_name, phone, email, address, note, items, delivery_fee, total_naira, payment_method)
  values (v_org_id, v_order_no, trim(p_name), trim(p_phone), coalesce(trim(p_email), ''), coalesce(trim(p_address), ''), coalesce(trim(p_note), ''), v_lines, v_fee, v_total, p_method)
  returning id into v_order_id;

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
      ' — ' || case when p_method = 'transfer' then 'paying by bank transfer'
                    when p_method = 'card' then 'paying by card'
                    else 'pay on delivery' end || '.',
      v_admin_id);
  end if;

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNo', v_order_no,
    'subtotal', v_subtotal,
    'deliveryFee', v_fee,
    'total', v_total,
    'method', p_method,
    'bank', case when p_method = 'transfer' then jsonb_build_object(
      'bankName', v_site.bank_name, 'accountName', v_site.bank_account_name, 'accountNumber', v_site.bank_account_number, 'note', v_site.payment_note
    ) else null end
  );
end;
$$;
grant execute on function public.public_place_order(text, text, text, text, text, text, text, jsonb) to anon, authenticated;

-- ---- _build_site_payload (adds 'delivery') ----------------------------------
create or replace function public._build_site_payload(v_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_org record;
  v_site record;
  v_theme record;
  v_pages jsonb;
  v_products jsonb;
begin
  select id, name, slug into v_org from public.organizations where id = v_org_id;
  if v_org.id is null then return null; end if;

  select * into v_site from public.org_sites where org_id = v_org.id;
  if v_site.org_id is null then return null; end if;

  select * into v_theme from public.site_themes where key = v_site.theme_key;

  select coalesce(jsonb_agg(p order by p.sort_order), '[]'::jsonb) into v_pages
  from (
    select pg.slug, pg.title, pg.is_home, pg.sort_order,
      (select coalesce(jsonb_agg(jsonb_build_object('type', b.type, 'content', b.content) order by b.sort_order), '[]'::jsonb)
       from public.site_blocks b where b.page_id = pg.id) as blocks
    from public.site_pages pg where pg.org_id = v_org.id order by pg.sort_order
  ) p;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'description', description, 'price', price, 'imageUrl', image_url) order by sort_order), '[]'::jsonb)
  into v_products from public.site_products where org_id = v_org.id and active = true;

  return jsonb_build_object(
    'orgName', v_org.name,
    'slug', v_org.slug,
    'siteName', v_site.site_name,
    'tagline', v_site.tagline,
    'logoUrl', v_site.logo_url,
    'accentColor', nullif(v_site.accent_color, ''),
    'contactEmail', v_site.contact_email,
    'contactPhone', v_site.contact_phone,
    'contactWhatsapp', v_site.contact_whatsapp,
    'published', v_site.published,
    'payments', jsonb_build_object(
      'enableTransfer', v_site.enable_transfer,
      'enableCod', v_site.enable_cod,
      'enableCard', coalesce((select g.enabled from public.org_payment_gateways g where g.org_id = v_site.org_id), false),
      'bankName', v_site.bank_name,
      'accountName', v_site.bank_account_name,
      'accountNumber', v_site.bank_account_number,
      'note', v_site.payment_note
    ),
    'delivery', jsonb_build_object(
      'feeNaira', v_site.delivery_fee_naira,
      'freeAbove', v_site.free_delivery_above,
      'note', v_site.delivery_note
    ),
    'theme', jsonb_build_object('key', v_theme.key, 'name', v_theme.name, 'category', v_theme.category, 'layoutKey', v_theme.layout_key, 'accent', v_theme.accent, 'fontPair', v_theme.font_pair, 'tone', v_theme.tone, 'accentColor', nullif(v_site.accent_color, '')),
    'pages', v_pages,
    'products', v_products
  );
end;
$$;
-- keep the security_fixes.sql posture: server-side only, no direct client grants
revoke execute on function public._build_site_payload(uuid) from authenticated;
revoke execute on function public._build_site_payload(uuid) from anon;
revoke execute on function public._build_site_payload(uuid) from public;

-- ---- set_site_order_status — status flow + inventory out on fulfilment ------
create or replace function public.set_site_order_status(p_order_id uuid, p_status text)
returns public.site_orders language plpgsql security definer set search_path = public as $$
declare
  v_order public.site_orders;
  v_site record;
  v_line record;
  v_item_id uuid;
  v_moved boolean := false;
begin
  if p_status not in ('new','confirmed','fulfilled','cancelled') then raise exception 'Invalid status'; end if;

  select * into v_order from public.site_orders where id = p_order_id;
  if v_order.id is null or v_order.org_id <> public.my_org_id() then raise exception 'Order not found'; end if;
  -- same gate as the direct-update RLS policy this supersedes in the UI
  if not public.is_super_admin() then raise exception 'Not authorised to update orders'; end if;

  update public.site_orders set status = p_status where id = v_order.id returning * into v_order;

  -- Fulfilment moves linked stock OUT of the store's warehouse — best-effort
  -- (missing links, no warehouse, or no inventory rights never block the
  -- order), and only ever once per order (stock_synced).
  if p_status = 'fulfilled' and not v_order.stock_synced then
    select stock_warehouse_id into v_site from public.org_sites where org_id = v_order.org_id;
    if v_site.stock_warehouse_id is not null then
      begin
        for v_line in select (e->>'id')::uuid as pid, coalesce((e->>'qty')::numeric, 0) as qty
                      from jsonb_array_elements(v_order.items) e loop
          select inventory_item_id into v_item_id from public.site_products where id = v_line.pid;
          if v_item_id is not null and v_line.qty > 0 then
            perform public.record_stock_movement(
              v_item_id, v_site.stock_warehouse_id, 'out', v_line.qty,
              null, v_order.order_no, 'Website order fulfilled'
            );
            v_moved := true;
          end if;
        end loop;
        if v_moved then
          update public.site_orders set stock_synced = true where id = v_order.id returning * into v_order;
        end if;
      exception when others then
        null; -- stock linkage is a convenience, never a blocker
      end;
    end if;
  end if;

  return v_order;
end;
$$;
grant execute on function public.set_site_order_status(uuid, text) to authenticated;
