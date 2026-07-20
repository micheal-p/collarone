import { useContext, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CartProvider, CartCtx, CartDrawer, Block } from '../siteLayouts.jsx';
import { Reveal, useFonts, rise, emph } from './_kit.jsx';

// Storefront Classic — a clean, trustworthy mainstream shop. Bright, a tidy
// product grid with price/CTA, a trust-badge strip and a familiar retail feel.
// The versatile everyday option next to Atelier (editorial), Boutique (luxe)
// and Market (playful). Manrope. Reuses the real cart.
export const meta = { key: 'storefront-classic', name: 'Storefront Classic', category: 'ecommerce', description: 'A clean, trustworthy everyday shop — tidy product grid, trust badges and a familiar retail feel.', accent: '#2563EB', fonts: 'Manrope' };

const money = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;
const V = { hero: 'split', card: 'bordered', btnRadius: 10, display: 1, headingWeight: 800, h2Mode: 'left-kicker', band: 'alt', secPad: 56, ctaMode: 'accent', footerMode: 'columns' };

function Style({ accent }) {
  return <style>{`
  .sc-root{ --ac:${accent}; --bg:#ffffff; --ink:#0f172a; --muted:#5c6576; --line:#e8ecf2; --tint:#f5f8fd; --f:'Manrope',system-ui,sans-serif;
    --site-bg:var(--bg);--site-fg:var(--ink);--site-muted:var(--muted);--site-surface:var(--tint);--site-line:var(--line);--site-font:var(--f);--site-font-display:var(--f);--site-accent:var(--ac);--site-accent-ui:var(--ac);
    background:var(--bg); color:var(--ink); font-family:var(--f); overflow-x:hidden; }
  .sc-root a:focus-visible,.sc-root button:focus-visible{ outline:2px solid var(--ac); outline-offset:2px; border-radius:6px; }
  .sc-ann{ background:var(--ink); color:#fff; text-align:center; font-size:12.5px; font-weight:600; padding:9px 12px; }
  .sc-nav{ display:flex; align-items:center; gap:18px; padding:15px clamp(18px,4vw,48px); border-bottom:1px solid var(--line); position:sticky; top:0; background:rgba(255,255,255,.94); backdrop-filter:blur(10px); z-index:30; }
  .sc-word{ font-weight:800; font-size:21px; letter-spacing:-0.02em; }
  .sc-links{ display:flex; gap:22px; margin-left:auto; }
  .sc-link{ font-size:14.5px; font-weight:600; color:var(--ink); opacity:.72; text-decoration:none; } .sc-link:hover,.sc-link.on{ opacity:1; color:var(--ac); }
  .sc-cart{ display:inline-flex; align-items:center; gap:8px; background:var(--ac); color:#fff; border:none; cursor:pointer; font:inherit; font-weight:700; font-size:14px; padding:10px 18px; border-radius:10px; }
  .sc-cart .n{ background:rgba(255,255,255,.28); border-radius:8px; padding:0 6px; font-size:12px; }
  .sc-hero{ display:grid; grid-template-columns:1fr 1fr; gap:clamp(24px,4vw,52px); align-items:center; max-width:1200px; margin:0 auto; padding:clamp(36px,5vw,72px) clamp(18px,4vw,48px); }
  .sc-badge{ display:inline-flex; align-items:center; gap:8px; background:var(--tint); color:var(--ac); font-weight:700; font-size:13px; padding:7px 14px; border-radius:999px; margin-bottom:18px; }
  .sc-h1{ font-weight:800; font-size:clamp(34px,5vw,58px); line-height:1.05; letter-spacing:-0.03em; margin:0 0 16px; }
  .sc-h1 em{ font-style:normal; color:var(--ac); }
  .sc-sub{ font-size:clamp(16px,1.8vw,18px); line-height:1.6; color:var(--muted); max-width:46ch; margin:0 0 26px; }
  .sc-btn{ display:inline-block; background:var(--ac); color:#fff; border:none; cursor:pointer; font:inherit; font-weight:700; font-size:15.5px; padding:14px 28px; border-radius:10px; text-decoration:none; box-shadow:0 12px 26px -12px var(--ac); }
  .sc-shot{ aspect-ratio:4/3; border-radius:16px; overflow:hidden; background:var(--tint); border:1px solid var(--line); }
  .sc-shot img{ width:100%; height:100%; object-fit:cover; }
  .sc-trust{ border-block:1px solid var(--line); background:var(--tint); }
  .sc-trust-in{ max-width:1200px; margin:0 auto; display:flex; flex-wrap:wrap; gap:10px 40px; justify-content:center; padding:16px clamp(18px,4vw,48px); }
  .sc-trust span{ font-size:13.5px; font-weight:600; color:var(--muted); display:inline-flex; align-items:center; gap:8px; } .sc-trust b{ color:var(--ac); }
  .sc-sec{ max-width:1200px; margin:0 auto; padding:clamp(40px,5vw,68px) clamp(18px,4vw,48px); }
  .sc-kick{ font-weight:700; font-size:12.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--ac); margin-bottom:8px; }
  .sc-h2{ font-weight:800; font-size:clamp(24px,3.4vw,36px); letter-spacing:-0.02em; margin:0 0 28px; }
  .sc-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:18px; }
  .sc-card{ border:1px solid var(--line); border-radius:14px; overflow:hidden; background:#fff; transition:box-shadow .18s, border-color .18s; }
  .sc-card:hover{ box-shadow:0 16px 34px -18px rgba(15,23,42,.22); border-color:#d6deea; }
  .sc-pimg{ aspect-ratio:1; overflow:hidden; background:var(--tint); } .sc-pimg img{ width:100%; height:100%; object-fit:cover; transition:transform .4s; } .sc-card:hover .sc-pimg img{ transform:scale(1.05); }
  .sc-pbody{ padding:14px; }
  .sc-pname{ font-weight:700; font-size:14.5px; margin-bottom:6px; }
  .sc-prow{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .sc-pprice{ font-weight:800; font-size:15px; }
  .sc-add{ background:var(--tint); color:var(--ac); border:1px solid var(--line); cursor:pointer; font:inherit; font-weight:700; font-size:12.5px; padding:8px 12px; border-radius:8px; transition:background .15s,color .15s; }
  .sc-add:hover{ background:var(--ac); color:#fff; border-color:var(--ac); }
  .sc-cta{ padding:clamp(30px,5vw,56px) clamp(18px,4vw,48px); }
  .sc-cta-in{ max-width:1120px; margin:0 auto; background:var(--ink); color:#fff; border-radius:20px; text-align:center; padding:clamp(40px,6vw,72px); }
  .sc-cta-in h2{ font-weight:800; font-size:clamp(26px,4vw,44px); letter-spacing:-0.02em; margin:0 auto 22px; max-width:18ch; }
  .sc-foot{ background:var(--tint); border-top:1px solid var(--line); padding:44px clamp(18px,4vw,48px) 28px; }
  .sc-foot-in{ max-width:1200px; margin:0 auto; display:flex; flex-wrap:wrap; gap:28px; justify-content:space-between; }
  .sc-foot .lbl{ font-weight:700; font-size:12px; color:var(--ac); margin-bottom:8px; }
  .sc-foot .cp{ max-width:1200px; margin:26px auto 0; padding-top:18px; border-top:1px solid var(--line); font-size:12.5px; color:var(--muted); display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; }
  @media(max-width:820px){ .sc-hero{grid-template-columns:1fr} .sc-shot{max-width:460px} .sc-link{display:none} }
  `}</style>;
}

function Products({ c, site }) {
  const cart = useContext(CartCtx);
  const products = (site.products || []).slice(0, c.limit > 0 ? c.limit : undefined);
  if (!products.length) return null;
  return (
    <section className="sc-sec" id="shop">
      <div className="sc-kick">Shop</div><h2 className="sc-h2">{c.heading || 'Our products'}</h2>
      <Reveal className="sc-grid">
        {products.map((p) => (
          <motion.div className="sc-card" key={p.id} variants={rise}>
            <div className="sc-pimg">{p.imageUrl ? <img src={p.imageUrl} alt={p.name} /> : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 12 }}>No image</div>}</div>
            <div className="sc-pbody"><div className="sc-pname">{p.name}</div><div className="sc-prow">{p.price != null && <span className="sc-pprice">{money(p.price)}</span>}{cart && <button className="sc-add" onClick={() => cart.add(p)}>Add</button>}</div></div>
          </motion.div>
        ))}
      </Reveal>
    </section>
  );
}

export default function StorefrontClassic({ data, activeSlug, setActiveSlug }) {
  useFonts('sc-fonts', 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
  const accent = data.theme?.accentColor || data.theme?.accent || meta.accent;
  const page = data.pages.find((p) => p.slug === activeSlug) || data.pages.find((p) => p.is_home) || data.pages[0];
  const shop = data.pages.find((p) => p.slug === 'shop');
  return (
    <CartProvider slug={data.slug}>
      <div className="sc-root">
        <Style accent={accent} />
        {(data.tagline || '').trim() && <div className="sc-ann">{data.tagline}</div>}
        <SNav data={data} page={page} setActiveSlug={setActiveSlug} shop={shop} />
        <main>
          {(page?.blocks || []).map((b, i) => {
            const c = b.content || {};
            if (b.type === 'hero') return (
              <div key={i}>
                <motion.section className="sc-hero" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }}>
                  <div>
                    {c.eyebrow && <motion.div className="sc-badge" variants={rise}>★ {c.eyebrow}</motion.div>}
                    <motion.h1 className="sc-h1" variants={rise} dangerouslySetInnerHTML={emph(c.heading)} />
                    {c.subheading && <motion.p className="sc-sub" variants={rise}>{c.subheading}</motion.p>}
                    {c.button_text && <motion.div variants={rise}><a className="sc-btn" href={c.button_link || '#shop'}>{c.button_text}</a></motion.div>}
                  </div>
                  {c.image_url && <motion.div className="sc-shot" variants={rise}><img src={c.image_url} alt="" /></motion.div>}
                </motion.section>
                <div className="sc-trust"><div className="sc-trust-in"><span><b>✓</b> Secure checkout</span><span><b>✓</b> Nationwide delivery</span><span><b>✓</b> Pay on delivery</span><span><b>✓</b> Real Nigerian sellers</span></div></div>
              </div>
            );
            if (b.type === 'products') return <Products key={i} c={c} site={data} />;
            if (b.type === 'cta') return <section key={i} className="sc-cta"><div className="sc-cta-in"><Reveal><motion.h2 variants={rise}>{c.heading}</motion.h2>{c.button_text && <motion.div variants={rise}><a className="sc-btn" href={c.button_link || '#shop'} style={{ background: '#fff', color: 'var(--ac)', boxShadow: 'none' }}>{c.button_text}</a></motion.div>}</Reveal></div></section>;
            return <div key={i} className="sc-sec"><Reveal><motion.div variants={rise}><Block block={b} site={data} v={V} i={i} /></motion.div></Reveal></div>;
          })}
        </main>
        <footer className="sc-foot">
          <div className="sc-foot-in"><div style={{ maxWidth: 300 }}><div className="sc-word">{data.siteName || data.orgName}</div>{data.tagline && <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '10px 0 0', lineHeight: 1.6 }}>{data.tagline}</p>}</div>
            {(data.contactPhone || data.contactEmail || data.contactWhatsapp) && <div style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--muted)' }}><div className="lbl">Get in touch</div>{data.contactPhone && <div>{data.contactPhone}</div>}{data.contactWhatsapp && <div>WhatsApp · {data.contactWhatsapp}</div>}{data.contactEmail && <div>{data.contactEmail}</div>}</div>}</div>
          <div className="cp"><span>© {new Date().getFullYear()} {data.siteName || data.orgName}</span><span>Built with Collarone</span></div>
        </footer>
        <CartDrawer site={data} v={V} />
      </div>
    </CartProvider>
  );
}

function SNav({ data, page, setActiveSlug, shop }) {
  const cart = useContext(CartCtx);
  return (
    <header className="sc-nav">
      <span className="sc-word">{data.siteName || data.orgName}</span>
      <nav className="sc-links">
        {data.pages.filter((p) => p.slug !== 'shop').map((p) => <a key={p.slug} className={`sc-link ${page?.slug === p.slug ? 'on' : ''}`} href={`#${p.slug}`} onClick={(e) => { e.preventDefault(); setActiveSlug(p.slug); }}>{p.title}</a>)}
        {shop && <a className={`sc-link ${page?.slug === 'shop' ? 'on' : ''}`} href="#shop" onClick={(e) => { e.preventDefault(); setActiveSlug('shop'); }}>Shop</a>}
        <button className="sc-cart" onClick={() => cart?.setOpen(true)}>Cart{cart?.count > 0 && <span className="n">{cart.count}</span>}</button>
      </nav>
    </header>
  );
}
