-- ============================================================================
-- Collarone — code-review fixes for the store/CRM funnel. Idempotent.
--
-- 1. crm_activities.source: orders, product enquiries, contact-form messages
--    and mailing-list signups were all indistinguishable 'web_message' rows,
--    so orders rendered as "Awaiting reply" messages and double-counted in
--    Insights. Now each row says what it is; existing rows are backfilled
--    from their notes prefix.
-- 2. public_submit_lead: gains p_source, and on an email match refreshes a
--    junk name (the email local-part a subscriber gets) with the real name
--    from a later submission, and fills in a missing phone.
-- 3. public_place_order: stamps source='order' on its activity.
-- 4. site_insights(): server-side aggregate for the Insights tab — replaces
--    shipping up to 10,000 raw visit rows to the browser (which also capped
--    the 30-day count at exactly 10,000 for busier stores).
--
-- Canonical-definition hygiene (the "re-run an old file, silently revert"
-- landmine): _build_site_payload now lives ONLY in website_builder.sql, and
-- each table's type CHECK block lives ONLY in that table's owning file.
-- ============================================================================

-- ---- 1. activity source ----------------------------------------------------
alter table public.crm_activities add column if not exists source text not null default 'manual'
  check (source in ('manual','contact_form','product_enquiry','subscribe','order'));

update public.crm_activities set source = case
    when notes like '[Order %' then 'order'
    when notes like '[Product enquiry]%' then 'product_enquiry'
    when notes like '[Mailing list]%' then 'subscribe'
    else 'contact_form'
  end
where type = 'web_message' and source = 'manual';

-- ---- 2. lead RPC v3 ---------------------------------------------------------
-- Adding a defaulted parameter creates an OVERLOAD, not a replacement — the
-- old 5-arg function must be dropped or 5-arg calls keep hitting stale code.
drop function if exists public.public_submit_lead(text, text, text, text, text);

create or replace function public.public_submit_lead(
  p_org_slug text, p_name text, p_email text, p_phone text, p_message text,
  p_source text default 'contact_form'
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_admin_id uuid;
  v_contact_id uuid;
  v_source text := case when p_source in ('contact_form','product_enquiry','subscribe') then p_source else 'contact_form' end;
begin
  select id into v_org_id from public.organizations where slug = p_org_slug;
  if v_org_id is null then raise exception 'Unknown company page'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name is required'; end if;

  select id into v_admin_id from public.profiles where org_id = v_org_id and role = 'super_admin' limit 1;
  if v_admin_id is null then raise exception 'This company cannot receive leads right now'; end if;

  -- same person writing again (matched by email) stays one contact
  if coalesce(trim(p_email), '') <> '' then
    select id into v_contact_id from public.crm_contacts
    where org_id = v_org_id and lower(email) = lower(trim(p_email)) limit 1;
  end if;

  if v_contact_id is null then
    insert into public.crm_contacts (org_id, name, email, phone, notes, created_by)
    values (v_org_id, trim(p_name), coalesce(p_email, ''), coalesce(p_phone, ''),
      case when v_source = 'subscribe' then 'Mailing-list subscriber.' else 'Came in through the website contact form.' end,
      v_admin_id)
    returning id into v_contact_id;
  else
    -- a real name from a later submission beats the email-prefix placeholder
    -- a mailing-list signup fabricates; a phone fills an empty one
    update public.crm_contacts set
      name = case
        when v_source <> 'subscribe' and trim(p_name) <> '' and lower(name) = lower(split_part(email, '@', 1))
          and lower(trim(p_name)) <> lower(name) then trim(p_name)
        else name end,
      phone = case when coalesce(phone, '') = '' and coalesce(trim(p_phone), '') <> '' then trim(p_phone) else phone end
    where id = v_contact_id;
  end if;

  insert into public.crm_activities (org_id, contact_id, type, source, notes, created_by)
  values (v_org_id, v_contact_id, 'web_message', v_source,
    coalesce(nullif(trim(p_message), ''), '(No message provided.)'), v_admin_id);

  return true;
end;
$$;
grant execute on function public.public_submit_lead(text, text, text, text, text, text) to anon, authenticated;

-- ---- 3. orders stamp their source -------------------------------------------
-- (full function redefinition lives in site_commerce.sql; this targeted patch
-- keeps the applied DB in sync with that file's updated insert)
-- applied via site_commerce.sql re-run alongside this file.

-- ---- 4. Insights aggregate ---------------------------------------------------
create or replace function public.site_insights(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.same_org(p_org_id) or public.is_platform_admin()) then
    raise exception 'Not authorised';
  end if;
  return jsonb_build_object(
    'v24', (select count(*) from public.site_visits where org_id = p_org_id and created_at > now() - interval '24 hours'),
    'v7',  (select count(*) from public.site_visits where org_id = p_org_id and created_at > now() - interval '7 days'),
    'v30', (select count(*) from public.site_visits where org_id = p_org_id and created_at > now() - interval '30 days'),
    'topPages', (
      select coalesce(jsonb_agg(jsonb_build_object('label', page, 'value', n) order by n desc), '[]'::jsonb)
      from (select page, count(*) n from public.site_visits
            where org_id = p_org_id and created_at > now() - interval '30 days'
            group by page order by n desc limit 6) tp),
    'topCountries', (
      select coalesce(jsonb_agg(jsonb_build_object('label', country, 'value', n) order by n desc), '[]'::jsonb)
      from (select country, count(*) n from public.site_visits
            where org_id = p_org_id and created_at > now() - interval '30 days'
            group by country order by n desc limit 6) tc)
  );
end;
$$;
grant execute on function public.site_insights(uuid) to authenticated;
