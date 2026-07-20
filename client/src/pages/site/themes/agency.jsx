import { motion } from 'framer-motion';
import { CartProvider, Block } from '../siteLayouts.jsx';
import { Reveal, Magnetic, useFonts, rise, emph } from './_kit.jsx';

// Agency Modern — a bold dark creative studio. Near-black canvas, oversized
// Anton display, numbered index sections and a big kinetic footer. Avant-garde.
export const meta = { key: 'agency-modern', name: 'Agency Modern', category: 'company', description: 'A bold dark creative studio — oversized condensed display, numbered index sections and kinetic type.', accent: '#E8FF59', fonts: 'Anton + Inter' };

const V = { hero: 'editorial', card: 'minimal', btnRadius: 0, navCaps: true, display: 1.2, headingWeight: 800, h2Mode: 'index', band: 'none', secPad: 84, ctaMode: 'invert', footerMode: 'caps' };

function Style({ accent }) {
  return <style>{`
  .ag-root{ --ac:${accent}; --bg:#0a0a0a; --fg:#f4f3ef; --muted:#8f8d86; --line:rgba(244,243,239,.12); --f-d:'Anton',sans-serif; --f-b:'Inter',system-ui,sans-serif;
    --site-bg:var(--bg);--site-fg:var(--fg);--site-muted:var(--muted);--site-surface:#151513;--site-line:var(--line);--site-font:var(--f-b);--site-font-display:var(--f-d);--site-accent:var(--ac);--site-accent-ui:var(--ac);
    background:var(--bg); color:var(--fg); font-family:var(--f-b); overflow-x:hidden; }
  .ag-root a:focus-visible,.ag-root button:focus-visible{ outline:2px solid var(--ac); outline-offset:3px; }
  .ag-nav{ display:flex; align-items:center; gap:16px; padding:22px clamp(20px,5vw,56px); position:sticky; top:0; z-index:30; background:rgba(10,10,10,.72); backdrop-filter:blur(12px); }
  .ag-word{ font-family:var(--f-d); font-size:24px; letter-spacing:.02em; text-transform:uppercase; }
  .ag-links{ display:flex; gap:26px; margin-left:auto; }
  .ag-link{ font-size:11.5px; letter-spacing:.18em; text-transform:uppercase; color:var(--fg); opacity:.62; text-decoration:none; }
  .ag-link:hover,.ag-link.on{ opacity:1; }
  .ag-hero{ padding:clamp(40px,7vw,110px) clamp(20px,5vw,56px) clamp(30px,5vw,70px); max-width:1360px; margin:0 auto; }
  .ag-eye{ font-size:12px; letter-spacing:.28em; text-transform:uppercase; color:var(--ac); margin-bottom:26px; }
  .ag-h1{ font-family:var(--f-d); font-size:clamp(58px,13vw,180px); line-height:.86; letter-spacing:-0.01em; text-transform:uppercase; margin:0 0 30px; }
  .ag-h1 em{ font-style:normal; color:var(--ac); }
  .ag-hrow{ display:flex; justify-content:space-between; align-items:flex-end; gap:30px; flex-wrap:wrap; }
  .ag-sub{ font-size:17px; line-height:1.6; color:var(--muted); max-width:44ch; margin:0; }
  .ag-btn{ display:inline-flex; align-items:center; gap:12px; background:var(--ac); color:#0a0a0a; border:none; cursor:pointer; font:inherit; font-weight:700; font-size:13px; letter-spacing:.12em; text-transform:uppercase; padding:18px 32px; text-decoration:none; }
  .ag-himg{ margin:clamp(20px,4vw,44px) auto 0; max-width:1360px; padding:0 clamp(20px,5vw,56px); }
  .ag-himg .f{ aspect-ratio:21/9; overflow:hidden; }
  .ag-himg img{ width:100%; height:100%; object-fit:cover; }
  .ag-sec{ max-width:1360px; margin:0 auto; padding:clamp(52px,7vw,110px) clamp(20px,5vw,56px); }
  .ag-idx{ display:flex; align-items:baseline; gap:20px; border-top:1px solid var(--line); padding-top:26px; margin-bottom:40px; }
  .ag-idx .no{ font-family:var(--f-d); font-size:16px; color:var(--ac); }
  .ag-idx h2{ font-family:var(--f-d); font-size:clamp(30px,4.6vw,58px); text-transform:uppercase; letter-spacing:-0.005em; margin:0; }
  .ag-lead{ font-size:clamp(20px,2.4vw,28px); line-height:1.4; color:var(--fg); max-width:24ch; }
  .ag-svc{ border-top:1px solid var(--line); }
  .ag-svrow{ display:grid; grid-template-columns:60px 1fr 2fr; gap:24px; align-items:start; padding:28px 0; border-bottom:1px solid var(--line); transition:padding-left .3s; }
  .ag-svrow:hover{ padding-left:14px; }
  .ag-svrow .no{ font-family:var(--f-d); color:var(--ac); font-size:18px; }
  .ag-svrow h3{ font-family:var(--f-d); font-size:clamp(20px,2.4vw,30px); text-transform:uppercase; margin:0; }
  .ag-svrow p{ margin:0; font-size:15px; line-height:1.6; color:var(--muted); }
  .ag-team{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:20px; }
  .ag-tm .ph{ aspect-ratio:1; overflow:hidden; background:var(--surface); filter:grayscale(1); transition:filter .4s; }
  .ag-tm:hover .ph{ filter:grayscale(0); } .ag-tm .ph img{ width:100%; height:100%; object-fit:cover; }
  .ag-tm .nm{ font-family:var(--f-d); font-size:19px; text-transform:uppercase; margin-top:14px; } .ag-tm .rl{ font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--ac); margin-top:4px; }
  .ag-foot{ border-top:1px solid var(--line); padding:clamp(52px,8vw,120px) clamp(20px,5vw,56px) 40px; }
  .ag-foot .big{ font-family:var(--f-d); font-size:clamp(48px,12vw,150px); line-height:.9; text-transform:uppercase; letter-spacing:-0.01em; }
  .ag-foot .big em{ font-style:normal; color:var(--ac); }
  .ag-foot .row{ display:flex; justify-content:space-between; gap:20px; flex-wrap:wrap; margin-top:40px; font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); }
  @media(max-width:820px){ .ag-links{display:none} .ag-svrow{grid-template-columns:40px 1fr; } .ag-svrow p{grid-column:1/-1} }
  `}</style>;
}

export default function AgencyModern({ data, activeSlug, setActiveSlug }) {
  useFonts('ag-fonts', 'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600&display=swap');
  const accent = data.theme?.accentColor || data.theme?.accent || meta.accent;
  const page = data.pages.find((p) => p.slug === activeSlug) || data.pages.find((p) => p.is_home) || data.pages[0];
  let secNo = 0;
  return (
    <CartProvider slug={data.slug}>
      <div className="ag-root">
        <Style accent={accent} />
        <header className="ag-nav"><span className="ag-word">{data.siteName || data.orgName}</span>
          <nav className="ag-links">{data.pages.map((p) => <a key={p.slug} className={`ag-link ${page?.slug === p.slug ? 'on' : ''}`} href={`#${p.slug}`} onClick={(e) => { e.preventDefault(); setActiveSlug(p.slug); }}>{p.title}</a>)}</nav>
        </header>
        <main>
          {(page?.blocks || []).map((b, i) => {
            const c = b.content || {};
            if (b.type === 'hero') return (
              <div key={i}>
                <motion.section className="ag-hero" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}>
                  {c.eyebrow && <motion.div className="ag-eye" variants={rise}>{c.eyebrow}</motion.div>}
                  <motion.h1 className="ag-h1" variants={rise} dangerouslySetInnerHTML={emph(c.heading)} />
                  <div className="ag-hrow">
                    {c.subheading && <motion.p className="ag-sub" variants={rise}>{c.subheading}</motion.p>}
                    {c.button_text && <motion.div variants={rise}><Magnetic><a className="ag-btn" href={c.button_link || '#contact'}>{c.button_text} ↗</a></Magnetic></motion.div>}
                  </div>
                </motion.section>
                {c.image_url && <motion.div className="ag-himg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.9 }}><div className="f"><img src={c.image_url} alt="" /></div></motion.div>}
              </div>
            );
            if (b.type === 'text') { secNo++; return (
              <section key={i} className="ag-sec"><Reveal><motion.div className="ag-idx" variants={rise}><span className="no">{String(secNo).padStart(2, '0')} /</span><h2>{c.heading}</h2></motion.div><motion.p className="ag-lead" variants={rise} style={{ color: 'var(--muted)', maxWidth: '60ch', fontSize: 18 }}>{c.body}</motion.p></Reveal></section>
            ); }
            if (b.type === 'features') { secNo++; return (
              <section key={i} className="ag-sec"><Reveal><motion.div className="ag-idx" variants={rise}><span className="no">{String(secNo).padStart(2, '0')} /</span><h2>{c.heading}</h2></motion.div></Reveal>
                <Reveal className="ag-svc">{(c.items || []).map((f, j) => <motion.div className="ag-svrow" key={j} variants={rise}><span className="no">{String(j + 1).padStart(2, '0')}</span><h3>{f.title}</h3><p>{f.body}</p></motion.div>)}</Reveal></section>
            ); }
            if (b.type === 'team') { secNo++; return (
              <section key={i} className="ag-sec"><Reveal><motion.div className="ag-idx" variants={rise}><span className="no">{String(secNo).padStart(2, '0')} /</span><h2>{c.heading}</h2></motion.div></Reveal>
                <Reveal className="ag-team">{(c.items || []).map((m, j) => <motion.div className="ag-tm" key={j} variants={rise}><div className="ph">{m.photo_url && <img src={m.photo_url} alt="" />}</div><div className="nm">{m.name}</div><div className="rl">{m.role}</div></motion.div>)}</Reveal></section>
            ); }
            return <div key={i} className="ag-sec"><Reveal><motion.div variants={rise}><Block block={b} site={data} v={V} i={i} /></motion.div></Reveal></div>;
          })}
        </main>
        <footer className="ag-foot">
          <div className="big">Let’s <em>work</em>.</div>
          <div className="row"><span>{[data.contactEmail, data.contactPhone].filter(Boolean).join('  ·  ')}</span><span>© {new Date().getFullYear()} · Built with Collarone</span></div>
        </footer>
      </div>
    </CartProvider>
  );
}
