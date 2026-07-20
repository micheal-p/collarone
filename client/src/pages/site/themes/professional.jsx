import { motion } from 'framer-motion';
import { CartProvider, Block } from '../siteLayouts.jsx';
import { Reveal, useFonts, rise, emph } from './_kit.jsx';

// Professional Services — a refined advisory firm. Warm paper, an elegant
// Newsreader serif, hairline rules, calm restrained motion. Trust over noise.
export const meta = { key: 'professional-services', name: 'Professional Services', category: 'company', description: 'A refined advisory firm — warm paper, an elegant serif, hairline rules and calm restraint.', accent: '#7A5C2E', fonts: 'Newsreader + Inter' };

const V = { hero: 'minimal', card: 'bordered', btnRadius: 6, display: 0.95, headingWeight: 500, h2Mode: 'center-rule', band: 'alt', secPad: 64, ctaMode: 'surface', footerMode: 'serif' };

function Style({ accent }) {
  return <style>{`
  .pr-root{ --ac:${accent}; --bg:#f8f5ef; --ink:#2a2620; --muted:#726b5f; --line:#e5ddcf; --paper:#fefdfb; --f-d:'Newsreader',Georgia,serif; --f-b:'Inter',system-ui,sans-serif;
    --site-bg:var(--bg);--site-fg:var(--ink);--site-muted:var(--muted);--site-surface:var(--paper);--site-line:var(--line);--site-font:var(--f-b);--site-font-display:var(--f-d);--site-accent:var(--ac);--site-accent-ui:var(--ac);
    background:var(--bg); color:var(--ink); font-family:var(--f-b); overflow-x:hidden; }
  .pr-root a:focus-visible,.pr-root button:focus-visible{ outline:1px solid var(--ac); outline-offset:3px; }
  .pr-nav{ display:flex; align-items:center; gap:18px; padding:26px clamp(22px,5vw,60px); border-bottom:1px solid var(--line); }
  .pr-word{ font-family:var(--f-d); font-weight:500; font-size:23px; letter-spacing:.01em; }
  .pr-links{ display:flex; gap:28px; margin-left:auto; }
  .pr-link{ font-size:14px; color:var(--ink); opacity:.72; text-decoration:none; }
  .pr-link:hover,.pr-link.on{ opacity:1; color:var(--ac); }
  .pr-hero{ max-width:920px; margin:0 auto; text-align:center; padding:clamp(56px,9vw,130px) clamp(22px,5vw,60px) clamp(40px,6vw,80px); }
  .pr-eye{ font-size:12px; letter-spacing:.24em; text-transform:uppercase; color:var(--ac); margin-bottom:26px; }
  .pr-h1{ font-family:var(--f-d); font-weight:400; font-size:clamp(38px,6vw,72px); line-height:1.06; letter-spacing:-0.01em; margin:0 0 24px; }
  .pr-h1 em{ font-style:italic; color:var(--ac); }
  .pr-sub{ font-size:18.5px; line-height:1.7; color:var(--muted); max-width:52ch; margin:0 auto 32px; }
  .pr-btn{ display:inline-block; background:var(--ink); color:var(--bg); border:none; cursor:pointer; font:inherit; font-weight:500; font-size:15px; padding:14px 30px; border-radius:6px; text-decoration:none; }
  .pr-himg{ max-width:1120px; margin:0 auto; padding:0 clamp(22px,5vw,60px) clamp(30px,5vw,60px); }
  .pr-himg .f{ aspect-ratio:2/1; border-radius:6px; overflow:hidden; background:var(--paper); }
  .pr-himg img{ width:100%; height:100%; object-fit:cover; }
  .pr-sec{ max-width:900px; margin:0 auto; padding:clamp(52px,7vw,96px) clamp(22px,5vw,60px); text-align:center; }
  .pr-rule{ width:34px; height:1px; background:var(--ac); margin:0 auto 20px; }
  .pr-h2{ font-family:var(--f-d); font-weight:400; font-size:clamp(28px,4vw,44px); letter-spacing:-0.01em; margin:0 0 20px; }
  .pr-lead{ font-size:17.5px; line-height:1.75; color:var(--muted); max-width:60ch; margin:0 auto; }
  .pr-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:8px; overflow:hidden; margin-top:44px; text-align:left; }
  .pr-card{ background:var(--paper); padding:32px; }
  .pr-card .n{ font-family:var(--f-d); font-size:20px; color:var(--ac); margin-bottom:12px; }
  .pr-card h3{ font-family:var(--f-d); font-weight:500; font-size:21px; margin:0 0 8px; }
  .pr-card p{ margin:0; font-size:14.5px; line-height:1.62; color:var(--muted); }
  .pr-team{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:28px; margin-top:44px; }
  .pr-tm .ph{ aspect-ratio:1; border-radius:8px; overflow:hidden; background:var(--paper); margin-bottom:14px; } .pr-tm .ph img{ width:100%; height:100%; object-fit:cover; }
  .pr-tm .nm{ font-family:var(--f-d); font-weight:500; font-size:19px; } .pr-tm .rl{ font-size:13.5px; color:var(--ac); margin-top:3px; }
  .pr-foot{ border-top:1px solid var(--line); padding:56px clamp(22px,5vw,60px) 34px; text-align:center; }
  .pr-foot .w{ font-family:var(--f-d); font-size:24px; letter-spacing:.02em; margin-bottom:14px; }
  .pr-foot .c{ font-size:13.5px; color:var(--muted); } .pr-foot .cp{ margin-top:20px; font-size:11.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); }
  @media(max-width:820px){ .pr-links{display:none} }
  `}</style>;
}

export default function ProfessionalServices({ data, activeSlug, setActiveSlug }) {
  useFonts('pr-fonts', 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Inter:wght@400;500&display=swap');
  const accent = data.theme?.accentColor || data.theme?.accent || meta.accent;
  const page = data.pages.find((p) => p.slug === activeSlug) || data.pages.find((p) => p.is_home) || data.pages[0];
  return (
    <CartProvider slug={data.slug}>
      <div className="pr-root">
        <Style accent={accent} />
        <header className="pr-nav"><span className="pr-word">{data.siteName || data.orgName}</span>
          <nav className="pr-links">{data.pages.map((p) => <a key={p.slug} className={`pr-link ${page?.slug === p.slug ? 'on' : ''}`} href={`#${p.slug}`} onClick={(e) => { e.preventDefault(); setActiveSlug(p.slug); }}>{p.title}</a>)}</nav>
        </header>
        <main>
          {(page?.blocks || []).map((b, i) => {
            const c = b.content || {};
            if (b.type === 'hero') return (
              <div key={i}>
                <motion.section className="pr-hero" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.11 } } }}>
                  {c.eyebrow && <motion.div className="pr-eye" variants={rise}>{c.eyebrow}</motion.div>}
                  <motion.h1 className="pr-h1" variants={rise} dangerouslySetInnerHTML={emph(c.heading)} />
                  {c.subheading && <motion.p className="pr-sub" variants={rise}>{c.subheading}</motion.p>}
                  {c.button_text && <motion.div variants={rise}><a className="pr-btn" href={c.button_link || '#contact'}>{c.button_text}</a></motion.div>}
                </motion.section>
                {c.image_url && <motion.div className="pr-himg" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.8 }}><div className="f"><img src={c.image_url} alt="" /></div></motion.div>}
              </div>
            );
            if (b.type === 'text') return (
              <section key={i} className="pr-sec"><Reveal><motion.div className="pr-rule" variants={rise} /><motion.h2 className="pr-h2" variants={rise}>{c.heading}</motion.h2><motion.p className="pr-lead" variants={rise}>{c.body}</motion.p></Reveal></section>
            );
            if (b.type === 'features') return (
              <section key={i} className="pr-sec"><Reveal><motion.div className="pr-rule" variants={rise} /><motion.h2 className="pr-h2" variants={rise}>{c.heading}</motion.h2></Reveal>
                <Reveal className="pr-grid">{(c.items || []).map((f, j) => <motion.div className="pr-card" key={j} variants={rise}><div className="n">{String(j + 1).padStart(2, '0')}</div><h3>{f.title}</h3><p>{f.body}</p></motion.div>)}</Reveal></section>
            );
            if (b.type === 'team') return (
              <section key={i} className="pr-sec"><Reveal><motion.div className="pr-rule" variants={rise} /><motion.h2 className="pr-h2" variants={rise}>{c.heading}</motion.h2></Reveal>
                <Reveal className="pr-team">{(c.items || []).map((m, j) => <motion.div className="pr-tm" key={j} variants={rise}><div className="ph">{m.photo_url && <img src={m.photo_url} alt="" />}</div><div className="nm">{m.name}</div><div className="rl">{m.role}</div></motion.div>)}</Reveal></section>
            );
            return <div key={i} className="pr-sec" style={{ textAlign: 'left' }}><Reveal><motion.div variants={rise}><Block block={b} site={data} v={V} i={i} /></motion.div></Reveal></div>;
          })}
        </main>
        <footer className="pr-foot"><div className="w">{data.siteName || data.orgName}</div><div className="c">{[data.contactPhone, data.contactEmail].filter(Boolean).join('   ·   ')}</div><div className="cp">© {new Date().getFullYear()} · Built with Collarone</div></footer>
      </div>
    </CartProvider>
  );
}
