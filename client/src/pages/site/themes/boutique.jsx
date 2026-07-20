import { useContext, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { CartProvider, CartCtx, CartDrawer, Block } from '../siteLayouts.jsx';

// =============================================================================
// Boutique Noir — a dark luxury house. Near-black canvas, high-contrast
// Cormorant serif at scale, gold-thread hairlines, generous negative space and
// slow, restrained motion. Distinct from Atelier (light/editorial) and Market
// (bright/friendly). Reuses the real cart + checkout.
// =============================================================================

export const meta = {
  key: 'boutique-noir',
  name: 'Boutique Noir',
  category: 'ecommerce',
  description: 'A dark luxury boutique — high-contrast serif, gold hairlines, generous space and slow, restrained motion.',
  accent: '#C9A24B',
  fonts: 'Cormorant + Inter',
};

const money = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;
const V = { hero: 'editorial', card: 'minimal', btnRadius: 0, navCaps: true, display: 1.1, headingWeight: 500, h2Mode: 'center-rule', band: 'none', secPad: 88, ctaMode: 'surface', footerMode: 'serif' };

function Style({ accent }) {
  const css = `
  .bn-root{ --ac:${accent}; --site-accent:${accent}; --site-accent-ui:${accent};
    --bg:#0b0a09; --fg:#ece7dd; --muted:#8f887c; --line:rgba(236,231,221,.14); --surface:#141210;
    --f-disp:'Cormorant',Georgia,serif; --f-body:'Inter',system-ui,sans-serif;
    --site-bg:var(--bg); --site-fg:var(--fg); --site-muted:var(--muted); --site-surface:var(--surface); --site-line:var(--line);
    --site-font:var(--f-body); --site-font-display:var(--f-disp);
    background:var(--bg); color:var(--fg); font-family:var(--f-body); min-height:100vh; overflow-x:hidden; }
  .bn-root *::selection{ background:var(--ac); color:#0b0a09; }
  .bn-root a:focus-visible,.bn-root button:focus-visible{ outline:1px solid var(--ac); outline-offset:4px; }

  .bn-ann{ text-align:center; font-size:10.5px; letter-spacing:.32em; text-transform:uppercase; color:var(--muted); padding:12px; border-bottom:1px solid var(--line); }
  .bn-nav{ position:sticky; top:0; z-index:40; display:flex; align-items:center; gap:24px; padding:22px clamp(22px,5vw,60px);
    background:rgba(11,10,9,.72); backdrop-filter:blur(14px); border-bottom:1px solid var(--line); }
  .bn-word{ font-family:var(--f-disp); font-weight:600; font-size:26px; letter-spacing:.02em; }
  .bn-links{ display:flex; align-items:center; gap:34px; margin-left:auto; }
  .bn-link{ font-size:11.5px; letter-spacing:.2em; text-transform:uppercase; color:var(--fg); opacity:.66; text-decoration:none; transition:opacity .25s; }
  .bn-link:hover,.bn-link.on{ opacity:1; }
  .bn-cart{ display:inline-flex; align-items:center; gap:9px; background:transparent; border:1px solid var(--line); color:var(--fg); cursor:pointer;
    font:inherit; font-size:11px; letter-spacing:.18em; text-transform:uppercase; padding:11px 20px; transition:border-color .25s; }
  .bn-cart:hover{ border-color:var(--ac); } .bn-cart .n{ color:var(--ac); font-weight:700; }

  .bn-hero{ position:relative; min-height:88vh; display:flex; align-items:center; padding:clamp(30px,6vw,90px); overflow:hidden; }
  .bn-hero .bg{ position:absolute; inset:0; z-index:0; }
  .bn-hero .bg img{ width:100%; height:100%; object-fit:cover; opacity:.5; }
  .bn-hero::after{ content:''; position:absolute; inset:0; z-index:1; background:linear-gradient(90deg, rgba(11,10,9,.94) 0%, rgba(11,10,9,.5) 55%, rgba(11,10,9,.75) 100%); }
  .bn-hero .in{ position:relative; z-index:2; max-width:640px; }
  .bn-eye{ font-size:11px; letter-spacing:.34em; text-transform:uppercase; color:var(--ac); margin-bottom:26px; display:flex; align-items:center; gap:14px; }
  .bn-eye::before{ content:''; width:38px; height:1px; background:var(--ac); }
  .bn-h1{ font-family:var(--f-disp); font-weight:500; font-size:clamp(46px,8vw,96px); line-height:.98; letter-spacing:-0.01em; margin:0 0 26px; }
  .bn-h1 em{ font-style:italic; color:var(--ac); }
  .bn-sub{ font-size:16px; line-height:1.75; color:var(--muted); max-width:44ch; margin:0 0 36px; }
  .bn-btn{ display:inline-flex; align-items:center; gap:14px; background:transparent; color:var(--fg); border:1px solid var(--ac); cursor:pointer;
    font:inherit; font-size:12px; letter-spacing:.2em; text-transform:uppercase; padding:17px 34px; text-decoration:none; transition:background .3s, color .3s; }
  .bn-btn:hover{ background:var(--ac); color:#0b0a09; }

  .bn-sec{ max-width:1240px; margin:0 auto; padding:clamp(64px,8vw,120px) clamp(22px,5vw,60px); }
  .bn-h2wrap{ text-align:center; margin-bottom:56px; }
  .bn-kick{ font-size:11px; letter-spacing:.3em; text-transform:uppercase; color:var(--ac); margin-bottom:16px; }
  .bn-h2{ font-family:var(--f-disp); font-weight:500; font-size:clamp(30px,4.6vw,52px); letter-spacing:-0.01em; margin:0; }
  .bn-rule{ width:40px; height:1px; background:var(--ac); margin:20px auto 0; }

  .bn-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:clamp(22px,3vw,52px); }
  .bn-pcard{ }
  .bn-pimg{ position:relative; aspect-ratio:3/4; overflow:hidden; background:var(--surface); }
  .bn-pimg img{ width:100%; height:100%; object-fit:cover; transition:transform 1.1s cubic-bezier(.2,.7,.2,1); opacity:.94; }
  .bn-pcard:hover .bn-pimg img{ transform:scale(1.04); opacity:1; }
  .bn-padd{ position:absolute; inset:auto 0 0; opacity:0; transform:translateY(100%); transition:all .4s cubic-bezier(.2,.7,.2,1); }
  .bn-pcard:hover .bn-padd{ opacity:1; transform:none; }
  .bn-add{ width:100%; background:rgba(11,10,9,.86); backdrop-filter:blur(6px); color:var(--fg); border:none; border-top:1px solid var(--ac); cursor:pointer;
    font:inherit; font-size:11px; letter-spacing:.2em; text-transform:uppercase; padding:16px; transition:background .3s,color .3s; }
  .bn-add:hover{ background:var(--ac); color:#0b0a09; }
  .bn-pmeta{ text-align:center; margin-top:20px; }
  .bn-pname{ font-family:var(--f-disp); font-size:20px; font-weight:500; }
  .bn-pprice{ font-size:12px; letter-spacing:.14em; color:var(--muted); margin-top:5px; }

  .bn-cta{ text-align:center; padding:clamp(80px,10vw,150px) clamp(22px,5vw,60px); border-top:1px solid var(--line); }
  .bn-cta h2{ font-family:var(--f-disp); font-weight:500; font-size:clamp(34px,6vw,72px); letter-spacing:-0.01em; margin:0 auto 34px; max-width:18ch; }
  .bn-cta h2 em{ font-style:italic; color:var(--ac); }

  .bn-foot{ border-top:1px solid var(--line); padding:64px clamp(22px,5vw,60px) 34px; text-align:center; }
  .bn-foot .w{ font-family:var(--f-disp); font-size:26px; font-weight:500; letter-spacing:.04em; margin-bottom:16px; }
  .bn-foot .c{ font-size:12px; letter-spacing:.14em; color:var(--muted); }
  .bn-foot .cp{ margin-top:22px; font-size:10.5px; letter-spacing:.24em; text-transform:uppercase; color:var(--muted); }

  @media(max-width:820px){ .bn-links{gap:14px} .bn-link{display:none} .bn-hero::after{background:linear-gradient(180deg,rgba(11,10,9,.6),rgba(11,10,9,.92))} }
  `;
  return <style>{css}</style>;
}

const rise = { hidden: { opacity: 0, y: 26 }, show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.2, 0.7, 0.2, 1] } } };
function Reveal({ children, className }) {
  return <motion.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-70px' }} variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}>{children}</motion.div>;
}

function Hero({ c }) {
  const ref = useRef(null); const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 90]);
  return (
    <section className="bn-hero" ref={ref}>
      {c.image_url && <motion.div className="bg" style={{ y }}><img src={c.image_url} alt="" /></motion.div>}
      <motion.div className="in" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.13, delayChildren: 0.1 } } }}>
        {c.eyebrow && <motion.div className="bn-eye" variants={rise}>{c.eyebrow}</motion.div>}
        <motion.h1 className="bn-h1" variants={rise} dangerouslySetInnerHTML={{ __html: (c.heading || '').replace(/\*(.+?)\*/g, '<em>$1</em>') }} />
        {c.subheading && <motion.p className="bn-sub" variants={rise}>{c.subheading}</motion.p>}
        {c.button_text && <motion.div variants={rise}><a className="bn-btn" href={c.button_link || '#shop'}>{c.button_text}</a></motion.div>}
      </motion.div>
    </section>
  );
}

function Products({ c, site }) {
  const cart = useContext(CartCtx);
  const products = (site.products || []).slice(0, c.limit > 0 ? c.limit : undefined);
  if (!products.length) return null;
  return (
    <section className="bn-sec" id="shop">
      <div className="bn-h2wrap"><div className="bn-kick">The collection</div><h2 className="bn-h2">{c.heading || 'Shop the house'}</h2><div className="bn-rule" /></div>
      <Reveal className="bn-grid">
        {products.map((p) => (
          <motion.div className="bn-pcard" key={p.id} variants={rise}>
            <div className="bn-pimg">
              {p.imageUrl ? <img src={p.imageUrl} alt={p.name} /> : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 12 }}>—</div>}
              {cart && <div className="bn-padd"><button className="bn-add" onClick={() => cart.add(p)}>Add to bag</button></div>}
            </div>
            <div className="bn-pmeta"><div className="bn-pname">{p.name}</div>{p.price != null && <div className="bn-pprice">{money(p.price)}</div>}</div>
          </motion.div>
        ))}
      </Reveal>
    </section>
  );
}

function CTA({ c }) {
  return (
    <section className="bn-cta"><Reveal>
      <motion.h2 variants={rise} dangerouslySetInnerHTML={{ __html: (c.heading || 'The pieces that stay.').replace(/\*(.+?)\*/g, '<em>$1</em>') }} />
      {c.button_text && <motion.div variants={rise}><a className="bn-btn" href={c.button_link || '#shop'}>{c.button_text}</a></motion.div>}
    </Reveal></section>
  );
}

export default function BoutiqueNoir({ data, activeSlug, setActiveSlug }) {
  const accent = data.theme?.accentColor || data.theme?.accent || meta.accent;
  useEffect(() => {
    if (document.getElementById('bn-fonts')) return;
    const l = document.createElement('link'); l.id = 'bn-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500&display=swap';
    document.head.appendChild(l);
  }, []);
  const page = data.pages.find((p) => p.slug === activeSlug) || data.pages.find((p) => p.is_home) || data.pages[0];
  const shop = data.pages.find((p) => p.slug === 'shop');

  return (
    <CartProvider slug={data.slug}>
      <Style accent={accent} />
      <div className="bn-root">
        {(data.tagline || '').trim() && <div className="bn-ann">{data.tagline}</div>}
        <BNav data={data} page={page} setActiveSlug={setActiveSlug} shop={shop} />
        <main>
          {(page?.blocks || []).map((b, i) => {
            const c = b.content || {};
            if (b.type === 'hero') return <Hero key={i} c={c} />;
            if (b.type === 'products') return <Products key={i} c={c} site={data} />;
            if (b.type === 'cta') return <CTA key={i} c={c} />;
            return <div key={i} className="bn-sec" style={{ paddingBlock: 'clamp(48px,7vw,90px)' }}><Reveal><motion.div variants={rise}><Block block={b} site={data} v={V} i={i} /></motion.div></Reveal></div>;
          })}
        </main>
        <footer className="bn-foot">
          <div className="w">{data.siteName || data.orgName}</div>
          <div className="c">{[data.contactPhone, data.contactEmail].filter(Boolean).join('   ·   ')}</div>
          <div className="cp">© {new Date().getFullYear()} · Built with Collarone</div>
        </footer>
        <CartDrawer site={data} v={V} />
      </div>
    </CartProvider>
  );
}

function BNav({ data, page, setActiveSlug, shop }) {
  const cart = useContext(CartCtx);
  return (
    <header className="bn-nav">
      <div className="bn-word">{data.siteName || data.orgName}</div>
      <nav className="bn-links">
        {data.pages.filter((p) => p.slug !== 'shop').map((p) => (
          <a key={p.slug} className={`bn-link ${page?.slug === p.slug ? 'on' : ''}`} href={`#${p.slug}`} onClick={(e) => { e.preventDefault(); setActiveSlug(p.slug); }}>{p.title}</a>
        ))}
        {shop && <a className={`bn-link ${page?.slug === 'shop' ? 'on' : ''}`} href="#shop" onClick={(e) => { e.preventDefault(); setActiveSlug('shop'); }}>Shop</a>}
        <button className="bn-cart" onClick={() => cart?.setOpen(true)}>Bag{cart?.count > 0 && <span className="n"> ({cart.count})</span>}</button>
      </nav>
    </header>
  );
}
