import { useContext, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CartProvider, CartCtx, CartDrawer, Block } from '../siteLayouts.jsx';

// =============================================================================
// Market Fresh — a bright, warm, friendly storefront for food, groceries and
// everyday goods. Cream canvas, rounded everything, a chunky rounded display
// (Fredoka), playful pill chips and bouncy motion. Deliberately the opposite of
// Boutique Noir (dark/luxe) and Atelier (editorial). Reuses the real cart.
// =============================================================================

export const meta = {
  key: 'market-fresh',
  name: 'Market Fresh',
  category: 'ecommerce',
  description: 'Bright, warm and friendly — rounded cards, a chunky playful display face and bouncy motion. Great for food and everyday goods.',
  accent: '#2E9E5B',
  fonts: 'Fredoka + Inter',
};

const money = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;
const V = { hero: 'split', card: 'rounded', btnRadius: 999, navCaps: false, display: 1.05, headingWeight: 700, h2Mode: 'pill', band: 'tint', secPad: 56, ctaMode: 'accent', footerMode: 'simple' };

function Style({ accent }) {
  const css = `
  .mf-root{ --ac:${accent}; --site-accent:${accent}; --site-accent-ui:${accent};
    --bg:#fffaf2; --fg:#241f1a; --muted:#6f665c; --line:#f0e6d6; --surface:#fff3e2;
    --f-disp:'Fredoka','Inter',sans-serif; --f-body:'Inter',system-ui,sans-serif;
    --site-bg:var(--bg); --site-fg:var(--fg); --site-muted:var(--muted); --site-surface:var(--surface); --site-line:var(--line);
    --site-font:var(--f-body); --site-font-display:var(--f-disp);
    background:var(--bg); color:var(--fg); font-family:var(--f-body); min-height:100vh; overflow-x:hidden; }
  .mf-root a:focus-visible,.mf-root button:focus-visible{ outline:2px solid var(--ac); outline-offset:3px; border-radius:12px; }

  .mf-ann{ background:var(--ac); color:#fff; text-align:center; font-size:12.5px; font-weight:600; padding:9px 12px; }
  .mf-nav{ position:sticky; top:0; z-index:40; display:flex; align-items:center; gap:20px; padding:15px clamp(18px,4vw,44px);
    background:rgba(255,250,242,.9); backdrop-filter:blur(12px); border-bottom:1px solid var(--line); }
  .mf-word{ font-family:var(--f-disp); font-weight:700; font-size:24px; letter-spacing:-0.01em; display:flex; align-items:center; gap:10px; }
  .mf-word .dot{ width:12px; height:12px; border-radius:50%; background:var(--ac); }
  .mf-links{ display:flex; align-items:center; gap:22px; margin-left:auto; }
  .mf-link{ font-size:14.5px; font-weight:500; color:var(--fg); opacity:.75; text-decoration:none; transition:opacity .15s; }
  .mf-link:hover,.mf-link.on{ opacity:1; }
  .mf-cart{ display:inline-flex; align-items:center; gap:8px; background:var(--ac); color:#fff; border:none; cursor:pointer; font:inherit; font-weight:650; font-size:14px; padding:11px 20px; border-radius:999px; transition:transform .15s; }
  .mf-cart:hover{ transform:scale(1.04); } .mf-cart .n{ background:rgba(255,255,255,.28); border-radius:999px; padding:0 7px; font-size:12px; font-weight:800; }

  .mf-hero{ display:grid; grid-template-columns:1.05fr .95fr; gap:clamp(28px,4vw,56px); align-items:center; max-width:1200px; margin:0 auto; padding:clamp(36px,5vw,72px) clamp(18px,4vw,44px); }
  .mf-chip{ display:inline-flex; align-items:center; gap:8px; background:var(--surface); color:var(--ac); font-weight:700; font-size:13px; padding:8px 16px; border-radius:999px; margin-bottom:20px; }
  .mf-h1{ font-family:var(--f-disp); font-weight:700; font-size:clamp(38px,6vw,66px); line-height:1.02; letter-spacing:-0.02em; margin:0 0 18px; }
  .mf-h1 em{ font-style:normal; color:var(--ac); }
  .mf-sub{ font-size:clamp(16px,1.8vw,18px); line-height:1.6; color:var(--muted); max-width:44ch; margin:0 0 28px; }
  .mf-btn{ display:inline-flex; align-items:center; gap:9px; background:var(--ac); color:#fff; border:none; cursor:pointer; font:inherit; font-weight:700; font-size:15.5px; padding:15px 30px; border-radius:999px; text-decoration:none; box-shadow:0 12px 26px -10px var(--ac); transition:transform .15s; }
  .mf-btn:hover{ transform:translateY(-3px); }
  .mf-shot{ position:relative; }
  .mf-shot .f{ aspect-ratio:1/1; border-radius:34px; overflow:hidden; background:var(--surface); box-shadow:0 30px 60px -24px rgba(36,31,26,.3); }
  .mf-shot .f img{ width:100%; height:100%; object-fit:cover; }
  .mf-shot .badge{ position:absolute; top:-16px; right:-10px; background:#fff; border-radius:20px; padding:14px 18px; box-shadow:0 16px 30px -12px rgba(36,31,26,.35); text-align:center; transform:rotate(6deg); }
  .mf-shot .badge b{ font-family:var(--f-disp); font-size:22px; color:var(--ac); display:block; } .mf-shot .badge span{ font-size:11px; color:var(--muted); }

  .mf-sec{ max-width:1200px; margin:0 auto; padding:clamp(44px,5vw,72px) clamp(18px,4vw,44px); }
  .mf-kick{ display:inline-block; background:var(--surface); color:var(--ac); font-weight:700; font-size:12.5px; padding:6px 14px; border-radius:999px; margin-bottom:14px; }
  .mf-h2{ font-family:var(--f-disp); font-weight:700; font-size:clamp(26px,3.6vw,40px); letter-spacing:-0.02em; margin:0 0 30px; }
  .mf-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:20px; }
  .mf-pcard{ background:#fff; border:1px solid var(--line); border-radius:22px; overflow:hidden; transition:transform .18s ease, box-shadow .18s ease; }
  .mf-pcard:hover{ transform:translateY(-5px); box-shadow:0 22px 44px -18px rgba(36,31,26,.24); }
  .mf-pimg{ aspect-ratio:1/1; overflow:hidden; background:var(--surface); }
  .mf-pimg img{ width:100%; height:100%; object-fit:cover; transition:transform .5s ease; }
  .mf-pcard:hover .mf-pimg img{ transform:scale(1.07); }
  .mf-pbody{ padding:14px 16px 16px; }
  .mf-pname{ font-weight:650; font-size:15px; }
  .mf-prow{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:10px; }
  .mf-pprice{ font-family:var(--f-disp); font-weight:700; font-size:16px; color:var(--fg); }
  .mf-add{ background:var(--ac); color:#fff; border:none; cursor:pointer; width:38px; height:38px; border-radius:999px; font-size:20px; line-height:1; display:grid; place-items:center; transition:transform .15s; }
  .mf-add:hover{ transform:scale(1.12); }

  .mf-cta{ text-align:center; padding:clamp(52px,6vw,88px) clamp(18px,4vw,44px); }
  .mf-cta .box{ max-width:900px; margin:0 auto; background:var(--ac); color:#fff; border-radius:32px; padding:clamp(40px,6vw,72px); }
  .mf-cta h2{ font-family:var(--f-disp); font-weight:700; font-size:clamp(28px,4.4vw,48px); letter-spacing:-0.02em; margin:0 auto 24px; max-width:18ch; }
  .mf-cta .box .mf-btn{ background:#fff; color:var(--ac); box-shadow:none; }

  .mf-foot{ background:var(--surface); border-top:1px solid var(--line); padding:44px clamp(18px,4vw,44px) 28px; }
  .mf-foot-in{ max-width:1200px; margin:0 auto; display:flex; flex-wrap:wrap; gap:28px; justify-content:space-between; align-items:flex-start; }
  .mf-foot .lbl{ font-weight:700; font-size:12px; color:var(--ac); margin-bottom:8px; }
  .mf-foot .cp{ max-width:1200px; margin:26px auto 0; padding-top:18px; border-top:1px solid var(--line); font-size:12.5px; color:var(--muted); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; }

  @media(max-width:820px){ .mf-hero{grid-template-columns:1fr; text-align:center} .mf-chip,.mf-sub{margin-inline:auto} .mf-shot{max-width:380px;margin:0 auto} .mf-link{display:none} }
  `;
  return <style>{css}</style>;
}

const pop = { hidden: { opacity: 0, y: 22, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 120, damping: 16 } } };
function Reveal({ children, className }) {
  return <motion.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-50px' }} variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}>{children}</motion.div>;
}

function Hero({ c }) {
  return (
    <section className="mf-hero">
      <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }}>
        {c.eyebrow && <motion.div className="mf-chip" variants={pop}>🌿 {c.eyebrow}</motion.div>}
        <motion.h1 className="mf-h1" variants={pop} dangerouslySetInnerHTML={{ __html: (c.heading || '').replace(/\*(.+?)\*/g, '<em>$1</em>') }} />
        {c.subheading && <motion.p className="mf-sub" variants={pop}>{c.subheading}</motion.p>}
        {c.button_text && <motion.div variants={pop}><a className="mf-btn" href={c.button_link || '#shop'}>{c.button_text} →</a></motion.div>}
      </motion.div>
      {c.image_url && (
        <motion.div className="mf-shot" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 90, damping: 14, delay: 0.15 }}>
          <div className="f"><img src={c.image_url} alt="" /></div>
          <div className="badge"><b>Fresh</b><span>every day</span></div>
        </motion.div>
      )}
    </section>
  );
}

function Products({ c, site }) {
  const cart = useContext(CartCtx);
  const products = (site.products || []).slice(0, c.limit > 0 ? c.limit : undefined);
  if (!products.length) return null;
  return (
    <section className="mf-sec" id="shop">
      <div className="mf-kick">Shop</div>
      <h2 className="mf-h2">{c.heading || 'Fresh picks'}</h2>
      <Reveal className="mf-grid">
        {products.map((p) => (
          <motion.div className="mf-pcard" key={p.id} variants={pop}>
            <div className="mf-pimg">{p.imageUrl ? <img src={p.imageUrl} alt={p.name} /> : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 12 }}>No image</div>}</div>
            <div className="mf-pbody">
              <div className="mf-pname">{p.name}</div>
              <div className="mf-prow">
                {p.price != null && <span className="mf-pprice">{money(p.price)}</span>}
                {cart && <button className="mf-add" onClick={() => cart.add(p)} aria-label={`Add ${p.name}`}>+</button>}
              </div>
            </div>
          </motion.div>
        ))}
      </Reveal>
    </section>
  );
}

function CTA({ c }) {
  return (
    <section className="mf-cta"><div className="box"><Reveal>
      <motion.h2 variants={pop}>{c.heading || 'Hungry? Let’s get you sorted.'}</motion.h2>
      {c.button_text && <motion.div variants={pop}><a className="mf-btn" href={c.button_link || '#shop'}>{c.button_text} →</a></motion.div>}
    </Reveal></div></section>
  );
}

export default function MarketFresh({ data, activeSlug, setActiveSlug }) {
  const accent = data.theme?.accentColor || data.theme?.accent || meta.accent;
  useEffect(() => {
    if (document.getElementById('mf-fonts')) return;
    const l = document.createElement('link'); l.id = 'mf-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600&display=swap';
    document.head.appendChild(l);
  }, []);
  const page = data.pages.find((p) => p.slug === activeSlug) || data.pages.find((p) => p.is_home) || data.pages[0];
  const shop = data.pages.find((p) => p.slug === 'shop');

  return (
    <CartProvider slug={data.slug}>
      <Style accent={accent} />
      <div className="mf-root">
        {(data.tagline || '').trim() && <div className="mf-ann">{data.tagline}</div>}
        <MNav data={data} page={page} setActiveSlug={setActiveSlug} shop={shop} />
        <main>
          {(page?.blocks || []).map((b, i) => {
            const c = b.content || {};
            if (b.type === 'hero') return <Hero key={i} c={c} />;
            if (b.type === 'products') return <Products key={i} c={c} site={data} />;
            if (b.type === 'cta') return <CTA key={i} c={c} />;
            return <div key={i} className="mf-sec"><Reveal><motion.div variants={pop}><Block block={b} site={data} v={V} i={i} /></motion.div></Reveal></div>;
          })}
        </main>
        <footer className="mf-foot">
          <div className="mf-foot-in">
            <div style={{ maxWidth: 300 }}><div className="mf-word"><span className="dot" />{data.siteName || data.orgName}</div>{data.tagline && <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '12px 0 0', lineHeight: 1.6 }}>{data.tagline}</p>}</div>
            {(data.contactPhone || data.contactEmail || data.contactWhatsapp) && (
              <div style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--muted)' }}>
                <div className="lbl">Get in touch</div>
                {data.contactPhone && <div>{data.contactPhone}</div>}{data.contactWhatsapp && <div>WhatsApp · {data.contactWhatsapp}</div>}{data.contactEmail && <div>{data.contactEmail}</div>}
              </div>
            )}
          </div>
          <div className="cp"><span>© {new Date().getFullYear()} {data.siteName || data.orgName}</span><span>Built with Collarone</span></div>
        </footer>
        <CartDrawer site={data} v={V} />
      </div>
    </CartProvider>
  );
}

function MNav({ data, page, setActiveSlug, shop }) {
  const cart = useContext(CartCtx);
  return (
    <header className="mf-nav">
      <div className="mf-word"><span className="dot" />{data.siteName || data.orgName}</div>
      <nav className="mf-links">
        {data.pages.filter((p) => p.slug !== 'shop').map((p) => (
          <a key={p.slug} className={`mf-link ${page?.slug === p.slug ? 'on' : ''}`} href={`#${p.slug}`} onClick={(e) => { e.preventDefault(); setActiveSlug(p.slug); }}>{p.title}</a>
        ))}
        {shop && <a className={`mf-link ${page?.slug === 'shop' ? 'on' : ''}`} href="#shop" onClick={(e) => { e.preventDefault(); setActiveSlug('shop'); }}>Shop</a>}
        <button className="mf-cart" onClick={() => cart?.setOpen(true)}>Cart{cart?.count > 0 && <span className="n">{cart.count}</span>}</button>
      </nav>
    </header>
  );
}
