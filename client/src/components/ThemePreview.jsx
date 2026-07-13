// Full theme preview — renders the REAL public-site layout components with
// sample content in that theme's tokens, inside a modal. What you see is
// literally the renderer a customer's site uses, not another mockup.
// Used by Platform Admin's theme gallery and the builder's theme picker.
import { LAYOUTS } from '../pages/site/siteLayouts.jsx';
import { useState } from 'react';

const IMG = {
  store: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=80',
  office: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=80',
  laptop: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=80',
  team: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1600&q=80',
  sneaker: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80',
  bag: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=800&q=80',
  phones: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
  faceF: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
  faceM: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
};

function samplePayload(t) {
  const base = {
    orgName: 'Acme Nigeria', siteName: 'Acme Nigeria', tagline: '', logoUrl: '', slug: 'preview', published: true, isPreview: true,
    contactEmail: 'hello@acme.ng', contactPhone: '0801 234 5678', contactWhatsapp: '+2348012345678',
    theme: { key: t.key, name: t.name, category: t.category, layoutKey: t.layout_key || t.layoutKey, accent: t.accent, fontPair: t.font_pair || t.fontPair, tone: t.tone, accentColor: '' },
    products: [],
  };
  if (t.category === 'ecommerce') {
    base.products = [
      { id: 1, name: 'Classic Sneakers', price: 25000, imageUrl: IMG.sneaker },
      { id: 2, name: 'Leather Handbag', price: 45000, imageUrl: IMG.bag },
      { id: 3, name: 'Wireless Headphones', price: 60000, imageUrl: IMG.phones },
    ];
    base.pages = [
      { slug: 'home', title: 'Home', is_home: true, blocks: [
        { type: 'hero', content: { heading: 'Acme Nigeria', subheading: 'Quality products, fair prices, delivered anywhere in Nigeria.', button_text: 'Shop now', button_link: '#shop', image_url: IMG.store } },
        { type: 'products', content: { heading: 'Featured products', limit: 3 } },
        { type: 'cta', content: { heading: 'Ready to order?', button_text: 'Chat with us', button_link: '#contact' } },
      ] },
      { slug: 'shop', title: 'Shop', blocks: [{ type: 'products', content: { heading: 'All products', limit: 0 } }] },
      { slug: 'contact', title: 'Contact', blocks: [{ type: 'contact_form', content: {} }] },
    ];
  } else if (t.category === 'landing') {
    base.pages = [
      { slug: 'home', title: 'Home', is_home: true, blocks: [
        { type: 'hero', content: { heading: 'Acme Nigeria', subheading: 'One clear sentence about the problem you solve — this line does the selling.', button_text: 'Get started', button_link: '#contact', image_url: IMG.laptop } },
        { type: 'features', content: { heading: 'Why it works', items: [
          { title: 'Saves you time', body: 'Lead with your strongest benefit.' },
          { title: 'Built for Nigeria', body: 'Naira payments, same-day support.' },
          { title: 'No stress setup', body: 'Start in minutes, not weeks.' },
        ] } },
        { type: 'testimonials', content: { heading: 'People already love it', items: [{ quote: 'This changed how we work — wish we found it sooner.', author: 'Adaeze N., Lagos' }] } },
        { type: 'cta', content: { heading: 'Ready when you are.', button_text: 'Talk to us', button_link: '#contact' } },
      ] },
    ];
  } else {
    base.pages = [
      { slug: 'home', title: 'Home', is_home: true, blocks: [
        { type: 'hero', content: { heading: 'Acme Nigeria', subheading: 'What your company does and who you serve — one confident sentence.', button_text: 'Get in touch', button_link: '#contact', image_url: IMG.office } },
        { type: 'text', content: { heading: 'About us', body: 'Use this space to tell your story: when you were founded, the problem you set out to solve, and what you stand for today.' } },
        { type: 'image', content: { image_url: IMG.team, alt: 'Our team', caption: 'Our team at work.' } },
      ] },
      { slug: 'services', title: 'Services', blocks: [{ type: 'features', content: { heading: 'What we offer', items: [
        { title: 'Consulting', body: 'Describe the outcome a client gets.' },
        { title: 'Delivery', body: 'Keep each description skimmable.' },
        { title: 'Support', body: 'End with how to engage you.' },
      ] } }] },
      { slug: 'team', title: 'Team', blocks: [{ type: 'team', content: { heading: 'Meet the team', items: [
        { name: 'Adaeze Nwosu', role: 'Managing Director', photo_url: IMG.faceF },
        { name: 'Tunde Bakare', role: 'Head of Operations', photo_url: IMG.faceM },
      ] } }] },
      { slug: 'contact', title: 'Contact', blocks: [{ type: 'contact_form', content: {} }] },
    ];
  }
  return base;
}

export default function ThemePreviewModal({ theme, onClose }) {
  const data = samplePayload(theme);
  const Layout = LAYOUTS[data.theme.layoutKey] || LAYOUTS['company-profile'];
  const [activeSlug, setActiveSlug] = useState(data.pages.find((p) => p.is_home)?.slug);

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(4,6,12,0.78)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'clamp(12px, 3vw, 36px)' }}>
      <div style={{ width: 'min(1080px, 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
        <div style={{ color: '#F4F1EA', fontSize: 14, fontWeight: 650 }}>
          {theme.name}
          <span style={{ color: 'rgba(244,241,234,0.5)', fontWeight: 400, marginLeft: 10, fontSize: 12.5 }}>
            {theme.category === 'ecommerce' ? 'Online store' : theme.category === 'landing' ? 'Landing page' : 'Company profile'} · sample content
          </span>
        </div>
        <button onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(244,241,234,0.1)', border: '1px solid rgba(244,241,234,0.2)', color: '#F4F1EA', borderRadius: 100, padding: '7px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          Close preview
        </button>
      </div>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(1080px, 100%)', flex: 1, minHeight: 0, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(244,241,234,0.15)', boxShadow: '0 40px 100px rgba(0,0,0,0.6)' }}>
        <div style={{ height: '100%', overflowY: 'auto', background: '#fff' }}>
          <Layout data={data} activeSlug={activeSlug} setActiveSlug={setActiveSlug} />
        </div>
      </div>
    </div>
  );
}