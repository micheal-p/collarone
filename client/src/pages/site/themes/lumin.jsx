import { useContext, useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { CartProvider, CartCtx, CartDrawer, Block } from '../siteLayouts.jsx';

// =============================================================================
// Atelier ("lumin-store") — a high-contrast editorial storefront. Not the
// shared 3-layout skeleton: its own scroll-aware nav, an asymmetric parallax
// hero, an infinite marquee, a gallery product grid with hover-reveal add-to-
// cart, a deep-ink story band, and magnetic CTAs. Motion via Framer Motion,
// reduced-motion respected. Reuses the real cart + Paystack/transfer/COD.
// =============================================================================

export const meta = {
  key: 'lumin-store',
  name: 'Atelier',
  category: 'ecommerce',
  description: 'A high-contrast editorial storefront — oversized display type, parallax hero, gallery grid and motion throughout.',
  accent: '#4F46E5',
  fonts: 'Syne + Inter',
};

const money = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;
const V = { hero: 'full', card: 'rounded', btnRadius: 999, navCaps: false, display: 1, headingWeight: 700, h2Mode: 'left-kicker', band: 'none', secPad: 72, ctaMode: 'accent', footerMode: 'columns' };

function AtelierStyle({ accent }) {
  const css = `
  .at-root{ --ac:${accent}; --site-accent:${accent}; --site-accent-ui:${accent};
    --bg:#f2f1ed; --ink:#131210; --paper:#faf9f6; --muted:#6f6b63; --line:#e2ded4;
    --f-disp:'Syne',sans-serif; --f-body:'Inter',system-ui,sans-serif;
    --site-bg:var(--bg); --site-fg:var(--ink); --site-muted:var(--muted); --site-surface:#eceae3; --site-line:var(--line);
    --site-font:var(--f-body); --site-font-display:var(--f-disp);
    background:var(--bg); color:var(--ink); font-family:var(--f-body); min-height:100vh; overflow-x:hidden; }
  .at-root *::selection{ background:var(--ac); color:#fff; }
  .at-root a:focus-visible, .at-root button:focus-visible{ outline:2px solid var(--ac); outline-offset:3px; border-radius:4px; }

  .at-ann{ background:var(--ink); color:var(--bg); text-align:center; font-size:11.5px; font-weight:600; letter-spacing:.24em; text-transform:uppercase; padding:9px 12px; }
  .at-nav{ position:sticky; top:0; z-index:40; display:flex; align-items:center; gap:24px; padding:18px clamp(20px,5vw,56px);
    transition:background .3s ease, box-shadow .3s ease, padding .3s ease; }
  .at-nav.solid{ background:rgba(242,241,237,0.86); backdrop-filter:saturate(1.5) blur(14px); box-shadow:0 1px 0 var(--line); padding-block:13px; }
  .at-word{ font-family:var(--f-disp); font-weight:800; font-size:22px; letter-spacing:-0.03em; display:flex; align-items:center; gap:11px; }
  .at-links{ display:flex; align-items:center; gap:30px; margin-left:auto; }
  .at-link{ font-size:13.5px; font-weight:500; letter-spacing:.02em; color:var(--ink); text-decoration:none; opacity:.72; transition:opacity .2s; }
  .at-link:hover,.at-link.on{ opacity:1; }
  .at-cartbtn{ position:relative; display:inline-flex; align-items:center; gap:8px; background:var(--ink); color:var(--bg); border:none; cursor:pointer;
    font:inherit; font-weight:600; font-size:13px; padding:11px 20px; border-radius:999px; transition:transform .2s ease; }
  .at-cartbtn:hover{ transform:translateY(-2px); }
  .at-cartbtn .n{ background:var(--ac); color:#fff; border-radius:999px; min-width:19px; height:19px; display:inline-grid; place-items:center; font-size:11px; font-weight:800; padding:0 5px; }

  .at-hero{ display:grid; grid-template-columns:1.02fr 0.98fr; gap:clamp(28px,5vw,64px); align-items:center;
    padding:clamp(30px,5vw,64px) clamp(20px,5vw,56px) clamp(48px,7vw,96px); max-width:1320px; margin:0 auto; }
  .at-eyebrow{ display:inline-flex; align-items:center; gap:10px; font-size:12px; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:var(--ac); margin-bottom:22px; }
  .at-eyebrow::before{ content:''; width:26px; height:1.5px; background:var(--ac); display:inline-block; }
  .at-h1{ font-family:var(--f-disp); font-weight:800; font-size:clamp(46px,7.5vw,104px); line-height:0.94; letter-spacing:-0.035em; margin:0 0 26px; text-wrap:balance; }
  .at-h1 em{ font-style:italic; font-weight:700; }
  .at-sub{ font-size:clamp(15.5px,1.6vw,18px); line-height:1.62; color:var(--muted); max-width:44ch; margin:0 0 34px; }
  .at-shot{ position:relative; }
  .at-shot .frame{ position:relative; aspect-ratio:4/5; border-radius:8px; overflow:hidden; background:var(--site-surface); box-shadow:0 40px 80px -30px rgba(19,18,16,0.5); }
  .at-shot .frame img{ width:100%; height:100%; object-fit:cover; display:block; }
  .at-shot .tag{ position:absolute; left:-18px; bottom:34px; background:var(--paper); border:1px solid var(--line); border-radius:999px; padding:11px 20px; font-size:12.5px; font-weight:700; letter-spacing:.04em; box-shadow:0 14px 30px -12px rgba(19,18,16,.3); }

  .at-btn{ display:inline-flex; align-items:center; gap:10px; background:var(--ink); color:var(--bg); border:none; cursor:pointer;
    font:inherit; font-weight:650; font-size:15px; padding:16px 30px; border-radius:999px; text-decoration:none; transition:transform .15s ease; will-change:transform; }
  .at-btn .arw{ transition:transform .2s ease; }
  .at-btn:hover .arw{ transform:translateX(4px); }
  .at-btn.accent{ background:var(--ac); color:#fff; }

  .at-marq{ background:var(--ink); color:var(--bg); overflow:hidden; padding:16px 0; border-block:1px solid var(--ink); }
  .at-marq .track{ display:flex; gap:44px; width:max-content; white-space:nowrap; animation:at-scroll 30s linear infinite; }
  .at-marq span{ display:inline-flex; align-items:center; gap:44px; font-family:var(--f-disp); font-weight:700; font-size:19px; letter-spacing:-0.01em; text-transform:uppercase; }
  .at-marq span i{ color:var(--ac); font-style:normal; }
  @keyframes at-scroll{ from{transform:translateX(0)} to{transform:translateX(-50%)} }

  .at-sec{ max-width:1320px; margin:0 auto; padding:clamp(56px,7vw,104px) clamp(20px,5vw,56px); }
  .at-kick{ font-size:12px; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:var(--ac); margin-bottom:14px; }
  .at-h2{ font-family:var(--f-disp); font-weight:800; font-size:clamp(30px,4.4vw,54px); letter-spacing:-0.03em; line-height:1; margin:0; }
  .at-sechead{ display:flex; align-items:flex-end; justify-content:space-between; gap:20px; flex-wrap:wrap; margin-bottom:44px; }

  .at-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:clamp(16px,2vw,28px); }
  .at-pcard{ position:relative; cursor:default; }
  .at-pimg{ position:relative; aspect-ratio:4/5; overflow:hidden; background:var(--site-surface); border-radius:6px; }
  .at-pimg img{ width:100%; height:100%; object-fit:cover; display:block; transition:transform .7s cubic-bezier(.2,.7,.2,1); }
  .at-pcard:hover .at-pimg img{ transform:scale(1.05); }
  .at-padd{ position:absolute; inset:auto 12px 12px; opacity:0; transform:translateY(10px); transition:all .28s cubic-bezier(.2,.7,.2,1); }
  .at-pcard:hover .at-padd{ opacity:1; transform:none; }
  .at-add{ width:100%; background:var(--paper); color:var(--ink); border:none; cursor:pointer; font:inherit; font-weight:650; font-size:13.5px; padding:13px; border-radius:999px; box-shadow:0 10px 24px -8px rgba(19,18,16,.4); transition:background .2s,color .2s; }
  .at-add:hover{ background:var(--ac); color:#fff; }
  .at-pmeta{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-top:14px; }
  .at-pname{ font-weight:600; font-size:15px; letter-spacing:-0.01em; }
  .at-pprice{ font-weight:600; font-size:14px; font-variant-numeric:tabular-nums; color:var(--muted); }

  .at-ink{ background:var(--ink); color:var(--bg); }
  .at-ink .at-kick{ color:var(--ac); }
  .at-story{ max-width:1320px; margin:0 auto; padding:clamp(72px,9vw,140px) clamp(20px,5vw,56px); display:grid; grid-template-columns:1fr 1fr; gap:clamp(32px,5vw,80px); align-items:center; }
  .at-story h2{ font-family:var(--f-disp); font-weight:800; font-size:clamp(32px,4.6vw,60px); line-height:1.02; letter-spacing:-0.03em; margin:0; }
  .at-story .feat{ display:flex; gap:18px; padding:22px 0; border-top:1px solid rgba(255,255,255,.14); }
  .at-story .feat .no{ font-family:var(--f-disp); font-weight:800; font-size:16px; color:var(--ac); }
  .at-story .feat h3{ margin:0 0 6px; font-size:17px; font-weight:650; }
  .at-story .feat p{ margin:0; font-size:14px; line-height:1.6; color:rgba(255,255,255,.62); }

  .at-cta{ text-align:center; padding:clamp(72px,9vw,130px) clamp(20px,5vw,56px); }
  .at-cta h2{ font-family:var(--f-disp); font-weight:800; font-size:clamp(34px,6vw,80px); letter-spacing:-0.035em; line-height:.98; margin:0 auto 30px; max-width:16ch; text-wrap:balance; }

  .at-foot{ background:var(--ink); color:var(--bg); padding:clamp(52px,7vw,88px) clamp(20px,5vw,56px) 34px; }
  .at-foot-in{ max-width:1320px; margin:0 auto; display:flex; flex-wrap:wrap; gap:40px; justify-content:space-between; }
  .at-foot .lbl{ font-size:11.5px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:var(--ac); margin-bottom:12px; }
  .at-foot .big{ font-family:var(--f-disp); font-weight:800; font-size:clamp(30px,4vw,46px); letter-spacing:-0.03em; max-width:14ch; line-height:1; }
  .at-foot-copy{ max-width:1320px; margin:44px auto 0; padding-top:22px; border-top:1px solid rgba(255,255,255,.14); display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px; font-size:12px; color:rgba(255,255,255,.5); }

  @media (max-width:860px){
    .at-hero{ grid-template-columns:1fr; text-align:center; padding-top:20px; }
    .at-eyebrow,.at-hero .at-btn{ margin-inline:auto; } .at-sub{ margin-inline:auto; }
    .at-shot{ order:-1; max-width:400px; margin:0 auto; }
    .at-story{ grid-template-columns:1fr; }
    .at-links{ gap:16px; } .at-link{ display:none; }
  }
  @media (prefers-reduced-motion: reduce){ .at-marq .track{ animation:none; } }
  `;
  return <style>{css}</style>;
}

/* magnetic wrapper — element drifts toward the cursor */
function Magnetic({ children, strength = 0.35 }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const onMove = (e) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px, ${(e.clientY - r.top - r.height / 2) * strength}px)`;
  };
  const reset = () => { if (ref.current) ref.current.style.transform = ''; };
  return <span ref={ref} onMouseMove={onMove} onMouseLeave={reset} style={{ display: 'inline-block', transition: 'transform .3s cubic-bezier(.2,.7,.2,1)' }}>{children}</span>;
}

const rise = { hidden: { opacity: 0, y: 34 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } } };
function Reveal({ children, delay = 0, className, id }) {
  return (
    <motion.div id={id} className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: delay } } }}>
      {children}
    </motion.div>
  );
}

function Nav({ data, page, setActiveSlug }) {
  const [solid, setSolid] = useState(false);
  const cart = useContext(CartCtx);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const shop = data.pages.find((p) => p.slug === 'shop');
  return (
    <header className={`at-nav ${solid ? 'solid' : ''}`}>
      <div className="at-word">
        {data.logoUrl && <img src={data.logoUrl} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover' }} />}
        {data.siteName || data.orgName}
      </div>
      <nav className="at-links">
        {data.pages.filter((p) => p.slug !== 'shop').map((p) => (
          <a key={p.slug} className={`at-link ${page?.slug === p.slug ? 'on' : ''}`} href={`#${p.slug}`} onClick={(e) => { e.preventDefault(); setActiveSlug(p.slug); }}>{p.title}</a>
        ))}
        {shop && <a className={`at-link ${page?.slug === 'shop' ? 'on' : ''}`} href="#shop" onClick={(e) => { e.preventDefault(); setActiveSlug('shop'); }}>Shop</a>}
        <Magnetic strength={0.2}>
          <button className="at-cartbtn" onClick={() => cart?.setOpen(true)} aria-label="Open cart">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3.5h3l2.6 12h10.4l2-8.5H6.2" /></svg>
            Bag{cart?.count > 0 && <span className="n">{cart.count}</span>}
          </button>
        </Magnetic>
      </nav>
    </header>
  );
}

function Hero({ c }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -70]);
  return (
    <section className="at-hero" ref={ref}>
      <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } } }}>
        {c.eyebrow && <motion.div className="at-eyebrow" variants={rise}>{c.eyebrow}</motion.div>}
        <motion.h1 className="at-h1" variants={rise} dangerouslySetInnerHTML={{ __html: (c.heading || '').replace(/\*(.+?)\*/g, '<em>$1</em>') }} />
        {c.subheading && <motion.p className="at-sub" variants={rise}>{c.subheading}</motion.p>}
        {c.button_text && <motion.div variants={rise}><Magnetic><a className="at-btn accent" href={c.button_link || '#shop'}>{c.button_text}<span className="arw">→</span></a></Magnetic></motion.div>}
      </motion.div>
      {c.image_url && (
        <div className="at-shot">
          <motion.div className="frame" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1], delay: 0.15 }}>
            <motion.img src={c.image_url} alt="" style={{ y, scale: 1.12 }} />
          </motion.div>
          <motion.div className="tag" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>Handmade in Nigeria</motion.div>
        </div>
      )}
    </section>
  );
}

function Marquee({ site }) {
  const items = ['New Season', 'Free Delivery', 'Pay on Delivery', 'Made to Last', 'Secure Checkout'];
  const row = [...items, ...items];
  return (
    <div className="at-marq"><div className="track">{row.map((t, i) => <span key={i}>{t}<i>✳</i></span>)}</div></div>
  );
}

function Products({ c, site }) {
  const cart = useContext(CartCtx);
  const products = (site.products || []).slice(0, c.limit > 0 ? c.limit : undefined);
  if (!products.length) return null;
  return (
    <section className="at-sec" id="shop">
      <div className="at-sechead">
        <div>
          <div className="at-kick">The collection</div>
          <h2 className="at-h2">{c.heading || 'Shop everything'}</h2>
        </div>
      </div>
      <Reveal className="at-grid">
        {products.map((p) => (
          <motion.div className="at-pcard" key={p.id} variants={rise}>
            <div className="at-pimg">
              {p.imageUrl ? <img src={p.imageUrl} alt={p.name} /> : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 12 }}>No image</div>}
              {cart && <div className="at-padd"><button className="at-add" onClick={() => cart.add(p)}>Add to bag</button></div>}
            </div>
            <div className="at-pmeta"><span className="at-pname">{p.name}</span>{p.price != null && <span className="at-pprice">{money(p.price)}</span>}</div>
          </motion.div>
        ))}
      </Reveal>
    </section>
  );
}

function Story({ c }) {
  const feats = Array.isArray(c.items) ? c.items : [];
  return (
    <div className="at-ink">
      <div className="at-story">
        <Reveal>
          <motion.div className="at-kick" variants={rise}>Why us</motion.div>
          <motion.h2 variants={rise}>{c.heading || 'Made with intention, built to last.'}</motion.h2>
        </Reveal>
        <Reveal delay={0.1}>
          {feats.map((f, i) => (
            <motion.div className="feat" key={i} variants={rise}>
              <span className="no">{String(i + 1).padStart(2, '0')}</span>
              <div><h3>{f.title}</h3><p>{f.body}</p></div>
            </motion.div>
          ))}
        </Reveal>
      </div>
    </div>
  );
}

function CTA({ c }) {
  return (
    <section className="at-cta">
      <Reveal>
        <motion.h2 variants={rise}>{c.heading || 'Ready when you are.'}</motion.h2>
        {c.button_text && <motion.div variants={rise}><Magnetic><a className="at-btn accent" href={c.button_link || '#shop'}>{c.button_text}<span className="arw">→</span></a></Magnetic></motion.div>}
      </Reveal>
    </section>
  );
}

export default function AtelierStore({ data, activeSlug, setActiveSlug }) {
  const accent = data.theme?.accentColor || data.theme?.accent || meta.accent;
  useEffect(() => {
    if (document.getElementById('at-fonts')) return;
    const l = document.createElement('link'); l.id = 'at-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }, []);

  const page = data.pages.find((p) => p.slug === activeSlug) || data.pages.find((p) => p.is_home) || data.pages[0];
  const blocks = page?.blocks || [];

  return (
    <CartProvider slug={data.slug}>
      <AtelierStyle accent={accent} />
      <div className="at-root">
        {(data.tagline || '').trim() && <div className="at-ann">{data.tagline}</div>}
        <Nav data={data} page={page} setActiveSlug={setActiveSlug} />
        <main>
          {blocks.map((b, i) => {
            const c = b.content || {};
            if (b.type === 'hero') return <div key={i}><Hero c={c} /><Marquee site={data} /></div>;
            if (b.type === 'products') return <Products key={i} c={c} site={data} />;
            if (b.type === 'features') return <Story key={i} c={c} />;
            if (b.type === 'cta') return <CTA key={i} c={c} />;
            // remaining content/interactive blocks (text, testimonials, faq,
            // contact_form, subscribe, image, team) reuse the tested renderer
            // inside Atelier's section rhythm + palette.
            return <div key={i} className="at-sec" style={{ paddingBlock: 'clamp(44px,6vw,84px)' }}><Reveal><motion.div variants={rise}><Block block={b} site={data} v={V} i={i} /></motion.div></Reveal></div>;
          })}
        </main>
        <footer className="at-foot">
          <div className="at-foot-in">
            <div style={{ maxWidth: 380 }}>
              <div className="big">{data.siteName || data.orgName}</div>
              {data.tagline && <p style={{ fontSize: 14, color: 'rgba(255,255,255,.62)', lineHeight: 1.6, margin: '16px 0 0', maxWidth: 320 }}>{data.tagline}</p>}
            </div>
            {(data.contactPhone || data.contactEmail || data.contactWhatsapp) && (
              <div style={{ fontSize: 14, lineHeight: 2, color: 'rgba(255,255,255,.8)' }}>
                <div className="lbl">Get in touch</div>
                {data.contactPhone && <div>{data.contactPhone}</div>}
                {data.contactWhatsapp && <div>WhatsApp · {data.contactWhatsapp}</div>}
                {data.contactEmail && <div>{data.contactEmail}</div>}
              </div>
            )}
          </div>
          <div className="at-foot-copy"><span>© {new Date().getFullYear()} {data.siteName || data.orgName}</span><span>Built with Collarone</span></div>
        </footer>
        <CartDrawer site={data} v={V} />
      </div>
    </CartProvider>
  );
}
