-- ============================================================================
-- Collarone — website builder v2 seeding: every new site starts looking like
-- a real, finished website (real copy, Unsplash imagery, sample products and
-- people clearly marked "sample") instead of a bare skeleton, so the owner
-- edits something that already shows correct placement rather than staring
-- at empty blocks. Uploaded images get compressed to ~50kb by the app, so
-- the starter imagery ships as stable images.unsplash.com CDN URLs instead.
-- Replaces setup_org_site() from website_builder.sql. Idempotent.
-- ============================================================================

create or replace function public.setup_org_site(p_theme_key text, p_site_name text, p_tagline text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_category text;
  v_home_id uuid;
  v_page_id uuid;
  v_name text;
  -- stable Unsplash CDN photos (long-lived classic IDs)
  img_store    text := 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=80';
  img_office   text := 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=80';
  img_laptop   text := 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=80';
  img_team     text := 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1600&q=80';
  img_sneaker  text := 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80';
  img_bag      text := 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=800&q=80';
  img_phones   text := 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80';
  img_face_f   text := 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80';
  img_face_m   text := 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80';
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  v_org_id := public.my_org_id();
  v_name := coalesce(nullif(trim(p_site_name), ''), 'Your company');

  select category into v_category from public.site_themes where key = p_theme_key;
  if v_category is null then raise exception 'Unknown theme'; end if;

  insert into public.org_sites (org_id, theme_key, site_name, tagline, created_by)
  values (v_org_id, p_theme_key, coalesce(p_site_name, ''), coalesce(p_tagline, ''), auth.uid())
  on conflict (org_id) do update set theme_key = excluded.theme_key, site_name = excluded.site_name, tagline = excluded.tagline, updated_at = now();

  -- Clear any previous skeleton (re-running setup with a new theme/category resets pages)
  delete from public.site_pages where org_id = v_org_id;

  if v_category = 'ecommerce' then
    insert into public.site_pages (org_id, slug, title, is_home, sort_order) values (v_org_id, 'home', 'Home', true, 1) returning id into v_home_id;
    insert into public.site_blocks (org_id, page_id, type, sort_order, content) values
      (v_org_id, v_home_id, 'hero', 1, jsonb_build_object(
        'heading', v_name,
        'subheading', coalesce(nullif(trim(p_tagline), ''), 'Quality products, fair prices, delivered anywhere in Nigeria. Order in minutes.'),
        'button_text', 'Shop now', 'button_link', '#shop', 'image_url', img_store)),
      (v_org_id, v_home_id, 'features', 2, jsonb_build_object('heading', 'Why shop with us', 'items', jsonb_build_array(
        jsonb_build_object('title', 'Nationwide delivery', 'body', 'From Lagos to Maiduguri — tell customers how fast you deliver and what it costs.'),
        jsonb_build_object('title', 'Pay on your terms', 'body', 'Transfer, card or cash on delivery — spell out how customers pay you.'),
        jsonb_build_object('title', 'Easy returns', 'body', 'State your return window and how a customer swaps or returns an item.')
      ))),
      (v_org_id, v_home_id, 'products', 3, jsonb_build_object('heading', 'Featured products', 'limit', 6)),
      (v_org_id, v_home_id, 'testimonials', 4, jsonb_build_object('heading', 'What customers say', 'items', jsonb_build_array(
        jsonb_build_object('quote', 'Ordered on Monday, it was at my door in Ibadan by Wednesday. Replace this with a real review from one of your customers.', 'author', 'Chiamaka A., Ibadan'),
        jsonb_build_object('quote', 'Genuine products and they actually answer their WhatsApp. Swap this out for your own customer''s words.', 'author', 'Emeka O., Abuja')
      ))),
      (v_org_id, v_home_id, 'cta', 5, jsonb_build_object('heading', 'Ready to order?', 'button_text', 'Chat with us', 'button_link', '#contact')),
      (v_org_id, v_home_id, 'subscribe', 6, jsonb_build_object('heading', 'Get first pick', 'blurb', 'New arrivals and offers, straight to your inbox — subscribers land in your CRM automatically.', 'button_text', 'Subscribe'));
    insert into public.site_pages (org_id, slug, title, sort_order) values (v_org_id, 'shop', 'Shop', 2) returning id into v_page_id;
    insert into public.site_blocks (org_id, page_id, type, sort_order, content) values
      (v_org_id, v_page_id, 'products', 1, jsonb_build_object('heading', 'All products', 'limit', 0));
    insert into public.site_pages (org_id, slug, title, sort_order) values (v_org_id, 'contact', 'Contact', 3) returning id into v_page_id;
    insert into public.site_blocks (org_id, page_id, type, sort_order, content) values
      (v_org_id, v_page_id, 'contact_form', 1, '{}'::jsonb);

    -- Sample catalog so the shop grid demonstrates itself — clearly marked,
    -- easy to delete from the Products tab. Only seeded when the org has no
    -- products yet (re-running setup never duplicates or touches real ones).
    if not exists (select 1 from public.site_products where org_id = v_org_id) then
      insert into public.site_products (org_id, name, description, price, image_url, sort_order) values
        (v_org_id, 'Classic Sneakers (sample)', 'A sample product — replace me with something you actually sell.', 25000, img_sneaker, 1),
        (v_org_id, 'Leather Handbag (sample)', 'A sample product — edit or delete me from the Products tab.', 45000, img_bag, 2),
        (v_org_id, 'Wireless Headphones (sample)', 'A sample product — your real catalog goes here.', 60000, img_phones, 3);
    end if;

  elsif v_category = 'landing' then
    insert into public.site_pages (org_id, slug, title, is_home, sort_order) values (v_org_id, 'home', 'Home', true, 1) returning id into v_home_id;
    insert into public.site_blocks (org_id, page_id, type, sort_order, content) values
      (v_org_id, v_home_id, 'hero', 1, jsonb_build_object(
        'heading', v_name,
        'subheading', coalesce(nullif(trim(p_tagline), ''), 'One clear sentence about the problem you solve and who you solve it for — this line does the selling.'),
        'button_text', 'Get started', 'button_link', '#contact', 'image_url', img_laptop)),
      (v_org_id, v_home_id, 'features', 2, jsonb_build_object('heading', 'Why it works', 'items', jsonb_build_array(
        jsonb_build_object('title', 'Saves you time', 'body', 'Lead with your strongest benefit — what does a customer get out of this in their first week?'),
        jsonb_build_object('title', 'Built for Nigeria', 'body', 'What makes you the local, obvious choice? Payments in naira? Same-day support? Say it here.'),
        jsonb_build_object('title', 'No stress setup', 'body', 'How fast can someone start? Remove the fear of a complicated onboarding in one sentence.')
      ))),
      (v_org_id, v_home_id, 'testimonials', 3, jsonb_build_object('heading', 'People already love it', 'items', jsonb_build_array(
        jsonb_build_object('quote', 'This changed how we work — honestly wish we found it sooner. Replace this with a real quote from an early user.', 'author', 'Adaeze N., Lagos')
      ))),
      (v_org_id, v_home_id, 'faq', 4, jsonb_build_object('heading', 'Questions, answered', 'items', jsonb_build_array(
        jsonb_build_object('q', 'How much does it cost?', 'a', 'State your price plainly — visitors leave when pricing feels hidden.'),
        jsonb_build_object('q', 'How do I get started?', 'a', 'Describe your first step: a call, a form, a WhatsApp message — whatever it really is.'),
        jsonb_build_object('q', 'What if it doesn''t work for me?', 'a', 'Handle the biggest doubt a buyer has — guarantee, trial period, or refund policy.')
      ))),
      (v_org_id, v_home_id, 'cta', 5, jsonb_build_object('heading', 'Ready when you are.', 'button_text', 'Talk to us', 'button_link', '#contact')),
      (v_org_id, v_home_id, 'subscribe', 6, jsonb_build_object('heading', 'Not ready yet?', 'blurb', 'Leave your email and we will keep you posted — every subscriber lands in your CRM.', 'button_text', 'Keep me posted')),
      (v_org_id, v_home_id, 'contact_form', 7, '{}'::jsonb);

  else -- company
    insert into public.site_pages (org_id, slug, title, is_home, sort_order) values (v_org_id, 'home', 'Home', true, 1) returning id into v_home_id;
    insert into public.site_blocks (org_id, page_id, type, sort_order, content) values
      (v_org_id, v_home_id, 'hero', 1, jsonb_build_object(
        'heading', v_name,
        'subheading', coalesce(nullif(trim(p_tagline), ''), 'What your company does and who you serve — one confident sentence.'),
        'button_text', 'Get in touch', 'button_link', '#contact', 'image_url', img_office)),
      (v_org_id, v_home_id, 'text', 2, jsonb_build_object('heading', 'About us', 'body',
        'Use this space to tell your story: when you were founded, the problem you set out to solve, and what you stand for today.' || E'\n\n' ||
        'A second short paragraph works well for where you operate, notable clients or projects, and why customers choose you over the next company.')),
      (v_org_id, v_home_id, 'image', 3, jsonb_build_object('image_url', img_team, 'alt', 'Our team at work', 'caption', 'Our team at work — replace this with a real photo of your people.')),
      (v_org_id, v_home_id, 'testimonials', 4, jsonb_build_object('heading', 'What clients say', 'items', jsonb_build_array(
        jsonb_build_object('quote', 'Professional, on time, and they kept every promise. Swap this for words from a real client.', 'author', 'Project client, Port Harcourt')
      )));
    insert into public.site_pages (org_id, slug, title, sort_order) values (v_org_id, 'services', 'Services', 2) returning id into v_page_id;
    insert into public.site_blocks (org_id, page_id, type, sort_order, content) values
      (v_org_id, v_page_id, 'features', 1, jsonb_build_object('heading', 'What we offer', 'items', jsonb_build_array(
        jsonb_build_object('title', 'Your first service', 'body', 'Describe the outcome a client gets, not just the activity — what changes for them?'),
        jsonb_build_object('title', 'Your second service', 'body', 'Keep each description to two or three sentences a busy visitor can skim.'),
        jsonb_build_object('title', 'Your third service', 'body', 'End with how to engage you for this — a quote, a call, a site visit.')
      )));
    insert into public.site_pages (org_id, slug, title, sort_order) values (v_org_id, 'team', 'Team', 3) returning id into v_page_id;
    insert into public.site_blocks (org_id, page_id, type, sort_order, content) values
      (v_org_id, v_page_id, 'team', 1, jsonb_build_object('heading', 'Meet the team', 'items', jsonb_build_array(
        jsonb_build_object('name', 'Adaeze Nwosu (sample)', 'role', 'Managing Director', 'photo_url', img_face_f),
        jsonb_build_object('name', 'Tunde Bakare (sample)', 'role', 'Head of Operations', 'photo_url', img_face_m)
      )));
    insert into public.site_pages (org_id, slug, title, sort_order) values (v_org_id, 'contact', 'Contact', 4) returning id into v_page_id;
    insert into public.site_blocks (org_id, page_id, type, sort_order, content) values
      (v_org_id, v_page_id, 'contact_form', 1, '{}'::jsonb);
  end if;

  return v_org_id;
end;
$$;
grant execute on function public.setup_org_site(text, text, text) to authenticated;
