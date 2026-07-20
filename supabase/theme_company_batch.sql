-- Company catalog rows now backed by folder themes (2026-07-20).
update public.site_themes set accent='#1B4B91', description='Structured and trustworthy — a crisp grid, boxed split hero and a contact bar. Classic business.' where key='corporate-clean';
update public.site_themes set accent='#E8FF59', description='A bold dark creative studio — oversized condensed display, numbered index sections and kinetic type.' where key='agency-modern';
update public.site_themes set accent='#7A5C2E', description='A refined advisory firm — warm paper, an elegant serif, hairline rules and calm restraint.' where key='professional-services';
