import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { getThemes } from '../pages/admin/website/websiteApi.js';

// Public "see the websites you could build" gallery for the landing page.
// Cards are light stylised mini-mockups (coloured by each theme's accent) so
// the section stays cheap; the FULL, motion-rich theme only loads when a
// visitor clicks Preview — the same modal Platform Control uses, with the same
// Nigerian sample content.
const ThemePreviewModal = lazy(() => import('./ThemePreview.jsx'));

const CATS = [
  { key: 'all', label: 'All' },
  { key: 'ecommerce', label: 'Online store' },
  { key: 'landing', label: 'Landing page' },
  { key: 'company', label: 'Company profile' },
];
const CAT_LABEL = { ecommerce: 'Online store', landing: 'Landing page', company: 'Company profile' };

// A tiny accent-coloured wireframe per category — enough to read the vibe.
function MiniMock({ theme }) {
  const ac = theme.accent || '#FF5B1F';
  const dark = theme.tone === 'dark';
  const bg = dark ? '#14120f' : '#fff';
  const bar = dark ? 'rgba(255,255,255,.12)' : '#eee';
  const box = dark ? 'rgba(255,255,255,.07)' : '#f1f0ee';
  const cat = theme.category;
  return (
    <div style={{ background: bg, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(10,14,26,0.08)', aspectRatio: '16/11' }}>
      <div style={{ height: 22, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', borderBottom: `1px solid ${bar}` }}>
        <span style={{ width: 6, height: 6, borderRadius: 9, background: bar }} /><span style={{ width: 6, height: 6, borderRadius: 9, background: bar }} />
        <span style={{ marginLeft: 'auto', width: 34, height: 8, borderRadius: 999, background: ac }} />
      </div>
      <div style={{ padding: 12 }}>
        {cat === 'ecommerce' ? (
          <>
            <div style={{ width: '58%', height: 12, borderRadius: 4, background: dark ? '#f4f3ef' : '#1a1a1a', marginBottom: 6 }} />
            <div style={{ width: 46, height: 9, borderRadius: 999, background: ac, marginBottom: 12 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>{[0, 1, 2].map((i) => <div key={i} style={{ aspectRatio: '1', borderRadius: 6, background: box }} />)}</div>
          </>
        ) : cat === 'landing' ? (
          <div style={{ textAlign: 'center', paddingTop: 4 }}>
            <div style={{ width: '70%', height: 13, borderRadius: 4, background: dark ? '#f4f3ef' : '#1a1a1a', margin: '0 auto 6px' }} />
            <div style={{ width: '46%', height: 8, borderRadius: 4, background: bar, margin: '0 auto 12px' }} />
            <div style={{ width: 70, height: 18, borderRadius: 999, background: ac, margin: '0 auto' }} />
          </div>
        ) : (
          <>
            <div style={{ width: '50%', height: 12, borderRadius: 4, background: dark ? '#f4f3ef' : '#1a1a1a', marginBottom: 8 }} />
            <div style={{ width: 30, height: 4, background: ac, marginBottom: 10 }} />
            {[0, 1, 2].map((i) => <div key={i} style={{ width: `${88 - i * 12}%`, height: 6, borderRadius: 3, background: box, marginBottom: 6 }} />)}
          </>
        )}
      </div>
    </div>
  );
}

export default function PublicThemeGallery() {
  const [themes, setThemes] = useState([]);
  const [cat, setCat] = useState('all');
  const [preview, setPreview] = useState(null);

  useEffect(() => { getThemes().then((t) => setThemes(t || [])).catch(() => {}); }, []);
  const shown = useMemo(() => (cat === 'all' ? themes : themes.filter((t) => t.category === cat)), [themes, cat]);
  if (!themes.length) return null;

  return (
    <section className="cl-sec cl-tint" id="themes">
      <div className="cl-wrap">
        <motion.div className="cl-sec-head" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
          <p className="cl-eyebrow">A real website, included on every plan</p>
          <h2 className="cl-sec-h">Give your business a site worth visiting</h2>
          <p className="cl-sec-lede">Pick a theme, edit every word, and sell online or take enquiries — no designer, no monthly website bill. Tap Preview to see each one live.</p>
        </motion.div>

        <div className="ptg-filters">
          {CATS.map((c) => <button key={c.key} type="button" className={`ptg-chip ${cat === c.key ? 'on' : ''}`} onClick={() => setCat(c.key)}>{c.label}</button>)}
        </div>

        <div className="ptg-grid">
          {shown.map((t, i) => (
            <motion.div key={t.key} className="ptg-card" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5, delay: (i % 3) * 0.06 }}>
              <button type="button" className="ptg-mock" onClick={() => setPreview(t)} aria-label={`Preview the ${t.name} theme`}>
                <MiniMock theme={t} />
                <span className="ptg-mock-hover">Preview live →</span>
              </button>
              <div className="ptg-meta">
                <div className="ptg-name">{t.name}<span className="ptg-cat">{CAT_LABEL[t.category] || t.category}</span></div>
                <p className="ptg-desc">{t.description}</p>
                <button type="button" className="ptg-preview" onClick={() => setPreview(t)}>Preview live</button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {preview && (
        <Suspense fallback={null}>
          <ThemePreviewModal theme={preview} onClose={() => setPreview(null)} />
        </Suspense>
      )}
    </section>
  );
}
