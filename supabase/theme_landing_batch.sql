-- Landing catalog rows now backed by folder themes (2026-07-20).
update public.site_themes set accent='#F0430A', description='High-energy product launch — oversized bold type, a color-block hero and punchy CTAs.' where key='launch-bold';
update public.site_themes set accent='#6D5CF5', description='Modern SaaS — a soft gradient hero, glassy cards and rounded gradient buttons.' where key='startup-gradient';
update public.site_themes set accent='#111014', description='Restraint as the design — one narrow column, huge whitespace, a refined serif and hairline rules.' where key='minimal-pitch';
update public.site_themes set accent='#1F6FEB', description='Benefit-led — a split hero and each feature as its own alternating row. Clean and persuasive.' where key='feature-focus';
