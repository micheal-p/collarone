import { motion } from 'framer-motion';
import { Reveal, useFonts, rise, emph } from './_kit.jsx';

// Minimal Pitch — restraint as the design. A single narrow column, enormous
// whitespace, a refined Fraunces display and hairline rules. Nothing shouts.
export const meta = { key: 'minimal-pitch', name: 'Minimal Pitch', category: 'landing', description: 'Restraint as the design — one narrow column, huge whitespace, a refined serif and hairline rules.', accent: '#111014', fonts: 'Fraunces + Inter' };

function Style({ accent }) {
  return <style>{`
  .mp-root{ --ac:${accent}; --bg:#fcfcfb; --ink:#141310; --muted:#767268; --line:#e8e5dd; --f-d:'Fraunces',Georgia,serif; --f-b:'Inter',system-ui,sans-serif;
    --site-bg:var(--bg);--site-fg:var(--ink);--site-muted:var(--muted);--site-surface:#f4f2ec;--site-line:var(--line);--site-font:var(--f-b);--site-font-display:var(--f-d);--site-accent:var(--ac);--site-accent-ui:var(--ac);
    background:var(--bg); color:var(--ink); font-family:var(--f-b); overflow-x:hidden; }
  .mp-root a:focus-visible,.mp-root button:focus-visible{ outline:1px solid var(--ink); outline-offset:4px; }
  .mp-nav{ display:flex; align-items:center; padding:30px clamp(24px,6vw,64px); max-width:760px; margin:0 auto; }
  .mp-word{ font-family:var(--f-d); font-weight:500; font-size:20px; letter-spacing:.01em; }
  .mp-link{ margin-left:auto; font-size:13.5px; color:var(--ink); text-decoration:none; border-bottom:1px solid var(--ink); padding-bottom:2px; }
  .mp-wrap{ max-width:680px; margin:0 auto; padding:0 clamp(24px,6vw,64px); }
  .mp-hero{ padding:clamp(60px,10vw,140px) 0 clamp(48px,7vw,90px); }
  .mp-eye{ font-size:12px; letter-spacing:.24em; text-transform:uppercase; color:var(--muted); margin-bottom:28px; }
  .mp-h1{ font-family:var(--f-d); font-weight:400; font-size:clamp(34px,5.6vw,60px); line-height:1.08; letter-spacing:-0.01em; margin:0 0 28px; }
  .mp-h1 em{ font-style:italic; }
  .mp-sub{ font-size:18.5px; line-height:1.68; color:var(--muted); margin:0 0 34px; max-width:52ch; }
  .mp-btn{ display:inline-block; font-size:15px; font-weight:500; color:var(--ink); text-decoration:none; border-bottom:1.5px solid var(--ink); padding-bottom:3px; transition:opacity .2s; }
  .mp-btn:hover{ opacity:.6; }
  .mp-shot{ margin:clamp(40px,6vw,70px) 0 0; aspect-ratio:16/10; border-radius:2px; overflow:hidden; background:var(--site-surface); }
  .mp-shot img{ width:100%; height:100%; object-fit:cover; filter:grayscale(.1); }
  .mp-sec{ padding:clamp(52px,8vw,100px) 0; border-top:1px solid var(--line); }
  .mp-h2{ font-family:var(--f-d); font-weight:400; font-size:clamp(24px,3.6vw,36px); letter-spacing:-0.01em; margin:0 0 40px; }
  .mp-feat{ display:flex; gap:22px; padding:24px 0; border-top:1px solid var(--line); }
  .mp-feat:first-of-type{ border-top:none; }
  .mp-feat .n{ font-family:var(--f-d); font-size:16px; color:var(--muted); flex-shrink:0; width:34px; }
  .mp-feat h3{ font-size:17px; font-weight:600; margin:0 0 6px; }
  .mp-feat p{ margin:0; font-size:15px; line-height:1.6; color:var(--muted); }
  .mp-quote{ font-family:var(--f-d); font-weight:400; font-size:clamp(24px,3.6vw,34px); font-style:italic; line-height:1.35; letter-spacing:-0.01em; }
  .mp-quote .a{ font-family:var(--f-b); font-style:normal; font-size:14px; color:var(--muted); margin-top:18px; letter-spacing:.02em; }
  .mp-cta{ padding:clamp(56px,9vw,120px) 0; border-top:1px solid var(--line); }
  .mp-cta h2{ font-family:var(--f-d); font-weight:400; font-size:clamp(28px,4.6vw,50px); line-height:1.08; letter-spacing:-0.01em; margin:0 0 30px; }
  .mp-foot{ padding:40px clamp(24px,6vw,64px); max-width:680px; margin:0 auto; font-size:12.5px; color:var(--muted); border-top:1px solid var(--line); }
  `}</style>;
}

export default function MinimalPitch({ data }) {
  useFonts('mp-fonts', 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400&family=Inter:wght@400;500;600&display=swap');
  const accent = data.theme?.accentColor || data.theme?.accent || meta.accent;
  const home = data.pages.find((p) => p.is_home) || data.pages[0];
  const blocks = home?.blocks || [];
  const hero = blocks.find((b) => b.type === 'hero')?.content || {};
  return (
    <div className="mp-root">
      <Style accent={accent} />
      <header className="mp-nav"><span className="mp-word">{data.siteName || data.orgName}</span><a className="mp-link" href="#contact">{hero.button_text || 'Get in touch'}</a></header>
      <div className="mp-wrap">
        {blocks.map((b, i) => {
          const c = b.content || {};
          if (b.type === 'hero') return (
            <motion.section key={i} className="mp-hero" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.11 } } }}>
              {c.eyebrow && <motion.div className="mp-eye" variants={rise}>{c.eyebrow}</motion.div>}
              <motion.h1 className="mp-h1" variants={rise} dangerouslySetInnerHTML={emph(c.heading)} />
              {c.subheading && <motion.p className="mp-sub" variants={rise}>{c.subheading}</motion.p>}
              {c.button_text && <motion.div variants={rise}><a className="mp-btn" href={c.button_link || '#contact'}>{c.button_text} →</a></motion.div>}
              {c.image_url && <motion.div className="mp-shot" variants={rise}><img src={c.image_url} alt="" /></motion.div>}
            </motion.section>
          );
          if (b.type === 'features') return (
            <section key={i} className="mp-sec"><Reveal><motion.h2 className="mp-h2" variants={rise}>{c.heading}</motion.h2>{(c.items || []).map((f, j) => <motion.div className="mp-feat" key={j} variants={rise}><span className="n">{String(j + 1).padStart(2, '0')}</span><div><h3>{f.title}</h3><p>{f.body}</p></div></motion.div>)}</Reveal></section>
          );
          if (b.type === 'testimonials') { const t = (c.items || [])[0]; return t ? <section key={i} className="mp-sec"><Reveal><motion.div className="mp-quote" variants={rise}>“{t.quote}”<div className="a">— {t.author}</div></motion.div></Reveal></section> : null; }
          if (b.type === 'cta') return (
            <section key={i} className="mp-cta"><Reveal><motion.h2 variants={rise} dangerouslySetInnerHTML={emph(c.heading)} />{c.button_text && <motion.div variants={rise}><a className="mp-btn" href={c.button_link || '#contact'}>{c.button_text} →</a></motion.div>}</Reveal></section>
          );
          return null;
        })}
      </div>
      <footer className="mp-foot">© {new Date().getFullYear()} {data.siteName || data.orgName} · Built with Collarone</footer>
    </div>
  );
}
