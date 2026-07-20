-- Storefront Classic now backed by a folder theme (2026-07-20).
update public.site_themes set accent='#2563EB', font_pair='sans-clean',
  description='A clean, trustworthy everyday shop — tidy product grid, trust badges and a familiar retail feel.'
  where key='storefront-classic';
