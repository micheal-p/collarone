import { motion } from 'framer-motion';
import { CartProvider, Block } from '../siteLayouts.jsx';
import { Reveal, useFonts, rise, emph } from './_kit.jsx';

// Corporate Clean — a structured, trustworthy business site. Navy-forward,
// a crisp grid, a boxed split hero and a top contact bar. IBM Plex Sans.
export const meta = { key: 'corporate-clean', name: 'Corporate Clean', category: 'company', description: 'Structured and trustworthy — a crisp grid, boxed split hero and a contact bar. Classic business.', accent: '#1B4B91', fonts: 'IBM Plex Sans' };

const V = { hero: 'boxed', card: 'bordered', btnRadius: 4, display: 0.9, headingWeight: 700, h2Mode: 'left-kicker', band: 'alt', secPad: 56, ctaMode: 'accent', footerMode: 'columns' };

function Style({ accent }) {
  return <style>{`
  .co-root{ --ac:${accent}; --bg:#ffffff; --ink:#111827; --muted:#5b6472; --line:#e5e8ee; --tint:#f4f7fb; --f-d:'IBM Plex Sans',sans-serif; --f-b:'IBM Plex Sans',system-ui,sans-serif;
    --site-bg:var(--bg);--site-fg:var(--ink);--site-muted:var(--muted);--site-surface:var(--tint);--site-line:var(--line);--site-font:var(--f-b);--site-font-display:var(--f-d);--site-accent:var(--ac);--site-accent-ui:var(--ac);
    background:var(--bg); color:var(--ink); font-family:var(--f-b); overflow-x:hidden; }
  .co-root a:focus-visible,.co-root button:focus-visible{ outline:2px solid var(--ac); outline-offset:2px; }
  .co-top{ background:var(--ink); color:#cdd3dd; font-size:12.5px; padding:8px clamp(20px,5vw,56px); display:flex; gap:20px; justify-content:flex-end; flex-wrap:wrap; }
  .co-nav{ display:flex; align-items:center; gap:18px; padding:16px clamp(20px,5vw,56px); border-bottom:1px solid var(--line); position:sticky; top:0; background:rgba(255,255,255,.95); backdrop-filter:blur(8px); z-index:30; }
  .co-word{ font-family:var(--f-d); font-weight:700; font-size:19px; letter-spacing:-0.01em; display:flex; align-items:center; gap:9px; }
  .co-word::before{ content:''; width:8px; height:22px; background:var(--ac); }
  .co-links{ display:flex; gap:24px; margin-left:auto; }
  .co-link{ font-size:14px; font-weight:500; color:var(--ink); opacity:.75; text-decoration:none; }
  .co-link:hover,.co-link.on{ opacity:1; color:var(--ac); }
  .co-hero{ display:grid; grid-template-columns:1.1fr .9fr; gap:0; max-width:1200px; margin:0 auto; align-items:stretch; }
  .co-hcopy{ padding:clamp(44px,6vw,84px) clamp(20px,4vw,48px); }
  .co-eye{ font-size:12.5px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--ac); margin-bottom:16px; }
  .co-h1{ font-family:var(--f-d); font-weight:700; font-size:clamp(32px,4.6vw,52px); line-height:1.06; letter-spacing:-0.02em; margin:0 0 18px; }
  .co-h1 em{ font-style:normal; color:var(--ac); }
  .co-sub{ font-size:16.5px; line-height:1.62; color:var(--muted); max-width:44ch; margin:0 0 26px; }
  .co-btn{ display:inline-block; background:var(--ac); color:#fff; border:none; cursor:pointer; font:inherit; font-weight:600; font-size:15px; padding:14px 28px; border-radius:4px; text-decoration:none; }
  .co-himg{ background:var(--tint); }
  .co-himg img{ width:100%; height:100%; object-fit:cover; display:block; min-height:280px; }
  .co-sec{ max-width:1120px; margin:0 auto; padding:clamp(48px,6vw,80px) clamp(20px,5vw,56px); }
  .co-sec.alt{ background:var(--tint); max-width:none; } .co-sec.alt > div{ max-width:1120px; margin:0 auto; }
  .co-kick{ font-size:12.5px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--ac); margin-bottom:10px; }
  .co-h2{ font-family:var(--f-d); font-weight:700; font-size:clamp(26px,3.4vw,38px); letter-spacing:-0.02em; margin:0 0 14px; }
  .co-h2rule{ width:56px; height:3px; background:var(--ac); margin-bottom:34px; }
  .co-lead{ font-size:17px; line-height:1.7; color:var(--muted); max-width:66ch; }
  .co-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:1px; background:var(--line); border:1px solid var(--line); }
  .co-card{ background:#fff; padding:30px; }
  .co-card .b{ width:8px; height:8px; background:var(--ac); margin-bottom:16px; }
  .co-card h3{ font-family:var(--f-d); font-weight:700; font-size:18px; margin:0 0 8px; }
  .co-card p{ margin:0; font-size:14.5px; line-height:1.6; color:var(--muted); }
  .co-team{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:24px; }
  .co-tm{ text-align:left; } .co-tm .ph{ aspect-ratio:1; border-radius:6px; overflow:hidden; background:var(--tint); margin-bottom:14px; }
  .co-tm .ph img{ width:100%; height:100%; object-fit:cover; } .co-tm .nm{ font-family:var(--f-d); font-weight:700; font-size:16px; } .co-tm .rl{ font-size:13.5px; color:var(--ac); margin-top:3px; }
  .co-foot{ background:var(--ink); color:#aeb6c2; padding:44px clamp(20px,5vw,56px) 28px; }
  .co-foot-in{ max-width:1120px; margin:0 auto; display:flex; justify-content:space-between; flex-wrap:wrap; gap:24px; }
  .co-foot .w{ font-family:var(--f-d); color:#fff; font-weight:700; font-size:18px; } .co-foot .cp{ max-width:1120px; margin:26px auto 0; padding-top:18px; border-top:1px solid rgba(255,255,255,.12); font-size:12.5px; }
  @media(max-width:820px){ .co-hero{grid-template-columns:1fr} .co-himg{order:-1} .co-links{display:none} }
  `}</style>;
}

function CoNav({ data, page, setActiveSlug }) {
  return (
    <>
      {(data.contactPhone || data.contactEmail) && <div className="co-top">{data.contactPhone && <span>☎ {data.contactPhone}</span>}{data.contactEmail && <span>✉ {data.contactEmail}</span>}</div>}
      <header className="co-nav">
        <span className="co-word">{data.siteName || data.orgName}</span>
        <nav className="co-links">{data.pages.map((p) => <a key={p.slug} className={`co-link ${page?.slug === p.slug ? 'on' : ''}`} href={`#${p.slug}`} onClick={(e) => { e.preventDefault(); setActiveSlug(p.slug); }}>{p.title}</a>)}</nav>
      </header>
    </>
  );
}

export default function CorporateClean({ data, activeSlug, setActiveSlug }) {
  useFonts('co-fonts', 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
  const accent = data.theme?.accentColor || data.theme?.accent || meta.accent;
  const page = data.pages.find((p) => p.slug === activeSlug) || data.pages.find((p) => p.is_home) || data.pages[0];
  return (
    <CartProvider slug={data.slug}>
      <div className="co-root">
        <Style accent={accent} />
        <CoNav data={data} page={page} setActiveSlug={setActiveSlug} />
        <main>
          {(page?.blocks || []).map((b, i) => {
            const c = b.content || {};
            if (b.type === 'hero') return (
              <motion.section key={i} className="co-hero" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }}>
                <div className="co-hcopy">
                  {c.eyebrow && <motion.div className="co-eye" variants={rise}>{c.eyebrow}</motion.div>}
                  <motion.h1 className="co-h1" variants={rise} dangerouslySetInnerHTML={emph(c.heading)} />
                  {c.subheading && <motion.p className="co-sub" variants={rise}>{c.subheading}</motion.p>}
                  {c.button_text && <motion.div variants={rise}><a className="co-btn" href={c.button_link || '#contact'}>{c.button_text}</a></motion.div>}
                </div>
                {c.image_url && <div className="co-himg"><img src={c.image_url} alt="" /></div>}
              </motion.section>
            );
            if (b.type === 'text') return (
              <section key={i} className="co-sec"><Reveal><motion.div variants={rise} className="co-kick">About</motion.div><motion.h2 className="co-h2" variants={rise}>{c.heading}</motion.h2><motion.div className="co-h2rule" variants={rise} /><motion.p className="co-lead" variants={rise}>{c.body}</motion.p></Reveal></section>
            );
            if (b.type === 'features') return (
              <section key={i} className="co-sec alt"><div><Reveal><motion.div className="co-kick" variants={rise}>What we do</motion.div><motion.h2 className="co-h2" variants={rise}>{c.heading}</motion.h2><motion.div className="co-h2rule" variants={rise} /></Reveal>
                <Reveal className="co-grid">{(c.items || []).map((f, j) => <motion.div className="co-card" key={j} variants={rise}><div className="b" /><h3>{f.title}</h3><p>{f.body}</p></motion.div>)}</Reveal></div></section>
            );
            if (b.type === 'team') return (
              <section key={i} className="co-sec"><Reveal><motion.div className="co-kick" variants={rise}>Our people</motion.div><motion.h2 className="co-h2" variants={rise}>{c.heading}</motion.h2><motion.div className="co-h2rule" variants={rise} /></Reveal>
                <Reveal className="co-team">{(c.items || []).map((m, j) => <motion.div className="co-tm" key={j} variants={rise}><div className="ph">{m.photo_url && <img src={m.photo_url} alt="" />}</div><div className="nm">{m.name}</div><div className="rl">{m.role}</div></motion.div>)}</Reveal></section>
            );
            return <div key={i} className="co-sec"><Reveal><motion.div variants={rise}><Block block={b} site={data} v={V} i={i} /></motion.div></Reveal></div>;
          })}
        </main>
        <footer className="co-foot">
          <div className="co-foot-in"><div><div className="w">{data.siteName || data.orgName}</div>{data.tagline && <p style={{ margin: '10px 0 0', fontSize: 14, maxWidth: 300 }}>{data.tagline}</p>}</div>
            <div style={{ fontSize: 14, lineHeight: 1.9 }}>{data.contactPhone && <div>{data.contactPhone}</div>}{data.contactEmail && <div>{data.contactEmail}</div>}</div></div>
          <div className="cp">© {new Date().getFullYear()} {data.siteName || data.orgName} · Built with Collarone</div>
        </footer>
      </div>
    </CartProvider>
  );
}
