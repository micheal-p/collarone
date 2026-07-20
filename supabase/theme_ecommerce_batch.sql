-- Refresh the ecommerce catalog rows now backed by folder themes (2026-07-20).
update public.site_themes set name='Boutique Noir', accent='#C9A24B',
  description='A dark luxury boutique — high-contrast serif, gold hairlines, generous space and slow, restrained motion.'
  where key='boutique-noir';
update public.site_themes set name='Market Fresh', accent='#2E9E5B',
  description='Bright, warm and friendly — rounded cards, a chunky playful display and bouncy motion. Great for food and everyday goods.'
  where key='market-fresh';
