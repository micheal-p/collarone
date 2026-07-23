import { motion } from 'framer-motion';
import { Reveal, Magnetic, useFonts, rise, emph } from './_kit.jsx';

// Launch Bold — a high-energy product launch. Huge Space Grotesk headline,
// a bold color-block hero, chunky feature cards and punchy CTAs.
export const meta = { key: 'launch-bold', name: 'Launch Bold', category: 'landing', description: 'High-energy product launch — oversized bold type, a color-block hero and punchy CTAs.', accent: '#F0430A', fonts: 'Space Grotesk + Inter' };

function Style({ accent }) {
  return <style>{`
  .lb-root{ --ac:${accent}; --bg:#fff; --ink:#0e0f14; --muted:#5d616b; --line:#ecebe8; --f-d:'Space Grotesk',sans-serif; --f-b:'Inter',system-ui,sans-serif;
    --site-bg:var(--bg);--site-fg:var(--ink);--site-muted:var(--muted);--site-surface:#f6f5f2;--site-line:var(--line);--site-font:var(--f-b);--site-font-display:var(--f-d);--site-accent:var(--ac);--site-accent-ui:var(--ac);
    background:var(--bg); color:var(--ink); font-family:var(--f-b); overflow-x:hidden; }
  .lb-root a:focus-visible,.lb-root button:focus-visible{ outline:3px solid var(--ac); outline-offset:3px; }
  .lb-nav{ display:flex; align-items:center; gap:16px; padding:20px clamp(20px,5vw,52px); position:sticky; top:0; z-index:30; background:rgba(255,255,255,.86); backdrop-filter:blur(12px); }
  .lb-word{ font-family:var(--f-d); font-weight:700; font-size:21px; letter-spacing:-0.03em; }
  .lb-cta{ margin-left:auto; background:var(--ink); color:#fff; border:none; cursor:pointer; font:inherit; font-weight:650; font-size:14px; padding:11px 22px; border-radius:10px; text-decoration:none; }
  .lb-hero{ text-align:center; padding:clamp(52px,8vw,120px) clamp(20px,5vw,52px) clamp(40px,6vw,80px); max-width:1000px; margin:0 auto; }
  .lb-pill{ display:inline-block; background:color-mix(in srgb,var(--ac) 12%,#fff); color:var(--ac); font-weight:700; font-size:13px; padding:7px 16px; border-radius:999px; margin-bottom:26px; }
  .lb-h1{ font-family:var(--f-d); font-weight:700; font-size:clamp(42px,8vw,92px); line-height:.98; letter-spacing:-0.04em; margin:0 0 22px; text-wrap:balance; }
  .lb-h1 em{ font-style:normal; color:var(--ac); }
  .lb-sub{ font-size:clamp(16px,2vw,20px); line-height:1.55; color:var(--muted); max-width:52ch; margin:0 auto 34px; }
  .lb-btns{ display:flex; gap:14px; justify-content:center; flex-wrap:wrap; }
  .lb-btn{ background:var(--ac); color:#fff; border:none; cursor:pointer; font:inherit; font-weight:700; font-size:16px; padding:16px 34px; border-radius:12px; text-decoration:none; box-shadow:0 14px 30px -12px var(--ac); transition:transform .15s; }
  .lb-btn:hover{ transform:translateY(-3px); }
  .lb-shot{ max-width:1000px; margin:0 auto; padding:0 clamp(20px,5vw,52px) clamp(40px,6vw,80px); }
  .lb-shot .f{ border-radius:18px; overflow:hidden; border:1px solid var(--line); box-shadow:0 40px 80px -30px rgba(14,15,20,.4); aspect-ratio:16/9; background:var(--site-surface); }
  .lb-shot .f img{ width:100%; height:100%; object-fit:cover; }
  .lb-sec{ max-width:1080px; margin:0 auto; padding:clamp(48px,6vw,88px) clamp(20px,5vw,52px); }
  .lb-kick{ text-align:center; font-weight:700; font-size:13px; letter-spacing:.14em; text-transform:uppercase; color:var(--ac); margin-bottom:12px; }
  .lb-h2{ font-family:var(--f-d); text-align:center; font-weight:700; font-size:clamp(28px,4vw,44px); letter-spacing:-0.03em; margin:0 auto 44px; max-width:20ch; }
  .lb-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:18px; }
  .lb-card{ background:var(--site-surface); border:1px solid var(--line); border-radius:16px; padding:28px; }
  .lb-card .n{ width:44px; height:44px; border-radius:12px; background:var(--ac); color:#fff; display:grid; place-items:center; font-family:var(--f-d); font-weight:700; margin-bottom:16px; }
  .lb-card h3{ font-family:var(--f-d); font-weight:700; font-size:19px; margin:0 0 8px; }
  .lb-card p{ margin:0; font-size:14.5px; line-height:1.6; color:var(--muted); }
  .lb-quote{ text-align:center; max-width:820px; margin:0 auto; }
  .lb-quote p{ font-family:var(--f-d); font-weight:500; font-size:clamp(22px,3.2vw,34px); line-height:1.3; letter-spacing:-0.02em; margin:0 0 18px; }
  .lb-quote .a{ font-size:14px; color:var(--muted); font-weight:600; }
  .lb-cta-band{ margin:clamp(30px,5vw,60px) clamp(20px,5vw,52px); }
  .lb-cta-in{ max-width:1000px; margin:0 auto; background:var(--ink); color:#fff; border-radius:24px; text-align:center; padding:clamp(44px,6vw,80px); }
  .lb-cta-in h2{ font-family:var(--f-d); font-weight:700; font-size:clamp(28px,4.4vw,48px); letter-spacing:-0.03em; margin:0 auto 26px; max-width:18ch; }
  .lb-foot{ text-align:center; padding:40px 20px; color:var(--muted); font-size:13px; border-top:1px solid var(--line); }
  @media(max-width:820px){ .lb-cta{padding:9px 16px} }
  `}</style>;
}

export default function LaunchBold({ data }) {
  useFonts('lb-fonts', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
  const accent = data.theme?.accentColor || data.theme?.accent || meta.accent;
  const home = data.pages.find((p) => p.is_home) || data.pages[0];
  const blocks = home?.blocks || [];
  const hero = blocks.find((b) => b.type === 'hero')?.content || {};
  return (
    <div className="lb-root">
      <Style accent={accent} />
      <header className="lb-nav"><span className="lb-word">{data.siteName || data.orgName}</span><a className="lb-cta" href="#contact">{hero.button_text || 'Get started'}</a></header>
      <main>
        {blocks.map((b, i) => {
          const c = b.content || {};
          if (b.type === 'hero') return (
            <div key={i}>
              <motion.section className="lb-hero" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }}>
                {c.eyebrow && <motion.div className="lb-pill" variants={rise}>{c.eyebrow}</motion.div>}
                <motion.h1 className="lb-h1" variants={rise} dangerouslySetInnerHTML={emph(c.heading)} />
                {c.subheading && <motion.p className="lb-sub" variants={rise}>{c.subheading}</motion.p>}
                <motion.div className="lb-btns" variants={rise}>{c.button_text && <Magnetic><a className="lb-btn" href={c.button_link || '#contact'}>{c.button_text}</a></Magnetic>}</motion.div>
              </motion.section>
              {c.image_url && <motion.div className="lb-shot" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}><div className="f"><img src={c.image_url} alt="" /></div></motion.div>}
            </div>
          );
          if (b.type === 'features') return (
            <section key={i} className="lb-sec">
              <div className="lb-kick">Why it works</div><h2 className="lb-h2">{c.heading}</h2>
              <Reveal className="lb-grid">{(c.items || []).map((f, j) => <motion.div className="lb-card" key={j} variants={rise}><div className="n">{j + 1}</div><h3>{f.title}</h3><p>{f.body}</p></motion.div>)}</Reveal>
            </section>
          );
          if (b.type === 'testimonials') { const t = (c.items || [])[0]; return t ? (
            <section key={i} className="lb-sec"><Reveal className="lb-quote"><motion.p variants={rise}>“{t.quote}”</motion.p><motion.div className="a" variants={rise}>— {t.author}</motion.div></Reveal></section>
          ) : null; }
          if (b.type === 'cta') return (
            <section key={i} className="lb-cta-band"><div className="lb-cta-in"><Reveal><motion.h2 variants={rise}>{c.heading}</motion.h2>{c.button_text && <motion.div variants={rise}><Magnetic><a className="lb-btn" href={c.button_link || '#contact'}>{c.button_text}</a></Magnetic></motion.div>}</Reveal></div></section>
          );
          return null;
        })}
      </main>
      <footer className="lb-foot">© {new Date().getFullYear()} {data.siteName || data.orgName} · Built with Collarone</footer>
    </div>
  );
}
