// Public-site rendering.
//
// Every theme used to share three identical skeletons with only the accent
// colour swapped — ten coats of paint, not ten themes. Each theme now owns a
// VARIANT: a deliberate set of design decisions (hero composition, card
// language, button shape, nav treatment, type scale) consumed by every block,
// so Boutique Noir is an editorial dark boutique, Market Fresh is friendly
// rounded commerce, Corporate Clean is a conservative firm site — from the
// same honest renderer the theme previews use.
//
// Commercial blocks are wired to the platform: product cards raise CRM
// enquiries ("[Product enquiry] …" lands in the Messages inbox), the
// subscribe block captures mailing-list emails as CRM contacts, and the
// contact form was already a lead. PublicSite beacons per-page site_visits.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiPost } from '../../api/client.js';
import { waDigits } from '../../lib/whatsapp.js';

const FONT_STACKS = {
  'sans-clean':    "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  'sans-bold':     "'Inter', 'Poppins', sans-serif",
  'serif-display': "'Georgia', 'Times New Roman', serif",
};

/* ---- the design decisions each theme owns ------------------------------- */
const DEFAULT_VARIANT = { hero: 'overlay', card: 'bordered', btnRadius: 8, navCaps: false, narrow: false, display: 1, headingWeight: 700 };
const VARIANTS = {
  // ecommerce
  'storefront-classic':    { hero: 'overlay',   card: 'bordered', btnRadius: 8,   headingWeight: 700 },
  'boutique-noir':         { hero: 'editorial', card: 'minimal',  btnRadius: 0,   navCaps: true, display: 1.12, headingWeight: 500 },
  'market-fresh':          { hero: 'split',     card: 'rounded',  btnRadius: 999, display: 1.05, headingWeight: 800 },
  // landing
  'launch-bold':           { hero: 'full',      card: 'bordered', btnRadius: 4,   display: 1.3, headingWeight: 800 },
  'minimal-pitch':         { hero: 'minimal',   card: 'plain',    btnRadius: 8,   narrow: true, display: 0.92, headingWeight: 600 },
  'startup-gradient':      { hero: 'gradient',  card: 'glass',    btnRadius: 999, display: 1.1, headingWeight: 800 },
  'feature-focus':         { hero: 'overlay',   card: 'zigzag',   btnRadius: 10,  headingWeight: 700 },
  // company
  'corporate-clean':       { hero: 'boxed',     card: 'bordered', btnRadius: 4,   display: 0.9, headingWeight: 700 },
  'agency-modern':         { hero: 'editorial', card: 'minimal',  btnRadius: 0,   navCaps: true, display: 1.25, headingWeight: 800 },
  'professional-services': { hero: 'minimal',   card: 'bordered', btnRadius: 8,   display: 0.95, headingWeight: 600 },
};
const variantFor = (theme) => ({ ...DEFAULT_VARIANT, ...(VARIANTS[theme?.key] || {}) });

// darken a hex for gradients/hover without a colour library
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (x) => Math.max(0, Math.min(255, Math.round(x * (1 + amt))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`;
}

function useThemeVars(theme) {
  return useMemo(() => {
    const dark = theme.tone === 'dark';
    return {
      '--site-accent': theme.accentColor || theme.accent,
      '--site-accent-dark': shade(theme.accentColor || theme.accent, -0.25),
      '--site-bg': dark ? '#0d0f14' : '#ffffff',
      '--site-fg': dark ? '#f2f2f2' : '#14161a',
      '--site-muted': dark ? '#a5a5ad' : '#5c5f66',
      '--site-surface': dark ? '#181b21' : '#f7f7f8',
      '--site-line': dark ? '#2a2e37' : '#e7e7ea',
      '--site-font': FONT_STACKS[theme.fontPair] || FONT_STACKS['sans-clean'],
    };
  }, [theme]);
}

const btnStyle = (v, filled = true) => ({
  display: 'inline-block', padding: '13px 30px', borderRadius: v.btnRadius, textDecoration: 'none',
  fontWeight: 650, fontSize: 14.5, cursor: 'pointer', border: '1px solid transparent',
  ...(filled
    ? { background: 'var(--site-accent)', color: '#fff' }
    : { background: 'transparent', color: 'var(--site-fg)', borderColor: 'var(--site-line)' }),
  ...(v.navCaps ? { textTransform: 'uppercase', letterSpacing: '.12em', fontSize: 12.5 } : {}),
});

const secWidth = (v, base = 960) => (v.narrow ? Math.min(base, 660) : base);
const H2 = ({ v, children, align = 'center' }) => (
  <h2 style={{
    fontSize: `clamp(${22 * v.display}px, ${3 * v.display}vw, ${28 * v.display}px)`, marginBottom: 24,
    textAlign: align, fontFamily: 'var(--site-font)', fontWeight: v.headingWeight,
    ...(v.navCaps ? { letterSpacing: '.04em' } : {}),
  }}>{children}</h2>
);

/* ---- hero ------------------------------------------------------------------ */
function Hero({ c, v }) {
  const img = c.image_url;
  const h1Size = `clamp(${30 * v.display}px, ${6 * v.display}vw, ${46 * v.display}px)`;
  const button = c.button_text && (
    <a href={c.button_link || '#'} style={{ ...btnStyle(v), boxShadow: img || v.hero === 'gradient' ? '0 10px 28px rgba(0,0,0,0.3)' : 'none' }}>{c.button_text}</a>
  );

  if (v.hero === 'editorial') {
    return (
      <section style={{
        position: 'relative', minHeight: 520, display: 'flex', alignItems: 'flex-end', padding: 'clamp(28px, 5vw, 64px)',
        ...(img ? { backgroundImage: `linear-gradient(100deg, rgba(6,7,10,0.78) 8%, rgba(6,7,10,0.25) 60%, rgba(6,7,10,0.55)), url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center', color: '#fff' } : { background: 'var(--site-surface)' }),
      }}>
        <div style={{ maxWidth: 640 }}>
          <div style={{ fontSize: 12, letterSpacing: '.34em', textTransform: 'uppercase', color: img ? 'rgba(255,255,255,0.75)' : 'var(--site-accent)', marginBottom: 18 }}>— Est. Lagos</div>
          <h1 style={{ fontSize: h1Size, lineHeight: 1.05, margin: '0 0 16px', fontFamily: 'var(--site-font)', fontWeight: v.headingWeight, letterSpacing: '.01em' }}>{c.heading}</h1>
          {c.subheading && <p style={{ fontSize: 16.5, lineHeight: 1.65, color: img ? 'rgba(255,255,255,0.82)' : 'var(--site-muted)', maxWidth: 480, margin: '0 0 28px' }}>{c.subheading}</p>}
          {button}
        </div>
      </section>
    );
  }

  if (v.hero === 'split') {
    return (
      <section style={{ display: 'grid', gridTemplateColumns: img ? 'minmax(300px, 1fr) minmax(280px, 1fr)' : '1fr', minHeight: 460 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'clamp(28px, 5vw, 64px)', background: 'var(--site-surface)' }}>
          <span style={{ alignSelf: 'flex-start', fontSize: 12.5, fontWeight: 800, background: 'var(--site-accent)', color: '#fff', borderRadius: 999, padding: '6px 16px', marginBottom: 20 }}>Now delivering nationwide</span>
          <h1 style={{ fontSize: h1Size, lineHeight: 1.08, margin: '0 0 14px', fontFamily: 'var(--site-font)', fontWeight: v.headingWeight }}>{c.heading}</h1>
          {c.subheading && <p style={{ fontSize: 16.5, lineHeight: 1.65, color: 'var(--site-muted)', margin: '0 0 26px', maxWidth: 440 }}>{c.subheading}</p>}
          <div>{button}</div>
        </div>
        {img && <div style={{ backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center', minHeight: 300 }} />}
      </section>
    );
  }

  if (v.hero === 'gradient') {
    return (
      <section style={{
        padding: 'clamp(80px, 13vw, 130px) 24px', textAlign: 'center', color: '#fff',
        background: `radial-gradient(700px 340px at 20% 0%, rgba(255,255,255,0.14), transparent 60%), radial-gradient(600px 320px at 90% 100%, rgba(0,0,0,0.25), transparent 60%), linear-gradient(135deg, var(--site-accent) 0%, var(--site-accent-dark) 100%)`,
      }}>
        <h1 style={{ fontSize: h1Size, lineHeight: 1.08, margin: '0 0 16px', fontFamily: 'var(--site-font)', fontWeight: v.headingWeight, textShadow: '0 2px 24px rgba(0,0,0,0.25)' }}>{c.heading}</h1>
        {c.subheading && <p style={{ fontSize: 17, lineHeight: 1.6, color: 'rgba(255,255,255,0.86)', maxWidth: 560, margin: '0 auto 30px' }}>{c.subheading}</p>}
        {c.button_text && <a href={c.button_link || '#'} style={{ ...btnStyle(v), background: '#fff', color: 'var(--site-accent-dark)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}>{c.button_text}</a>}
      </section>
    );
  }

  if (v.hero === 'minimal') {
    return (
      <section style={{ padding: 'clamp(72px, 11vw, 110px) 24px', textAlign: 'center' }}>
        <div style={{ width: 34, height: 3, background: 'var(--site-accent)', margin: '0 auto 30px' }} />
        <h1 style={{ fontSize: h1Size, lineHeight: 1.14, margin: '0 auto 16px', maxWidth: 640, fontFamily: 'var(--site-font)', fontWeight: v.headingWeight }}>{c.heading}</h1>
        {c.subheading && <p style={{ fontSize: 16.5, lineHeight: 1.7, color: 'var(--site-muted)', maxWidth: 520, margin: '0 auto 30px' }}>{c.subheading}</p>}
        {button}
      </section>
    );
  }

  if (v.hero === 'boxed') {
    return (
      <section style={{ borderBottom: '1px solid var(--site-line)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(40px, 7vw, 64px) 24px', display: 'grid', gridTemplateColumns: img ? '1.2fr minmax(220px, 0.8fr)' : '1fr', gap: 36, alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: h1Size, lineHeight: 1.15, margin: '0 0 14px', fontFamily: 'var(--site-font)', fontWeight: v.headingWeight }}>{c.heading}</h1>
            {c.subheading && <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--site-muted)', margin: '0 0 24px', maxWidth: 480 }}>{c.subheading}</p>}
            {button}
          </div>
          {img && <img src={img} alt="" style={{ width: '100%', borderRadius: 6, border: '1px solid var(--site-line)', objectFit: 'cover', aspectRatio: '4/3' }} />}
        </div>
      </section>
    );
  }

  // 'overlay' and 'full'
  const tall = v.hero === 'full';
  return (
    <section style={{
      padding: img ? `clamp(${tall ? 120 : 90}px, ${tall ? 20 : 16}vw, ${tall ? 200 : 150}px) 24px` : 'clamp(56px, 10vw, 84px) 24px', textAlign: 'center',
      ...(img ? { backgroundImage: `linear-gradient(rgba(8,10,16,0.52), rgba(8,10,16,0.62)), url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center', color: '#fff' } : {}),
    }}>
      <h1 style={{ fontSize: tall ? `clamp(38px, 8vw, 64px)` : h1Size, lineHeight: 1.1, margin: '0 0 14px', fontFamily: 'var(--site-font)', fontWeight: v.headingWeight, ...(img ? { textShadow: '0 2px 18px rgba(0,0,0,0.35)' } : {}) }}>{c.heading}</h1>
      {c.subheading && <p style={{ fontSize: 'clamp(15px, 2.4vw, 18px)', color: img ? 'rgba(255,255,255,0.88)' : 'var(--site-muted)', maxWidth: 560, margin: '0 auto 26px', lineHeight: 1.6 }}>{c.subheading}</p>}
      {button}
    </section>
  );
}

/* ---- features --------------------------------------------------------------- */
function Features({ c, v }) {
  const items = c.items || [];
  if (v.card === 'zigzag') {
    return (
      <section style={{ padding: '56px 24px', maxWidth: 860, margin: '0 auto' }}>
        {c.heading && <H2 v={v}>{c.heading}</H2>}
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 26, alignItems: 'flex-start', flexDirection: i % 2 ? 'row-reverse' : 'row', padding: '26px 0', borderTop: i > 0 ? '1px solid var(--site-line)' : 'none' }}>
            <div style={{ fontSize: 44, fontWeight: 800, color: 'var(--site-accent)', opacity: 0.25, lineHeight: 1, fontFamily: 'var(--site-font)', flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</div>
            <div style={{ textAlign: i % 2 ? 'right' : 'left' }}>
              <h3 style={{ fontSize: 17, margin: '4px 0 8px', fontWeight: 700 }}>{it.title}</h3>
              <p style={{ fontSize: 14, color: 'var(--site-muted)', margin: 0, lineHeight: 1.65 }}>{it.body}</p>
            </div>
          </div>
        ))}
      </section>
    );
  }
  const cardStyles = {
    bordered: { padding: 20, background: 'var(--site-surface)', border: '1px solid var(--site-line)', borderRadius: Math.min(v.btnRadius === 999 ? 18 : v.btnRadius + 6, 18) },
    rounded: { padding: 24, background: 'var(--site-surface)', borderRadius: 20, boxShadow: '0 10px 30px rgba(20,22,26,0.07)' },
    glass: { padding: 22, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16, backdropFilter: 'blur(8px)' },
    minimal: { padding: '20px 0 0', borderTop: '2px solid var(--site-accent)' },
    plain: { padding: 0 },
  };
  return (
    <section style={{ padding: '56px 24px', maxWidth: secWidth(v), margin: '0 auto' }}>
      {c.heading && <H2 v={v}>{c.heading}</H2>}
      <div style={{ display: 'grid', gridTemplateColumns: v.narrow ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: v.card === 'minimal' ? 32 : 20 }}>
        {items.map((it, i) => (
          <div key={i} style={cardStyles[v.card] || cardStyles.bordered}>
            <h3 style={{ fontSize: 16, margin: '0 0 8px', fontWeight: 700, ...(v.navCaps ? { textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 13.5 } : {}) }}>{it.title}</h3>
            <p style={{ fontSize: 13.5, color: 'var(--site-muted)', margin: 0, lineHeight: 1.65 }}>{it.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---- cart ---------------------------------------------------------------------
   Real store behaviour without demanding the merchant owns a payment
   gateway: the cart builds an order, checkout takes the customer's details,
   and payment is bank transfer to the merchant's own account (details shown
   after ordering, proof sent on WhatsApp) or cash on delivery. */
const CartCtx = createContext(null);
const fmtN = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;

function CartProvider({ slug, children }) {
  const storageKey = `collarone_cart_${slug}`;
  const [items, setItems] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const [open, setOpen] = useState(false);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(items)); } catch { /* private mode */ } }, [items, storageKey]);

  const add = (p) => {
    setItems((s) => {
      const found = s.find((x) => x.id === p.id);
      return found ? s.map((x) => (x.id === p.id ? { ...x, qty: Math.min(99, x.qty + 1) } : x))
                   : [...s, { id: p.id, name: p.name, price: p.price || 0, imageUrl: p.imageUrl || '', qty: 1 }];
    });
    setOpen(true);
  };
  const setQty = (id, qty) => setItems((s) => (qty < 1 ? s.filter((x) => x.id !== id) : s.map((x) => (x.id === id ? { ...x, qty: Math.min(99, qty) } : x))));
  const clear = () => setItems([]);
  const total = items.reduce((sum, x) => sum + (x.price || 0) * x.qty, 0);
  const count = items.reduce((sum, x) => sum + x.qty, 0);

  return <CartCtx.Provider value={{ items, add, setQty, clear, total, count, open, setOpen }}>{children}</CartCtx.Provider>;
}

function CartButton({ v }) {
  const cart = useContext(CartCtx);
  if (!cart) return null;
  return (
    <button onClick={() => cart.setOpen(true)} aria-label="Open cart"
      style={{ ...btnStyle(v), padding: '8px 16px', fontSize: v.navCaps ? 11.5 : 13, display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3.5h3l2.6 12h10.4l2-8.5H6.2" /></svg>
      Cart{cart.count > 0 && <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 999, padding: '1px 8px', fontSize: 11.5, fontWeight: 800 }}>{cart.count}</span>}
    </button>
  );
}

function CartDrawer({ site, v }) {
  const cart = useContext(CartCtx);
  const [view, setView] = useState('cart'); // cart | checkout | done
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '', note: '', method: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const set = (k, val) => setF((s) => ({ ...s, [k]: val }));
  const pay = site.payments || { enableTransfer: true, enableCod: true };
  const methods = [
    pay.enableTransfer && ['transfer', 'Bank transfer', 'Pay into the store’s account — details shown after you order.'],
    pay.enableCod && ['cod', 'Pay on delivery', 'Pay cash or transfer when your order arrives.'],
  ].filter(Boolean);
  const wa = waDigits(site.contactWhatsapp);

  if (!cart || !cart.open) return null;

  const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', border: '1px solid #dcdce0', background: '#fff', color: '#14161a' };
  const label = { display: 'block', fontSize: 12.5, color: '#5c5f66', margin: '0 0 4px' };

  const placeOrder = async (e) => {
    e.preventDefault();
    if (site.isPreview) return setError('This is a preview — ordering switches on when the site is published.');
    if (!f.name.trim()) return setError('Your name is required.');
    if (!f.phone.trim()) return setError('Your phone number is required — it’s how the store reaches you.');
    if (!f.method) return setError('Choose how you want to pay.');
    setBusy(true); setError('');
    try {
      const d = await apiPost('/site/order', {
        orgSlug: site.slug, name: f.name, phone: f.phone, email: f.email, address: f.address, note: f.note,
        method: f.method, items: cart.items.map((x) => ({ id: x.id, qty: x.qty })),
      });
      setReceipt(d);
      cart.clear();
      setView('done');
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  };

  const close = () => { cart.setOpen(false); if (view === 'done') { setView('cart'); setReceipt(null); setF({ name: '', phone: '', email: '', address: '', note: '', method: '' }); } };

  return (
    <div onMouseDown={close} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(10,12,18,0.55)' }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(430px, 96vw)', background: '#fff', color: '#14161a', boxShadow: '-24px 0 70px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #ececef' }}>
          <strong style={{ fontSize: 15.5 }}>{view === 'done' ? 'Order placed' : view === 'checkout' ? 'Checkout' : 'Your cart'}</strong>
          <button onClick={close} aria-label="Close cart" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5c5f66', padding: 4 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {view === 'cart' && (
            cart.items.length === 0 ? (
              <p style={{ fontSize: 14, color: '#5c5f66', textAlign: 'center', marginTop: 40 }}>Your cart is empty — add something you like.</p>
            ) : cart.items.map((x) => (
              <div key={x.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f0f2' }}>
                {x.imageUrl
                  ? <img src={x.imageUrl} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 52, height: 52, borderRadius: 8, background: '#f2f2f4', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name}</div>
                  <div style={{ fontSize: 12.5, color: '#5c5f66', marginTop: 2 }}>{fmtN(x.price)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => cart.setQty(x.id, x.qty - 1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #dcdce0', background: '#fff', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>−</button>
                  <span style={{ width: 22, textAlign: 'center', fontSize: 13.5, fontWeight: 650 }}>{x.qty}</span>
                  <button onClick={() => cart.setQty(x.id, x.qty + 1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #dcdce0', background: '#fff', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>+</button>
                </div>
              </div>
            ))
          )}

          {view === 'checkout' && (
            <form onSubmit={placeOrder} id="co-checkout">
              <div style={{ marginBottom: 10 }}><span style={label}>Your name *</span><input style={input} value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></div>
              <div style={{ marginBottom: 10 }}><span style={label}>Phone / WhatsApp *</span><input style={input} value={f.phone} onChange={(e) => set('phone', e.target.value)} required placeholder="0801 234 5678" /></div>
              <div style={{ marginBottom: 10 }}><span style={label}>Delivery address</span><textarea style={{ ...input, resize: 'vertical' }} rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div><span style={label}>Email</span><input style={input} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
                <div><span style={label}>Note to the store</span><input style={input} value={f.note} onChange={(e) => set('note', e.target.value)} /></div>
              </div>
              <span style={{ ...label, marginBottom: 8 }}>How will you pay? *</span>
              {methods.map(([key, title, desc]) => (
                <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: `1.5px solid ${f.method === key ? 'var(--site-accent, #FF5B1F)' : '#e2e2e6'}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8, cursor: 'pointer' }}>
                  <input type="radio" name="method" checked={f.method === key} onChange={() => set('method', key)} style={{ marginTop: 3 }} />
                  <span>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{title}</span>
                    <span style={{ display: 'block', fontSize: 12, color: '#5c5f66', marginTop: 2 }}>{desc}</span>
                  </span>
                </label>
              ))}
              {methods.length === 0 && <p style={{ fontSize: 13, color: '#5c5f66' }}>This store takes orders on WhatsApp — use the button below.</p>}
              {error && <p style={{ color: '#c0392b', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
            </form>
          )}

          {view === 'done' && receipt && (
            <div>
              <div style={{ textAlign: 'center', padding: '10px 0 18px' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1a7a3e" strokeWidth="2" strokeLinecap="round" style={{ margin: '0 auto 10px', display: 'block' }}><circle cx="12" cy="12" r="9.5" /><path d="M8 12.5l2.7 2.7L16 9.5" /></svg>
                <div style={{ fontSize: 17, fontWeight: 750 }}>Order {receipt.orderNo}</div>
                <div style={{ fontSize: 13.5, color: '#5c5f66', marginTop: 4 }}>Total: <strong style={{ color: '#14161a' }}>{fmtN(receipt.total)}</strong></div>
              </div>
              {receipt.method === 'transfer' && receipt.bank && (
                <div style={{ border: '1px solid #e2e2e6', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5c5f66', marginBottom: 10 }}>Pay by transfer</div>
                  {receipt.bank.accountNumber ? (
                    <>
                      <div style={{ fontSize: 14, lineHeight: 1.9 }}>
                        <div><span style={{ color: '#5c5f66' }}>Bank:</span> <strong>{receipt.bank.bankName || '—'}</strong></div>
                        <div><span style={{ color: '#5c5f66' }}>Account name:</span> <strong>{receipt.bank.accountName || '—'}</strong></div>
                        <div><span style={{ color: '#5c5f66' }}>Account number:</span> <strong style={{ fontSize: 16, letterSpacing: '.04em' }}>{receipt.bank.accountNumber}</strong></div>
                        <div><span style={{ color: '#5c5f66' }}>Amount:</span> <strong>{fmtN(receipt.total)}</strong></div>
                      </div>
                      {receipt.bank.note && <p style={{ fontSize: 12.5, color: '#5c5f66', margin: '10px 0 0' }}>{receipt.bank.note}</p>}
                    </>
                  ) : (
                    <p style={{ fontSize: 13.5, color: '#5c5f66', margin: 0 }}>The store will send you their account details on WhatsApp or by phone.</p>
                  )}
                </div>
              )}
              {receipt.method === 'cod' && (
                <p style={{ fontSize: 13.5, color: '#5c5f66', lineHeight: 1.65, border: '1px solid #e2e2e6', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  You'll pay when your order arrives. The store will call <strong>{f.phone}</strong> to confirm delivery.
                </p>
              )}
              {wa && (
                <a target="_blank" rel="noreferrer"
                  href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hello ${site.siteName || site.orgName}, I just placed order ${receipt.orderNo} for ${fmtN(receipt.total)}${receipt.method === 'transfer' ? ' — I will send my transfer proof here.' : ' (pay on delivery).'}`)}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#1FAF54', color: '#fff', borderRadius: 10, padding: '13px 0', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.2 14.2c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-3-.9-5-3.6-5.6-4.5-.5-.8-1-1.9-1-2.9 0-1 .5-1.5.7-1.7.3-.3.9-.3 1.1-.2.2 0 .5.1.7.6l.7 1.7c.1.2 0 .5-.1.6l-.5.6c-.1.2-.2.3 0 .6.5.8 1.6 2 3 2.6.3.1.5.1.7-.1l.7-.9c.2-.2.4-.2.6-.1l1.8.8c.3.2.5.3.5.5s0 .8-.2 1.3z"/></svg>
                  {receipt.method === 'transfer' ? 'Send payment proof on WhatsApp' : 'Confirm your order on WhatsApp'}
                </a>
              )}
            </div>
          )}
        </div>

        {view !== 'done' && cart.items.length > 0 && (
          <div style={{ borderTop: '1px solid #ececef', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14.5, marginBottom: 12 }}>
              <span style={{ color: '#5c5f66' }}>Total</span>
              <strong>{fmtN(cart.total)}</strong>
            </div>
            {view === 'cart' ? (
              <button onClick={() => setView('checkout')} style={{ ...btnStyle(v), width: '100%', textAlign: 'center', border: 'none' }}>Checkout</button>
            ) : (
              site.isPreview ? (
                <div style={{ fontSize: 13, color: '#5c5f66', textAlign: 'center', lineHeight: 1.6, padding: '4px 6px' }}>
                  Preview mode — the cart works, and ordering switches on the moment this site is published.
                </div>
              ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setView('cart')} style={{ ...btnStyle(v, false), color: '#14161a', flex: '0 0 auto' }}>Back</button>
                <button form="co-checkout" disabled={busy} style={{ ...btnStyle(v), flex: 1, textAlign: 'center', border: 'none', opacity: busy ? 0.7 : 1 }}>{busy ? 'Placing order…' : `Place order · ${fmtN(cart.total)}`}</button>
              </div>
              )
            )}
          </div>
        )}
        {view === 'done' && (
          <div style={{ borderTop: '1px solid #ececef', padding: 18 }}>
            <button onClick={close} style={{ ...btnStyle(v, false), width: '100%', textAlign: 'center', color: '#14161a' }}>Continue shopping</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- products (with cart + CRM enquiry + WhatsApp order) ---------------------- */
function ProductsSection({ c, site, v }) {
  const cart = useContext(CartCtx); // present on store sites; null elsewhere → Enquire fallback
  const [enquire, setEnquire] = useState(null); // product | null
  const products = (site.products || []).slice(0, c.limit > 0 ? c.limit : undefined);
  const wa = waDigits(site.contactWhatsapp);
  const money = (n) => `₦${Number(n).toLocaleString('en-NG')}`;

  const cardChrome = {
    bordered: { border: '1px solid var(--site-line)', borderRadius: 10, overflow: 'hidden', background: 'var(--site-surface)' },
    rounded: { borderRadius: 20, overflow: 'hidden', background: 'var(--site-surface)', boxShadow: '0 12px 32px rgba(20,22,26,0.08)' },
    minimal: {},
    glass: { border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' },
  }[v.card] || {};
  const imgRadius = v.card === 'minimal' ? 2 : 0;

  return (
    <section style={{ padding: '56px 24px', maxWidth: 1000, margin: '0 auto' }}>
      {c.heading && <H2 v={v}>{c.heading}</H2>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: v.card === 'minimal' ? 28 : 18 }}>
        {products.map((p) => (
          <div key={p.id} style={cardChrome}>
            <div style={{ aspectRatio: v.card === 'minimal' ? '4/5' : '1/1', background: 'var(--site-surface)', overflow: 'hidden', borderRadius: imgRadius }}>
              {p.imageUrl
                ? <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--site-muted)', fontSize: 12 }}>No image</div>}
            </div>
            <div style={{ padding: v.card === 'minimal' ? '12px 0 0' : 14 }}>
              <div style={{ fontWeight: 650, fontSize: 14, ...(v.navCaps ? { textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 12.5 } : {}) }}>{p.name}</div>
              {p.price != null && (
                v.card === 'rounded'
                  ? <span style={{ display: 'inline-block', marginTop: 8, background: 'var(--site-accent)', color: '#fff', fontWeight: 700, fontSize: 12.5, borderRadius: 999, padding: '4px 12px' }}>{money(p.price)}</span>
                  : <div style={{ color: v.card === 'minimal' ? 'var(--site-muted)' : 'var(--site-accent)', fontWeight: v.card === 'minimal' ? 500 : 700, marginTop: 5, fontSize: 13.5 }}>{money(p.price)}</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {cart ? (
                  <button onClick={() => cart.add(p)} style={{ ...btnStyle(v), padding: '9px 14px', fontSize: 12.5, flex: 1, textAlign: 'center', border: 'none' }}>
                    Add to cart
                  </button>
                ) : (
                  <button onClick={() => setEnquire(p)} style={{ ...btnStyle(v, false), padding: '8px 14px', fontSize: 12.5, flex: 1, textAlign: 'center', color: 'var(--site-accent)', borderColor: 'var(--site-accent)' }}>
                    Enquire
                  </button>
                )}
                {wa && (
                  <a target="_blank" rel="noreferrer" title="Order on WhatsApp"
                    href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hello ${site.siteName || site.orgName}, I want to order: ${p.name}${p.price != null ? ` (${money(p.price)})` : ''}`)}`}
                    style={{ ...btnStyle(v), padding: '8px 12px', fontSize: 12.5, background: '#1FAF54', display: 'inline-flex', alignItems: 'center', border: 'none' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.2 14.2c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-3-.9-5-3.6-5.6-4.5-.5-.8-1-1.9-1-2.9 0-1 .5-1.5.7-1.7.3-.3.9-.3 1.1-.2.2 0 .5.1.7.6l.7 1.7c.1.2 0 .5-.1.6l-.5.6c-.1.2-.2.3 0 .6.5.8 1.6 2 3 2.6.3.1.5.1.7-.1l.7-.9c.2-.2.4-.2.6-.1l1.8.8c.3.2.5.3.5.5s0 .8-.2 1.3z"/></svg>
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
        {products.length === 0 && <p style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--site-muted)' }}>No products listed yet.</p>}
      </div>
      {enquire && <EnquiryModal product={enquire} site={site} v={v} onClose={() => setEnquire(null)} />}
    </section>
  );
}

// Product enquiry → lands in the business's CRM Messages inbox with the
// product named, via the same public lead RPC as the contact form.
function EnquiryModal({ product, site, v, onClose }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', message: `I'm interested in ${product.name}. Is it available?` });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const set = (k, val) => setF((s) => ({ ...s, [k]: val }));
  const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', border: '1px solid #dcdce0', background: '#fff', color: '#14161a' };
  const label = { display: 'block', fontSize: 12.5, color: '#5c5f66', margin: '0 0 4px' };

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setError('Your name is required.');
    setBusy(true); setError('');
    try {
      const price = product.price != null ? ` (₦${Number(product.price).toLocaleString('en-NG')})` : '';
      await apiPost('/embed/lead', {
        orgSlug: site.slug, name: f.name, email: f.email, phone: f.phone,
        message: `[Product enquiry] ${product.name}${price} — ${f.message}`, source: 'product_enquiry',
      });
      setDone(true);
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  };

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(10,12,18,0.6)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(430px, 100%)', background: '#fff', color: '#14161a', borderRadius: 14, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.4)' }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '18px 4px' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Enquiry sent</div>
            <div style={{ fontSize: 13.5, color: '#5c5f66', lineHeight: 1.6 }}>Thanks {f.name.split(' ')[0]} — {site.siteName || site.orgName} has received your enquiry about {product.name} and will get back to you.</div>
            <button onClick={onClose} style={{ ...btnStyle(v), marginTop: 18 }}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 2 }}>Enquire about {product.name}</div>
            <p style={{ fontSize: 12.5, color: '#5c5f66', margin: '0 0 16px' }}>Send your details — the team replies on WhatsApp, call or email.</p>
            <div style={{ marginBottom: 10 }}><span style={label}>Your name *</span><input style={input} value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><span style={label}>Phone / WhatsApp</span><input style={input} value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
              <div><span style={label}>Email</span><input style={input} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
            </div>
            <div style={{ marginBottom: 14 }}><span style={label}>Message</span><textarea style={{ ...input, resize: 'vertical' }} rows={3} value={f.message} onChange={(e) => set('message', e.target.value)} /></div>
            {error && <p style={{ color: '#c0392b', fontSize: 13, margin: '0 0 10px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={{ ...btnStyle(v, false), color: '#14161a' }}>Cancel</button>
              <button disabled={busy} style={{ ...btnStyle(v), opacity: busy ? 0.7 : 1 }}>{busy ? 'Sending…' : 'Send enquiry'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ---- mailing-list signup → CRM contact ---------------------------------------- */
function SubscribeSection({ c, site, v }) {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email address.');
    setBusy(true); setError('');
    try {
      await apiPost('/embed/lead', {
        orgSlug: site.slug, name: email.split('@')[0], email, phone: '',
        message: '[Mailing list] Subscribed through the website.', source: 'subscribe',
      });
      setDone(true);
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  };

  return (
    <section style={{ padding: '52px 24px', background: v.hero === 'gradient' ? 'transparent' : 'var(--site-surface)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
        <H2 v={v}>{c.heading || 'Stay in the loop'}</H2>
        <p style={{ fontSize: 14.5, color: 'var(--site-muted)', margin: '-10px 0 22px', lineHeight: 1.6 }}>
          {c.blurb || 'New arrivals, offers and updates — straight to your inbox. No spam.'}
        </p>
        {done ? (
          <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--site-accent)' }}>You're on the list — thank you.</div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required
              style={{ flex: '1 1 220px', maxWidth: 320, boxSizing: 'border-box', padding: '12px 14px', borderRadius: v.btnRadius === 999 ? 999 : Math.max(v.btnRadius, 4), fontSize: 14, fontFamily: 'inherit', border: '1px solid var(--site-line)', background: 'var(--site-bg)', color: 'var(--site-fg)' }} />
            <button disabled={busy} style={{ ...btnStyle(v), opacity: busy ? 0.7 : 1 }}>{busy ? 'Joining…' : (c.button_text || 'Subscribe')}</button>
          </form>
        )}
        {error && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 10 }}>{error}</p>}
      </div>
    </section>
  );
}

/* ---- contact form (lead capture) ---------------------------------------------- */
function ContactFormSection({ site, v }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const set = (k, val) => setF((s) => ({ ...s, [k]: val }));

  const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: Math.max(v.btnRadius === 999 ? 10 : v.btnRadius, 2), fontSize: 14, fontFamily: 'inherit', border: '1px solid var(--site-line)', background: 'var(--site-bg)', color: 'var(--site-fg)' };
  const label = { display: 'block', fontSize: 12.5, color: 'var(--site-muted)', margin: '0 0 4px' };

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setError('Your name is required.');
    if (!f.message.trim()) return setError('Write a short message.');
    setBusy(true); setError('');
    try {
      await apiPost('/embed/lead', { orgSlug: site.slug, ...f });
      setDone(true);
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  };

  return (
    <section id="contact" style={{ padding: '48px 24px', maxWidth: 520, margin: '0 auto' }}>
      <H2 v={v}>Get in touch</H2>
      <p style={{ fontSize: 14, color: 'var(--site-muted)', textAlign: 'center', margin: '-10px 0 22px' }}>Send a message and we'll get back to you.</p>

      {done ? (
        <div style={{ textAlign: 'center', padding: '26px 16px', background: 'var(--site-surface)', border: '1px solid var(--site-line)', borderRadius: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Message sent</div>
          <div style={{ fontSize: 13.5, color: 'var(--site-muted)' }}>Thanks {f.name.split(' ')[0]} — we've received it and will reply shortly.</div>
        </div>
      ) : (
        <form onSubmit={submit} style={{ background: 'var(--site-surface)', border: '1px solid var(--site-line)', borderRadius: 12, padding: 20 }}>
          <div style={{ marginBottom: 12 }}><span style={label}>Your name *</span><input style={input} value={f.name} onChange={(e) => set('name', e.target.value)} required /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><span style={label}>Email</span><input style={input} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
            <div><span style={label}>Phone / WhatsApp</span><input style={input} value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><span style={label}>Message *</span><textarea style={{ ...input, resize: 'vertical' }} rows={4} value={f.message} onChange={(e) => set('message', e.target.value)} required /></div>
          {error && <p style={{ color: '#c0392b', fontSize: 13, margin: '0 0 10px' }}>{error}</p>}
          <button disabled={busy} style={{ ...btnStyle(v), width: '100%', textAlign: 'center', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Sending…' : 'Send message'}
          </button>
        </form>
      )}

      {(site.contactEmail || site.contactPhone || site.contactWhatsapp) && (
        <div style={{ textAlign: 'center', fontSize: 13.5, lineHeight: 2, marginTop: 18, color: 'var(--site-muted)' }}>
          {site.contactEmail && <span style={{ margin: '0 10px' }}>Email: <a href={`mailto:${site.contactEmail}`} style={{ color: 'var(--site-accent)' }}>{site.contactEmail}</a></span>}
          {site.contactPhone && <span style={{ margin: '0 10px' }}>Phone: <a href={`tel:${site.contactPhone}`} style={{ color: 'var(--site-accent)' }}>{site.contactPhone}</a></span>}
          {site.contactWhatsapp && <span style={{ margin: '0 10px' }}>WhatsApp: <a href={`https://wa.me/${waDigits(site.contactWhatsapp)}`} style={{ color: 'var(--site-accent)' }}>{site.contactWhatsapp}</a></span>}
        </div>
      )}
    </section>
  );
}

/* ---- block dispatcher --------------------------------------------------------- */
function Block({ block, site, v }) {
  const c = block.content || {};
  switch (block.type) {
    case 'hero':
      return <Hero c={c} v={v} />;
    case 'text':
      return (
        <section style={{ padding: '48px 24px', maxWidth: secWidth(v, 720), margin: '0 auto' }}>
          {c.heading && <H2 v={v} align="left">{c.heading}</H2>}
          <p style={{ fontSize: 15.5, lineHeight: 1.75, color: 'var(--site-muted)', whiteSpace: 'pre-wrap' }}>{c.body}</p>
        </section>
      );
    case 'image':
      return c.image_url ? (
        <section style={{ padding: '24px', textAlign: 'center', maxWidth: secWidth(v, 1000), margin: '0 auto' }}>
          <img src={c.image_url} alt={c.alt || ''} style={{ maxWidth: '100%', borderRadius: v.card === 'minimal' ? 0 : 10 }} />
          {c.caption && <p style={{ fontSize: 13, color: 'var(--site-muted)', marginTop: 8 }}>{c.caption}</p>}
        </section>
      ) : null;
    case 'features':
      return <Features c={c} v={v} />;
    case 'team':
      return (
        <section style={{ padding: '48px 24px', maxWidth: secWidth(v), margin: '0 auto' }}>
          {c.heading && <H2 v={v}>{c.heading}</H2>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20 }}>
            {(c.items || []).length === 0 && <p style={{ textAlign: 'center', color: 'var(--site-muted)', gridColumn: '1/-1' }}>Team members coming soon.</p>}
            {(c.items || []).map((it, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                {it.photo_url && <img src={it.photo_url} alt={it.name} style={{ width: 96, height: 96, borderRadius: v.card === 'minimal' ? 4 : '50%', objectFit: 'cover', margin: '0 auto 10px' }} />}
                <div style={{ fontWeight: 600 }}>{it.name}</div>
                <div style={{ fontSize: 13, color: 'var(--site-muted)' }}>{it.role}</div>
              </div>
            ))}
          </div>
        </section>
      );
    case 'testimonials':
      return (
        <section style={{ padding: '48px 24px', maxWidth: secWidth(v, 720), margin: '0 auto' }}>
          {c.heading && <H2 v={v}>{c.heading}</H2>}
          {(c.items || []).map((it, i) => (
            <blockquote key={i} style={{
              margin: '0 0 20px', padding: '16px 20px',
              ...(v.card === 'minimal'
                ? { borderLeft: 'none', textAlign: 'center', fontSize: 17, fontFamily: 'var(--site-font)' }
                : { borderLeft: '3px solid var(--site-accent)', background: 'var(--site-surface)', borderRadius: v.card === 'rounded' ? 14 : 0 }),
            }}>
              <p style={{ fontStyle: 'italic', margin: '0 0 8px', lineHeight: 1.65 }}>&ldquo;{it.quote}&rdquo;</p>
              <footer style={{ fontSize: 13, color: 'var(--site-muted)' }}>— {it.author}</footer>
            </blockquote>
          ))}
        </section>
      );
    case 'faq':
      return (
        <section style={{ padding: '48px 24px', maxWidth: secWidth(v, 640), margin: '0 auto' }}>
          {c.heading && <H2 v={v}>{c.heading}</H2>}
          {(c.items || []).map((it, i) => (
            <div key={i} style={{ marginBottom: 14, ...(v.card === 'bordered' ? { padding: '14px 16px', border: '1px solid var(--site-line)', borderRadius: 10, background: 'var(--site-surface)' } : {}) }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{it.q}</div>
              <div style={{ fontSize: 14, color: 'var(--site-muted)', lineHeight: 1.6 }}>{it.a}</div>
            </div>
          ))}
        </section>
      );
    case 'contact_form':
      return <ContactFormSection site={site} v={v} />;
    case 'subscribe':
      return <SubscribeSection c={c} site={site} v={v} />;
    case 'products':
      return <ProductsSection c={c} site={site} v={v} />;
    case 'cta':
      return (
        <section style={{
          padding: '56px 24px', textAlign: 'center',
          background: v.hero === 'gradient'
            ? `linear-gradient(135deg, var(--site-accent) 0%, var(--site-accent-dark) 100%)`
            : 'var(--site-surface)',
          color: v.hero === 'gradient' ? '#fff' : 'inherit',
        }}>
          <h2 style={{ fontSize: `clamp(${22 * v.display}px, 3vw, ${28 * v.display}px)`, marginBottom: 16, fontFamily: 'var(--site-font)', fontWeight: v.headingWeight }}>{c.heading}</h2>
          {c.button_text && (
            <a href={c.button_link || '#contact'} style={{ ...btnStyle(v), ...(v.hero === 'gradient' ? { background: '#fff', color: 'var(--site-accent-dark)' } : {}) }}>
              {c.button_text}
            </a>
          )}
        </section>
      );
    case 'footer':
      return c.note ? (
        <section style={{ padding: '18px 24px', textAlign: 'center', fontSize: 12.5, color: 'var(--site-muted)' }}>{c.note}</section>
      ) : null;
    default:
      return null;
  }
}

function SiteFooter({ site }) {
  return (
    <footer style={{ padding: '24px', textAlign: 'center', fontSize: 12.5, color: 'var(--site-muted)', borderTop: '1px solid var(--site-line)' }}>
      &copy; {new Date().getFullYear()} {site.siteName || site.orgName}. Built with Collarone.
    </footer>
  );
}

function PageBody({ page, site, v }) {
  return <main>{(page.blocks || []).map((b, i) => <Block key={i} block={b} site={site} v={v} />)}</main>;
}

/* ---- shells --------------------------------------------------------------------
   Nav treatments follow the variant too — caps themes get spaced uppercase
   links, pill themes get pill CTAs, boxed themes keep the contact strip. */
const navLink = (v, active) => ({
  fontSize: v.navCaps ? 12 : 14, textDecoration: 'none',
  color: active ? 'var(--site-accent)' : 'var(--site-fg)',
  fontWeight: active ? 650 : 450,
  ...(v.navCaps ? { textTransform: 'uppercase', letterSpacing: '.16em' } : {}),
});

function EcommerceSite({ data, activeSlug, setActiveSlug }) {
  const vars = useThemeVars(data.theme);
  const v = variantFor(data.theme);
  const page = data.pages.find((p) => p.slug === activeSlug) || data.pages.find((p) => p.is_home) || data.pages[0];
  const shop = data.pages.find((p) => p.slug === 'shop');
  return (
    <CartProvider slug={data.slug}>
      <div style={{ ...vars, background: 'var(--site-bg)', color: 'var(--site-fg)', minHeight: '100vh', fontFamily: 'var(--site-font)' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: v.navCaps ? '22px 28px' : '16px 24px', borderBottom: '1px solid var(--site-line)', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: v.navCaps ? 15 : 17, ...(v.navCaps ? { letterSpacing: '.22em', textTransform: 'uppercase' } : {}) }}>
            {data.logoUrl && <img src={data.logoUrl} alt="" style={{ width: 30, height: 30, borderRadius: v.card === 'minimal' ? 2 : 6, objectFit: 'cover' }} />}
            {data.siteName || data.orgName}
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: v.navCaps ? 26 : 18, flexWrap: 'wrap' }}>
            {data.pages.filter((p) => p.slug !== 'shop').map((p) => (
              <a key={p.slug} href={`#${p.slug}`} onClick={(e) => { e.preventDefault(); setActiveSlug(p.slug); }} style={navLink(v, page?.slug === p.slug)}>{p.title}</a>
            ))}
            {shop && (
              <a href="#shop" onClick={(e) => { e.preventDefault(); setActiveSlug('shop'); }} style={navLink(v, page?.slug === 'shop')}>
                Shop
              </a>
            )}
            <CartButton v={v} />
          </nav>
        </header>
        {page && <PageBody page={page} site={data} v={v} />}
        <SiteFooter site={data} />
        <CartDrawer site={data} v={v} />
      </div>
    </CartProvider>
  );
}

function LandingSite({ data }) {
  const vars = useThemeVars(data.theme);
  const v = variantFor(data.theme);
  const home = data.pages.find((p) => p.is_home) || data.pages[0];
  const ctaBlock = (home?.blocks || []).find((b) => b.type === 'cta' || b.type === 'hero');
  return (
    <div style={{ ...vars, background: 'var(--site-bg)', color: 'var(--site-fg)', minHeight: '100vh', fontFamily: 'var(--site-font)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', background: v.hero === 'gradient' ? 'rgba(13,15,20,0.6)' : 'var(--site-bg)', backdropFilter: v.hero === 'gradient' ? 'blur(10px)' : 'none', borderBottom: v.hero === 'minimal' ? 'none' : '1px solid var(--site-line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 16 }}>
          {data.logoUrl && <img src={data.logoUrl} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover' }} />}
          {data.siteName || data.orgName}
        </div>
        <a href="#contact" style={{ ...btnStyle(v), padding: '9px 20px', fontSize: 13 }}>
          {ctaBlock?.content?.button_text || 'Get started'}
        </a>
      </header>
      {home && <PageBody page={home} site={data} v={v} />}
      <SiteFooter site={data} />
    </div>
  );
}

function CompanySite({ data, activeSlug, setActiveSlug }) {
  const vars = useThemeVars(data.theme);
  const v = variantFor(data.theme);
  const page = data.pages.find((p) => p.slug === activeSlug) || data.pages.find((p) => p.is_home) || data.pages[0];
  return (
    <div style={{ ...vars, background: 'var(--site-bg)', color: 'var(--site-fg)', minHeight: '100vh', fontFamily: 'var(--site-font)' }}>
      {(data.contactPhone || data.contactEmail) && (
        <div style={{ background: 'var(--site-surface)', padding: '6px 24px', fontSize: 12, color: 'var(--site-muted)', textAlign: 'right' }}>
          {data.contactPhone && <span style={{ marginRight: 16 }}>{data.contactPhone}</span>}
          {data.contactEmail && <span>{data.contactEmail}</span>}
        </div>
      )}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: v.navCaps ? '24px 28px' : '18px 24px', borderBottom: '1px solid var(--site-line)', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: v.navCaps ? 15 : 18, fontFamily: 'var(--site-font)', ...(v.navCaps ? { letterSpacing: '.22em', textTransform: 'uppercase' } : {}) }}>
          {data.logoUrl && <img src={data.logoUrl} alt="" style={{ width: 32, height: 32, borderRadius: v.card === 'minimal' ? 2 : 6, objectFit: 'cover' }} />}
          {data.siteName || data.orgName}
        </div>
        <nav style={{ display: 'flex', gap: v.navCaps ? '10px 28px' : '10px 22px', flexWrap: 'wrap' }}>
          {data.pages.map((p) => (
            <a key={p.slug} href={`#${p.slug}`} onClick={(e) => { e.preventDefault(); setActiveSlug(p.slug); }} style={navLink(v, page?.slug === p.slug)}>
              {p.title}
            </a>
          ))}
        </nav>
      </header>
      {page && <PageBody page={page} site={data} v={v} />}
      <SiteFooter site={data} />
    </div>
  );
}

export const LAYOUTS = {
  'ecommerce-grid': EcommerceSite,
  'landing-hero': LandingSite,
  'company-profile': CompanySite,
};
