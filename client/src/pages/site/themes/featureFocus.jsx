import { motion } from 'framer-motion';
import { Reveal, Magnetic, useFonts, rise, emph } from './_kit.jsx';

// Feature Focus — benefit-led. A clean split hero, then each feature as its own
// full alternating row (text against a tinted graphic panel). Archivo display.
export const meta = { key: 'feature-focus', name: 'Feature Focus', category: 'landing', description: 'Benefit-led — a split hero and each feature as its own alternating row. Clean and persuasive.', accent: '#1F6FEB', fonts: 'Archivo + Inter' };

function Style({ accent }) {
  return <style>{`
  .ff-root{ --ac:${accent}; --bg:#ffffff; --ink:#0c1220; --muted:#5a6172; --line:#e8ebf1; --tint:color-mix(in srgb,${accent} 8%, #fff); --f-d:'Archivo',sans-serif; --f-b:'Inter',system-ui,sans-serif;
    --site-bg:var(--bg);--site-fg:var(--ink);--site-muted:var(--muted);--site-surface:#f5f7fb;--site-line:var(--line);--site-font:var(--f-b);--site-font-display:var(--f-d);--site-accent:var(--ac);--site-accent-ui:var(--ac);
    background:var(--bg); color:var(--ink); font-family:var(--f-b); overflow-x:hidden; }
  .ff-root a:focus-visible,.ff-root button:focus-visible{ outline:2px solid var(--ac); outline-offset:3px; border-radius:8px; }
  .ff-nav{ display:flex; align-items:center; gap:16px; padding:20px clamp(20px,5vw,56px); border-bottom:1px solid var(--line); position:sticky; top:0; background:rgba(255,255,255,.9); backdrop-filter:blur(10px); z-index:30; }
  .ff-word{ font-family:var(--f-d); font-weight:700; font-size:20px; letter-spacing:-0.02em; }
  .ff-cta{ margin-left:auto; background:var(--ac); color:#fff; border:none; cursor:pointer; font:inherit; font-weight:650; font-size:14px; padding:10px 20px; border-radius:8px; text-decoration:none; }
  .ff-hero{ display:grid; grid-template-columns:1fr 1fr; gap:clamp(28px,5vw,60px); align-items:center; max-width:1200px; margin:0 auto; padding:clamp(44px,6vw,90px) clamp(20px,5vw,56px); }
  .ff-eye{ font-weight:700; font-size:12.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--ac); margin-bottom:18px; }
  .ff-h1{ font-family:var(--f-d); font-weight:700; font-size:clamp(36px,5.4vw,62px); line-height:1.02; letter-spacing:-0.03em; margin:0 0 20px; }
  .ff-h1 em{ font-style:normal; color:var(--ac); }
  .ff-sub{ font-size:clamp(16px,1.8vw,18.5px); line-height:1.6; color:var(--muted); max-width:46ch; margin:0 0 28px; }
  .ff-btn{ display:inline-block; background:var(--ac); color:#fff; border:none; cursor:pointer; font:inherit; font-weight:650; font-size:15.5px; padding:14px 28px; border-radius:10px; text-decoration:none; box-shadow:0 14px 30px -14px var(--ac); transition:transform .15s; }
  .ff-btn:hover{ transform:translateY(-2px); }
  .ff-shot{ aspect-ratio:4/3; border-radius:16px; overflow:hidden; background:var(--tint); border:1px solid var(--line); }
  .ff-shot img{ width:100%; height:100%; object-fit:cover; }
  .ff-kick{ text-align:center; font-weight:700; font-size:12.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--ac); padding:clamp(40px,6vw,80px) 20px 0; }
  .ff-h2{ font-family:var(--f-d); text-align:center; font-weight:700; font-size:clamp(28px,4vw,44px); letter-spacing:-0.03em; margin:12px auto 0; max-width:20ch; }
  .ff-row{ display:grid; grid-template-columns:1fr 1fr; gap:clamp(28px,5vw,64px); align-items:center; max-width:1120px; margin:0 auto; padding:clamp(40px,6vw,72px) clamp(20px,5vw,56px); }
  .ff-row.alt .ff-copy{ order:2; }
  .ff-num{ font-family:var(--f-d); font-weight:700; font-size:15px; color:var(--ac); margin-bottom:12px; }
  .ff-row h3{ font-family:var(--f-d); font-weight:700; font-size:clamp(22px,2.6vw,30px); letter-spacing:-0.02em; margin:0 0 12px; }
  .ff-row p{ margin:0; font-size:16px; line-height:1.65; color:var(--muted); max-width:42ch; }
  .ff-panel{ aspect-ratio:5/4; border-radius:18px; background:linear-gradient(135deg,var(--tint),#fff); border:1px solid var(--line); display:grid; place-items:center; position:relative; overflow:hidden; }
  .ff-panel .blob{ width:56%; aspect-ratio:1; border-radius:30% 70% 68% 32%/38% 40% 60% 62%; background:linear-gradient(135deg,var(--ac),color-mix(in srgb,var(--ac) 45%,#9ad)); opacity:.9; }
  .ff-quote{ text-align:center; max-width:820px; margin:0 auto; padding:clamp(44px,6vw,80px) clamp(20px,5vw,56px); }
  .ff-quote p{ font-family:var(--f-d); font-weight:600; font-size:clamp(22px,3.2vw,34px); line-height:1.3; letter-spacing:-0.02em; margin:0 0 16px; }
  .ff-quote .a{ font-size:14px; color:var(--muted); font-weight:600; }
  .ff-cta-band{ padding:clamp(30px,5vw,60px) clamp(20px,5vw,56px); }
  .ff-cta-in{ max-width:1000px; margin:0 auto; background:var(--ink); color:#fff; border-radius:22px; text-align:center; padding:clamp(44px,6vw,76px); }
  .ff-cta-in h2{ font-family:var(--f-d); font-weight:700; font-size:clamp(26px,4vw,44px); letter-spacing:-0.03em; margin:0 auto 24px; max-width:18ch; }
  .ff-foot{ text-align:center; padding:40px 20px; color:var(--muted); font-size:13px; border-top:1px solid var(--line); }
  @media(max-width:820px){ .ff-hero,.ff-row{grid-template-columns:1fr} .ff-row.alt .ff-copy{order:0} .ff-shot,.ff-panel{max-width:460px} }
  `}</style>;
}

export default function FeatureFocus({ data }) {
  useFonts('ff-fonts', 'https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap');
  const accent = data.theme?.accentColor || data.theme?.accent || meta.accent;
  const home = data.pages.find((p) => p.is_home) || data.pages[0];
  const blocks = home?.blocks || [];
  const hero = blocks.find((b) => b.type === 'hero')?.content || {};
  return (
    <div className="ff-root">
      <Style accent={accent} />
      <header className="ff-nav"><span className="ff-word">{data.siteName || data.orgName}</span><a className="ff-cta" href="#contact">{hero.button_text || 'Get started'}</a></header>
      <main>
        {blocks.map((b, i) => {
          const c = b.content || {};
          if (b.type === 'hero') return (
            <motion.section key={i} className="ff-hero" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}>
              <div>
                {c.eyebrow && <motion.div className="ff-eye" variants={rise}>{c.eyebrow}</motion.div>}
                <motion.h1 className="ff-h1" variants={rise} dangerouslySetInnerHTML={emph(c.heading)} />
                {c.subheading && <motion.p className="ff-sub" variants={rise}>{c.subheading}</motion.p>}
                {c.button_text && <motion.div variants={rise}><Magnetic><a className="ff-btn" href={c.button_link || '#contact'}>{c.button_text}</a></Magnetic></motion.div>}
              </div>
              {c.image_url && <motion.div className="ff-shot" variants={rise}><img src={c.image_url} alt="" /></motion.div>}
            </motion.section>
          );
          if (b.type === 'features') return (
            <div key={i}>
              {c.heading && <><div className="ff-kick">Features</div><h2 className="ff-h2">{c.heading}</h2></>}
              {(c.items || []).map((f, j) => (
                <Reveal key={j}><motion.div className={`ff-row ${j % 2 ? 'alt' : ''}`} variants={rise}>
                  <div className="ff-copy"><div className="ff-num">{String(j + 1).padStart(2, '0')}</div><h3>{f.title}</h3><p>{f.body}</p></div>
                  <div className="ff-panel"><div className="blob" /></div>
                </motion.div></Reveal>
              ))}
            </div>
          );
          if (b.type === 'testimonials') { const t = (c.items || [])[0]; return t ? <section key={i} className="ff-quote"><Reveal><motion.p variants={rise}>“{t.quote}”</motion.p><motion.div className="a" variants={rise}>— {t.author}</motion.div></Reveal></section> : null; }
          if (b.type === 'cta') return (
            <section key={i} className="ff-cta-band"><div className="ff-cta-in"><Reveal><motion.h2 variants={rise}>{c.heading}</motion.h2>{c.button_text && <motion.div variants={rise}><a className="ff-btn" href={c.button_link || '#contact'}>{c.button_text}</a></motion.div>}</Reveal></div></section>
          );
          return null;
        })}
      </main>
      <footer className="ff-foot">© {new Date().getFullYear()} {data.siteName || data.orgName} · Built with Collarone</footer>
    </div>
  );
}
