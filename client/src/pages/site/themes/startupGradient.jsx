import { motion } from 'framer-motion';
import { Reveal, Magnetic, useFonts, rise, emph } from './_kit.jsx';

// Startup Gradient — a modern SaaS look: a soft gradient hero, glassy feature
// cards, rounded everything and gradient buttons.
export const meta = { key: 'startup-gradient', name: 'Startup Gradient', category: 'landing', description: 'Modern SaaS — a soft gradient hero, glassy cards and rounded gradient buttons.', accent: '#6D5CF5', fonts: 'Sora + Inter' };

function Style({ accent }) {
  return <style>{`
  .sg-root{ --ac:${accent}; --ac2:color-mix(in srgb,${accent} 55%, #10b3e8); --bg:#fbfbfe; --ink:#14131f; --muted:#615f74; --line:#eae8f4; --f-d:'Sora',sans-serif; --f-b:'Inter',system-ui,sans-serif;
    --site-bg:var(--bg);--site-fg:var(--ink);--site-muted:var(--muted);--site-surface:#f4f2fc;--site-line:var(--line);--site-font:var(--f-b);--site-font-display:var(--f-d);--site-accent:var(--ac);--site-accent-ui:var(--ac);
    background:var(--bg); color:var(--ink); font-family:var(--f-b); overflow-x:hidden; }
  .sg-root a:focus-visible,.sg-root button:focus-visible{ outline:2px solid var(--ac); outline-offset:3px; border-radius:10px; }
  .sg-hwrap{ position:relative; overflow:hidden; }
  .sg-hwrap::before{ content:''; position:absolute; top:-30%; left:50%; transform:translateX(-50%); width:min(1200px,120%); height:760px; z-index:0;
    background:radial-gradient(60% 60% at 50% 0%, color-mix(in srgb,var(--ac) 26%, transparent), transparent 70%), radial-gradient(50% 50% at 80% 20%, color-mix(in srgb,var(--ac2) 22%, transparent), transparent 70%); filter:blur(10px); }
  .sg-nav{ position:relative; z-index:2; display:flex; align-items:center; gap:16px; padding:20px clamp(20px,5vw,52px); }
  .sg-word{ font-family:var(--f-d); font-weight:700; font-size:20px; letter-spacing:-0.02em; }
  .sg-cta{ margin-left:auto; background:linear-gradient(135deg,var(--ac),var(--ac2)); color:#fff; border:none; cursor:pointer; font:inherit; font-weight:650; font-size:14px; padding:11px 22px; border-radius:999px; text-decoration:none; }
  .sg-hero{ position:relative; z-index:2; text-align:center; padding:clamp(44px,7vw,100px) clamp(20px,5vw,52px) clamp(30px,5vw,60px); max-width:900px; margin:0 auto; }
  .sg-chip{ display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,.7); backdrop-filter:blur(8px); border:1px solid var(--line); color:var(--ac); font-weight:650; font-size:13px; padding:7px 16px; border-radius:999px; margin-bottom:24px; }
  .sg-h1{ font-family:var(--f-d); font-weight:800; font-size:clamp(40px,7vw,80px); line-height:1; letter-spacing:-0.035em; margin:0 0 20px; text-wrap:balance; }
  .sg-h1 em{ font-style:normal; background:linear-gradient(120deg,var(--ac),var(--ac2)); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .sg-sub{ font-size:clamp(16px,2vw,19px); line-height:1.55; color:var(--muted); max-width:50ch; margin:0 auto 32px; }
  .sg-btn{ background:linear-gradient(135deg,var(--ac),var(--ac2)); color:#fff; border:none; cursor:pointer; font:inherit; font-weight:700; font-size:16px; padding:15px 32px; border-radius:999px; text-decoration:none; box-shadow:0 18px 40px -14px var(--ac); transition:transform .15s; }
  .sg-btn:hover{ transform:translateY(-3px); }
  .sg-shot{ position:relative; z-index:2; max-width:1000px; margin:0 auto; padding:0 clamp(20px,5vw,52px) clamp(40px,6vw,80px); }
  .sg-shot .f{ border-radius:22px; overflow:hidden; border:1px solid var(--line); box-shadow:0 40px 90px -30px color-mix(in srgb,var(--ac) 40%, rgba(20,19,31,.5)); aspect-ratio:16/10; background:var(--site-surface); }
  .sg-shot .f img{ width:100%; height:100%; object-fit:cover; }
  .sg-sec{ max-width:1080px; margin:0 auto; padding:clamp(44px,6vw,84px) clamp(20px,5vw,52px); }
  .sg-h2{ font-family:var(--f-d); text-align:center; font-weight:800; font-size:clamp(28px,4vw,44px); letter-spacing:-0.03em; margin:0 auto 44px; max-width:20ch; }
  .sg-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:18px; }
  .sg-card{ background:rgba(255,255,255,.6); backdrop-filter:blur(10px); border:1px solid var(--line); border-radius:20px; padding:28px; box-shadow:0 10px 30px -18px rgba(20,19,31,.3); }
  .sg-card .ic{ width:46px; height:46px; border-radius:14px; background:linear-gradient(135deg,var(--ac),var(--ac2)); margin-bottom:16px; }
  .sg-card h3{ font-family:var(--f-d); font-weight:700; font-size:18px; margin:0 0 8px; }
  .sg-card p{ margin:0; font-size:14.5px; line-height:1.6; color:var(--muted); }
  .sg-quote{ text-align:center; max-width:820px; margin:0 auto; }
  .sg-quote p{ font-family:var(--f-d); font-weight:600; font-size:clamp(21px,3vw,32px); line-height:1.32; letter-spacing:-0.02em; margin:0 0 16px; }
  .sg-quote .a{ font-size:14px; color:var(--muted); font-weight:600; }
  .sg-cta-band{ padding:clamp(30px,5vw,60px) clamp(20px,5vw,52px); }
  .sg-cta-in{ max-width:1000px; margin:0 auto; background:linear-gradient(135deg,var(--ac),var(--ac2)); color:#fff; border-radius:28px; text-align:center; padding:clamp(44px,6vw,80px); }
  .sg-cta-in h2{ font-family:var(--f-d); font-weight:800; font-size:clamp(28px,4.4vw,48px); letter-spacing:-0.03em; margin:0 auto 26px; max-width:18ch; }
  .sg-cta-in .sg-btn{ background:#fff; color:var(--ac); box-shadow:none; }
  .sg-foot{ text-align:center; padding:40px 20px; color:var(--muted); font-size:13px; }
  `}</style>;
}

export default function StartupGradient({ data }) {
  useFonts('sg-fonts', 'https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap');
  const accent = data.theme?.accentColor || data.theme?.accent || meta.accent;
  const home = data.pages.find((p) => p.is_home) || data.pages[0];
  const blocks = home?.blocks || [];
  const hero = blocks.find((b) => b.type === 'hero')?.content || {};
  return (
    <div className="sg-root">
      <Style accent={accent} />
      <div className="sg-hwrap">
        <header className="sg-nav"><span className="sg-word">{data.siteName || data.orgName}</span><a className="sg-cta" href="#contact">{hero.button_text || 'Try free'}</a></header>
        {(() => { const c = hero; return (
          <>
            <motion.section className="sg-hero" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }}>
              {c.eyebrow && <motion.div className="sg-chip" variants={rise}>✦ {c.eyebrow}</motion.div>}
              <motion.h1 className="sg-h1" variants={rise} dangerouslySetInnerHTML={emph(c.heading)} />
              {c.subheading && <motion.p className="sg-sub" variants={rise}>{c.subheading}</motion.p>}
              {c.button_text && <motion.div variants={rise}><Magnetic><a className="sg-btn" href={c.button_link || '#contact'}>{c.button_text}</a></Magnetic></motion.div>}
            </motion.section>
            {c.image_url && <motion.div className="sg-shot" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.8 }}><div className="f"><img src={c.image_url} alt="" /></div></motion.div>}
          </>
        ); })()}
      </div>
      <main>
        {blocks.map((b, i) => {
          const c = b.content || {};
          if (b.type === 'features') return (
            <section key={i} className="sg-sec"><h2 className="sg-h2">{c.heading}</h2>
              <Reveal className="sg-grid">{(c.items || []).map((f, j) => <motion.div className="sg-card" key={j} variants={rise}><div className="ic" /><h3>{f.title}</h3><p>{f.body}</p></motion.div>)}</Reveal></section>
          );
          if (b.type === 'testimonials') { const t = (c.items || [])[0]; return t ? <section key={i} className="sg-sec"><Reveal className="sg-quote"><motion.p variants={rise}>“{t.quote}”</motion.p><motion.div className="a" variants={rise}>— {t.author}</motion.div></Reveal></section> : null; }
          if (b.type === 'cta') return (
            <section key={i} className="sg-cta-band"><div className="sg-cta-in"><Reveal><motion.h2 variants={rise}>{c.heading}</motion.h2>{c.button_text && <motion.div variants={rise}><a className="sg-btn" href={c.button_link || '#contact'}>{c.button_text}</a></motion.div>}</Reveal></div></section>
          );
          return null;
        })}
      </main>
      <footer className="sg-foot">© {new Date().getFullYear()} {data.siteName || data.orgName} · Built with Collarone</footer>
    </div>
  );
}
