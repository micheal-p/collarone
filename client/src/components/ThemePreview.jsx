// Full theme preview — renders the REAL renderer a customer's site uses (a
// folder theme like Atelier, or a legacy layout) with genuinely Nigerian
// sample content, inside a modal. Used by Platform Admin's theme gallery and
// the builder's theme picker.
import { LAYOUTS } from '../pages/site/siteLayouts.jsx';
import { getSiteTheme } from '../pages/site/themes/index.js';
import { useState } from 'react';

const U = (id, w = 800) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

// A cohesive Nigerian lifestyle/fashion store — naira prices, local product
// language — so an ecommerce preview reads like a real Naija store, not a
// generic stock catalogue.
const NG_PRODUCTS = [
  ['Ankara Tote Bag', 18000, '1591561954557-26941169b49e'],
  ['Adire Headwrap', 6500, '1483985988355-763728e1935b'],
  ['Kano Leather Slippers', 22000, '1560769629-975ec94e6a86'],
  ['Shea Butter & Black Soap Set', 8500, '1556228720-195a672e8a03'],
  ['Aso-Oke Clutch', 35000, '1584917865442-de89df76afd3'],
  ['Beaded Waist Necklace', 12000, '1515562141207-7a88fb7ce338'],
  ['Ankara Throw Cushion', 9500, '1584100936595-c0654b55a2e6'],
  ['Handwoven Raffia Fan', 4500, '1523381210434-271e8be1f52b'],
];

const THEME_HERO = {
  'lumin-store': '1594633312681-425c7b97ccd1',
  'storefront-classic': '1441986300917-64674bd600d8',
  'boutique-noir': '1490481651871-ab68de25d43d',
  'market-fresh': '1542838132-92c53300491e',
  'launch-bold': '1460925895917-afdab827c52f',
  'minimal-pitch': '1497032628192-86f99bcd76bc',
  'startup-gradient': '1519389950473-47ba0277781c',
  'feature-focus': '1551288049-bebda4e38f71',
  'corporate-clean': '1486406146926-c627a92ad1ab',
  'agency-modern': '1497366811353-6870744d04b2',
  'professional-services': '1521791136064-7986c2920216',
};

export function samplePayload(t) {
  const heroImg = U(THEME_HERO[t.key] || '1594633312681-425c7b97ccd1', 1400);
  const base = {
    orgName: 'Àṣọ Lagos', siteName: 'Àṣọ Lagos',
    tagline: t.category === 'ecommerce' ? 'Made in Nigeria · Delivered nationwide' : 'Lagos, Nigeria',
    logoUrl: '', slug: 'preview', published: true, isPreview: true,
    contactEmail: 'hello@asolagos.ng', contactPhone: '0803 555 0142', contactWhatsapp: '+2348035550142',
    theme: { key: t.key, name: t.name, category: t.category, layoutKey: t.layout_key || t.layoutKey, accent: t.accent, fontPair: t.font_pair || t.fontPair, tone: t.tone, accentColor: '' },
    payments: { enableTransfer: true, enableCod: true },
    products: [],
  };

  if (t.category === 'ecommerce') {
    base.products = NG_PRODUCTS.map(([name, price, id], i) => ({ id: i + 1, name, price, imageUrl: U(id) }));
    base.pages = [
      { slug: 'home', title: 'Home', is_home: true, blocks: [
        { type: 'hero', content: { eyebrow: 'New season', heading: 'Everyday pieces, *made* in Nigeria.', subheading: 'Handcrafted bags, adire and leather from makers across Lagos, Kano and Abeokuta, delivered to your door.', button_text: 'Shop the collection', button_link: '#shop', image_url: heroImg } },
        { type: 'products', content: { heading: 'Featured pieces', limit: 8 } },
        { type: 'features', content: { heading: 'Made with intention, built to last.', items: [
          { title: 'Made by Nigerian hands', body: 'Every piece comes from a local maker we work with directly, no middlemen.' },
          { title: 'Pay your way', body: 'Card, bank transfer, or pay on delivery, whatever suits you.' },
          { title: 'Nationwide delivery', body: 'Lagos in 48 hours, anywhere in Nigeria within the week.' },
        ] } },
        { type: 'cta', content: { heading: 'Find the one that lasts.', button_text: 'Start shopping', button_link: '#shop' } },
      ] },
      { slug: 'shop', title: 'Shop', blocks: [{ type: 'products', content: { heading: 'All products', limit: 0 } }] },
      { slug: 'contact', title: 'Contact', blocks: [{ type: 'contact_form', content: {} }] },
    ];
  } else if (t.category === 'landing') {
    base.orgName = 'PayFlow'; base.siteName = 'PayFlow'; base.tagline = 'Get paid faster, in naira.';
    base.pages = [
      { slug: 'home', title: 'Home', is_home: true, blocks: [
        { type: 'hero', content: { eyebrow: 'For Nigerian businesses', heading: 'Get paid *faster*, in naira.', subheading: 'Send an invoice on WhatsApp, get paid by card or transfer, and see the money land the same day. Built for how Nigerian business actually runs.', button_text: 'Start free', button_link: '#contact', image_url: heroImg } },
        { type: 'features', content: { heading: 'Why businesses switch', items: [
          { title: 'Same-day settlement', body: 'Money hits your account the day your customer pays, no T+2 wait.' },
          { title: 'Built for Nigeria', body: 'Naira-first, WhatsApp invoices, and support that picks up in Lagos hours.' },
          { title: 'No stress setup', body: 'Start collecting payments in minutes, no paperwork, no developer.' },
        ] } },
        { type: 'testimonials', content: { heading: 'Loved by Nigerian founders', items: [
          { quote: 'We went from chasing transfers on WhatsApp to getting paid the same afternoon. Game changer for our shop.', author: 'Chidinma O., Lagos' },
        ] } },
        { type: 'cta', content: { heading: 'Ready to get paid faster?', button_text: 'Talk to us', button_link: '#contact' } },
      ] },
    ];
  } else {
    base.orgName = 'Sterling & Root'; base.siteName = 'Sterling & Root'; base.tagline = 'A Lagos consultancy';
    base.pages = [
      { slug: 'home', title: 'Home', is_home: true, blocks: [
        { type: 'hero', content: { eyebrow: 'Advisory · Lagos', heading: 'We help Nigerian businesses *grow* with intent.', subheading: 'Strategy, operations and finance advisory for ambitious companies across West Africa.', button_text: 'Get in touch', button_link: '#contact', image_url: heroImg } },
        { type: 'text', content: { heading: 'About us', body: 'Founded in Lagos in 2019, Sterling & Root partners with founders and boards to turn ambition into a plan that ships. We have advised businesses across retail, agriculture and fintech, from first hire to Series A.' } },
        { type: 'features', content: { heading: 'What we do', items: [
          { title: 'Strategy', body: 'Where to play and how to win, grounded in the Nigerian market.' },
          { title: 'Operations', body: 'Systems and hires that let you scale without breaking.' },
          { title: 'Finance', body: 'Modelling, fundraising and the numbers that win a boardroom.' },
        ] } },
      ] },
      { slug: 'team', title: 'Team', blocks: [{ type: 'team', content: { heading: 'Meet the team', items: [
        { name: 'Adaeze Nwosu', role: 'Managing Partner', photo_url: U('1494790108377-be9c29b29330', 400) },
        { name: 'Tunde Bakare', role: 'Head of Operations', photo_url: U('1507003211169-0a1dd7228f2d', 400) },
      ] } }] },
      { slug: 'contact', title: 'Contact', blocks: [{ type: 'contact_form', content: {} }] },
    ];
  }
  return base;
}

export default function ThemePreviewModal({ theme, onClose }) {
  const data = samplePayload(theme);
  const [activeSlug, setActiveSlug] = useState(data.pages.find((p) => p.is_home)?.slug);

  // Render the real thing: a folder theme (Atelier, ...) if one matches the
  // key, otherwise the legacy layout for that layoutKey.
  const folder = getSiteTheme(data.theme.key);
  const Layout = LAYOUTS[data.theme.layoutKey] || LAYOUTS['company-profile'];
  const Rendered = folder
    ? <folder.Component data={data} activeSlug={activeSlug} setActiveSlug={setActiveSlug} />
    : <Layout data={data} activeSlug={activeSlug} setActiveSlug={setActiveSlug} />;

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(4,6,12,0.78)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'clamp(12px, 3vw, 36px)' }}>
      <div style={{ width: 'min(1080px, 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
        <div style={{ color: '#F4F1EA', fontSize: 14, fontWeight: 650 }}>
          {theme.name}
          <span style={{ color: 'rgba(244,241,234,0.5)', fontWeight: 400, marginLeft: 10, fontSize: 12.5 }}>
            {theme.category === 'ecommerce' ? 'Online store' : theme.category === 'landing' ? 'Landing page' : 'Company profile'} · Nigerian sample content
          </span>
        </div>
        <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(244,241,234,0.1)', border: '1px solid rgba(244,241,234,0.2)', color: '#F4F1EA', borderRadius: 100, padding: '7px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          Close preview
        </button>
      </div>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(1080px, 100%)', flex: 1, minHeight: 0, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(244,241,234,0.15)', boxShadow: '0 40px 100px rgba(0,0,0,0.6)' }}>
        <div style={{ height: '100%', overflowY: 'auto', background: '#fff' }}>
          {Rendered}
        </div>
      </div>
    </div>
  );
}
