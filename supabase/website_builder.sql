-- ============================================================================
-- Collarone — Website Builder (Stage 3, part 2)
-- Run after documents.sql. Idempotent.
--
-- Supersedes the old organizations.website_type enum-only model per the
-- 2026-07-10 spec note: a real theme library (10 starter themes across 3
-- categories) + a genuine page/block content model an org admin can edit
-- directly, not a template picked once at signup and never touched again.
--
-- Model: site_themes is a GLOBAL catalog (like the SUITES catalog) — each
-- theme names a `layout_key` (one of 3 real layout skeletons: ecommerce-grid,
-- landing-hero, company-profile) plus its own accent colour / font pairing /
-- light-or-dark tone, so 10 themes = 3 meaningfully different structural
-- layouts × distinct visual tokens, not 10 unrelated one-off templates.
-- org_sites is one row per org (site settings). site_pages/site_blocks are
-- the actual editable content — blocks carry a `content` jsonb whose shape
-- depends on `type` (hero/text/image/features/team/testimonials/faq/
-- contact_form/products/cta/footer). site_products is the ecommerce
-- category's catalog, rendered by a 'products' block.
--
-- Public rendering deliberately goes through ONE SECURITY DEFINER RPC
-- (public_get_site) rather than opening RLS to `anon` on four tables —
-- simpler to reason about and audit than four separate anon policies.
-- ============================================================================

create table if not exists public.site_themes (
  key         text primary key,
  name        text not null,
  category    text not null check (category in ('ecommerce','landing','company')),
  layout_key  text not null check (layout_key in ('ecommerce-grid','landing-hero','company-profile')),
  description text not null default '',
  accent      text not null default '#FF5B1F',
  font_pair   text not null default 'sans-clean' check (font_pair in ('sans-clean','sans-bold','serif-display')),
  tone        text not null default 'light' check (tone in ('light','dark')),
  sort_order  int not null default 0
);

alter table public.site_themes enable row level security;
drop policy if exists "site_themes_select" on public.site_themes;
create policy "site_themes_select" on public.site_themes for select to anon, authenticated using (true);

insert into public.site_themes (key, name, category, layout_key, description, accent, font_pair, tone, sort_order) values
  ('storefront-classic', 'Storefront Classic',    'ecommerce', 'ecommerce-grid',  'Clean white storefront with a bold product grid.',        '#1D4ED8', 'sans-clean',   'light', 1),
  ('boutique-noir',      'Boutique Noir',         'ecommerce', 'ecommerce-grid',  'Dark, elegant boutique feel with serif headings.',        '#C9A227', 'serif-display','dark',  2),
  ('market-fresh',       'Market Fresh',          'ecommerce', 'ecommerce-grid',  'Vibrant, high-energy grid for a fast-moving catalog.',    '#16A34A', 'sans-bold',    'light', 3),
  ('launch-bold',        'Launch Bold',           'landing',   'landing-hero',    'Big bold hero for a product/app launch.',                 '#FF5B1F', 'sans-bold',    'light', 4),
  ('minimal-pitch',      'Minimal Pitch',         'landing',   'landing-hero',    'Whitespace-first, one accent colour, big type.',          '#0F766E', 'sans-clean',   'light', 5),
  ('startup-gradient',   'Startup Gradient',      'landing',   'landing-hero',    'Gradient hero background with rounded feature cards.',    '#7C3AED', 'sans-bold',    'dark',  6),
  ('feature-focus',      'Feature Focus',         'landing',   'landing-hero',    'Icon-grid, feature-first layout for a tool or service.',  '#1D4ED8', 'sans-clean',   'light', 7),
  ('corporate-clean',    'Corporate Clean',       'company',   'company-profile', 'Navy-and-white professional company profile.',            '#1E3A8A', 'sans-clean',   'light', 8),
  ('agency-modern',      'Agency Modern',         'company',   'company-profile', 'Bold black/white typographic agency look.',               '#111827', 'sans-bold',    'dark',  9),
  ('professional-services','Professional Services','company',  'company-profile', 'Trust-oriented, muted palette, testimonial-forward.',     '#0F766E', 'serif-display','light', 10)
on conflict (key) do update set name = excluded.name, category = excluded.category, layout_key = excluded.layout_key,
  description = excluded.description, accent = excluded.accent, font_pair = excluded.font_pair, tone = excluded.tone, sort_order = excluded.sort_order;

create table if not exists public.org_sites (
  org_id          uuid primary key references public.organizations(id) on delete cascade,
  theme_key       text not null references public.site_themes(key),
  site_name       text not null default '',
  tagline         text not null default '',
  logo_url        text not null default '',
  accent_color    text not null default '',   -- '' = use the theme's default accent
  contact_email   text not null default '',
  contact_phone   text not null default '',
  contact_whatsapp text not null default '',
  published       boolean not null default false,
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.org_sites enable row level security;
drop policy if exists "org_sites_select" on public.org_sites;
create policy "org_sites_select" on public.org_sites for select using (
  public.same_org(org_id)
);
drop policy if exists "org_sites_write" on public.org_sites;
create policy "org_sites_write" on public.org_sites for all using (
  public.same_org(org_id) and public.is_super_admin()
) with check (
  public.same_org(org_id) and public.is_super_admin()
);

create table if not exists public.site_pages (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  slug       text not null,
  title      text not null,
  is_home    boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);

alter table public.site_pages enable row level security;
drop policy if exists "site_pages_select" on public.site_pages;
create policy "site_pages_select" on public.site_pages for select using (public.same_org(org_id));
drop policy if exists "site_pages_write" on public.site_pages;
create policy "site_pages_write" on public.site_pages for all using (
  public.same_org(org_id) and public.is_super_admin()
) with check (
  public.same_org(org_id) and public.is_super_admin()
);

create table if not exists public.site_blocks (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  page_id    uuid not null references public.site_pages(id) on delete cascade,
  type       text not null check (type in ('hero','text','image','features','team','testimonials','faq','contact_form','products','cta','footer')),
  sort_order int not null default 0,
  content    jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.site_blocks enable row level security;
drop policy if exists "site_blocks_select" on public.site_blocks;
create policy "site_blocks_select" on public.site_blocks for select using (public.same_org(org_id));
drop policy if exists "site_blocks_write" on public.site_blocks;
create policy "site_blocks_write" on public.site_blocks for all using (
  public.same_org(org_id) and public.is_super_admin()
) with check (
  public.same_org(org_id) and public.is_super_admin()
);

create table if not exists public.site_products (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  description text not null default '',
  price       numeric,
  image_url   text not null default '',
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.site_products enable row level security;
drop policy if exists "site_products_select" on public.site_products;
create policy "site_products_select" on public.site_products for select using (public.same_org(org_id));
drop policy if exists "site_products_write" on public.site_products;
create policy "site_products_write" on public.site_products for all using (
  public.same_org(org_id) and public.is_super_admin()
) with check (
  public.same_org(org_id) and public.is_super_admin()
);

-- ============================================================================
-- Setup wizard RPC: creates org_sites + a category-appropriate default page/
-- block skeleton in one transaction. This is the "how they fill it" answer —
-- an ecommerce org starts with Home/Shop/Contact pre-wired for a product
-- grid, a landing-page org starts with one page's worth of pitch sections,
-- a company-profile org starts with About/Services/Contact. Every block's
-- content is an editable placeholder, not empty — admin edits from there.
-- ============================================================================
create or replace function public.setup_org_site(p_theme_key text, p_site_name text, p_tagline text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_category text;
  v_home_id uuid;
  v_page_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  v_org_id := public.my_org_id();

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
      (v_org_id, v_home_id, 'hero', 1, jsonb_build_object('heading', coalesce(p_site_name,'Your store'), 'subheading', coalesce(p_tagline,'Quality products, delivered.'), 'button_text', 'Shop now', 'button_link', '/shop')),
      (v_org_id, v_home_id, 'products', 2, jsonb_build_object('heading', 'Featured products', 'limit', 6)),
      (v_org_id, v_home_id, 'cta', 3, jsonb_build_object('heading', 'Ready to order?', 'button_text', 'Contact us', 'button_link', '#contact'));
    insert into public.site_pages (org_id, slug, title, sort_order) values (v_org_id, 'shop', 'Shop', 2) returning id into v_page_id;
    insert into public.site_blocks (org_id, page_id, type, sort_order, content) values
      (v_org_id, v_page_id, 'products', 1, jsonb_build_object('heading', 'All products', 'limit', 0));
    insert into public.site_pages (org_id, slug, title, sort_order) values (v_org_id, 'contact', 'Contact', 3) returning id into v_page_id;
    insert into public.site_blocks (org_id, page_id, type, sort_order, content) values
      (v_org_id, v_page_id, 'contact_form', 1, '{}'::jsonb);

  elsif v_category = 'landing' then
    insert into public.site_pages (org_id, slug, title, is_home, sort_order) values (v_org_id, 'home', 'Home', true, 1) returning id into v_home_id;
    insert into public.site_blocks (org_id, page_id, type, sort_order, content) values
      (v_org_id, v_home_id, 'hero', 1, jsonb_build_object('heading', coalesce(p_site_name,'Your product'), 'subheading', coalesce(p_tagline,'A short, clear pitch goes here.'), 'button_text', 'Get started', 'button_link', '#contact')),
      (v_org_id, v_home_id, 'features', 2, jsonb_build_object('heading', 'Why it works', 'items', jsonb_build_array(
        jsonb_build_object('title','Fast','body','Describe your first key benefit.'),
        jsonb_build_object('title','Reliable','body','Describe your second key benefit.'),
        jsonb_build_object('title','Affordable','body','Describe your third key benefit.')
      ))),
      (v_org_id, v_home_id, 'cta', 3, jsonb_build_object('heading', 'Ready to try it?', 'button_text', 'Contact us', 'button_link', '#contact')),
      (v_org_id, v_home_id, 'faq', 4, jsonb_build_object('heading', 'Questions', 'items', jsonb_build_array(
        jsonb_build_object('q','How do I get started?','a','Reach out via the contact section below.')
      ))),
      (v_org_id, v_home_id, 'contact_form', 5, '{}'::jsonb);

  else -- company
    insert into public.site_pages (org_id, slug, title, is_home, sort_order) values (v_org_id, 'home', 'Home', true, 1) returning id into v_home_id;
    insert into public.site_blocks (org_id, page_id, type, sort_order, content) values
      (v_org_id, v_home_id, 'hero', 1, jsonb_build_object('heading', coalesce(p_site_name,'Your company'), 'subheading', coalesce(p_tagline,'What your company does, in one line.'))),
      (v_org_id, v_home_id, 'text', 2, jsonb_build_object('heading', 'About us', 'body', 'Tell visitors who you are and what you do.'));
    insert into public.site_pages (org_id, slug, title, sort_order) values (v_org_id, 'services', 'Services', 2) returning id into v_page_id;
    insert into public.site_blocks (org_id, page_id, type, sort_order, content) values
      (v_org_id, v_page_id, 'features', 1, jsonb_build_object('heading', 'What we offer', 'items', jsonb_build_array(
        jsonb_build_object('title','Service one','body','Describe this service.'),
        jsonb_build_object('title','Service two','body','Describe this service.')
      )));
    insert into public.site_pages (org_id, slug, title, sort_order) values (v_org_id, 'team', 'Team', 3) returning id into v_page_id;
    insert into public.site_blocks (org_id, page_id, type, sort_order, content) values
      (v_org_id, v_page_id, 'team', 1, jsonb_build_object('heading', 'Meet the team', 'items', '[]'::jsonb));
    insert into public.site_pages (org_id, slug, title, sort_order) values (v_org_id, 'contact', 'Contact', 4) returning id into v_page_id;
    insert into public.site_blocks (org_id, page_id, type, sort_order, content) values
      (v_org_id, v_page_id, 'contact_form', 1, '{}'::jsonb);
  end if;

  return v_org_id;
end;
$$;
grant execute on function public.setup_org_site(text, text, text) to authenticated;

-- ---- publish toggle ------------------------------------------------------
create or replace function public.set_site_published(p_published boolean)
returns public.org_sites language plpgsql security definer set search_path = public as $$
declare row public.org_sites;
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  update public.org_sites set published = p_published, updated_at = now()
  where org_id = public.my_org_id() returning * into row;
  if row.org_id is null then raise exception 'Set up your site first'; end if;
  return row;
end;
$$;
grant execute on function public.set_site_published(boolean) to authenticated;

-- ---- full teardown: "bring down" / delete the site entirely -----------------
-- site_pages/site_products reference organizations(id), not org_sites(org_id),
-- so deleting the org_sites row alone would leave orphaned pages/blocks/
-- products behind — this tears down everything for the caller's own org.
create or replace function public.delete_org_site()
returns boolean language plpgsql security definer set search_path = public as $$
declare v_org_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  v_org_id := public.my_org_id();
  delete from public.site_products where org_id = v_org_id;
  delete from public.site_pages where org_id = v_org_id; -- cascades to site_blocks
  delete from public.org_sites where org_id = v_org_id;
  return true;
end;
$$;
grant execute on function public.delete_org_site() to authenticated;

-- ============================================================================
-- Public rendering RPC — the ONLY anon-facing surface for site content.
-- Returns null if the org/slug has no published site (caller shows a 404).
-- ============================================================================
create or replace function public.public_get_site(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_org record;
  v_site record;
  v_theme record;
  v_pages jsonb;
  v_products jsonb;
  result jsonb;
begin
  select id, name, slug into v_org from public.organizations where slug = p_slug;
  if v_org.id is null then return null; end if;

  select * into v_site from public.org_sites where org_id = v_org.id and published = true;
  if v_site.org_id is null then return null; end if;

  select * into v_theme from public.site_themes where key = v_site.theme_key;

  select coalesce(jsonb_agg(p order by p.sort_order), '[]'::jsonb) into v_pages
  from (
    select pg.slug, pg.title, pg.is_home,
      (select coalesce(jsonb_agg(jsonb_build_object('type', b.type, 'content', b.content) order by b.sort_order), '[]'::jsonb)
       from public.site_blocks b where b.page_id = pg.id) as blocks
    from public.site_pages pg where pg.org_id = v_org.id order by pg.sort_order
  ) p;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'description', description, 'price', price, 'imageUrl', image_url) order by sort_order), '[]'::jsonb)
  into v_products from public.site_products where org_id = v_org.id and active = true;

  result := jsonb_build_object(
    'orgName', v_org.name,
    'slug', v_org.slug,
    'siteName', v_site.site_name,
    'tagline', v_site.tagline,
    'logoUrl', v_site.logo_url,
    'accentColor', nullif(v_site.accent_color, ''),
    'contactEmail', v_site.contact_email,
    'contactPhone', v_site.contact_phone,
    'contactWhatsapp', v_site.contact_whatsapp,
    'theme', jsonb_build_object('key', v_theme.key, 'name', v_theme.name, 'category', v_theme.category, 'layoutKey', v_theme.layout_key, 'accent', v_theme.accent, 'fontPair', v_theme.font_pair, 'tone', v_theme.tone),
    'pages', v_pages,
    'products', v_products
  );
  return result;
end;
$$;
grant execute on function public.public_get_site(text) to anon, authenticated;

-- ---- site-assets storage bucket (public — these are live public site images) --
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

drop policy if exists "site_assets_select" on storage.objects;
create policy "site_assets_select" on storage.objects for select using (bucket_id = 'site-assets');

drop policy if exists "site_assets_write" on storage.objects;
create policy "site_assets_write" on storage.objects
  for all to authenticated
  using  (bucket_id = 'site-assets')
  with check (bucket_id = 'site-assets');
