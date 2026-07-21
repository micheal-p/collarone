// Public-site rendering.
//
// Every theme used to share three identical skeletons with only the accent
// colour swapped — ten coats of paint, not ten themes. Each theme now owns a
// VARIANT: a deliberate set of design decisions (hero composition, card
// language, button shape, nav treatment, type scale) consumed by every block,
// so Boutique Noir is an editorial dark boutique, Market Fresh is friendly
// rounded commerce, Corporate Clean is a conservative firm site — from the
// same honest renderer the theme previews use.
//
// Commercial blocks are wired to the platform: product cards raise CRM
// enquiries ("[Product enquiry] …" lands in the Messages inbox), the
// subscribe block captures mailing-list emails as CRM contacts, and the
// contact form was already a lead. PublicSite beacons per-page site_visits.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiPost, DEMO } from '../../api/client.js';
import { waDigits } from '../../lib/whatsapp.js';

// Each theme owns a real typeface pairing (display + body, loaded from Google
// Fonts) — three shared system stacks made ten themes read as one site.
const THEME_FONTS = {
  'storefront-classic':    { display: "'Sora', sans-serif",               body: "'Inter', sans-serif",         q: 'family=Sora:wght@600;700;800&family=Inter:wght@400;500;600' },
  'boutique-noir':         { display: "'Cormorant Garamond', serif",      body: "'Jost', sans-serif",          q: 'family=Cormorant+Garamond:wght@500;600;700&family=Jost:wght@300;400;500' },
  'market-fresh':          { display: "'Baloo 2', sans-serif",            body: "'DM Sans', sans-serif",       q: 'family=Baloo+2:wght@600;700;800&family=DM+Sans:wght@400;500' },
  'launch-bold':           { display: "'Archivo', sans-serif",            body: "'Inter', sans-serif",         q: 'family=Archivo:wght@700;800;900&family=Inter:wght@400;500;600' },
  'minimal-pitch':         { display: "'Fraunces', serif",                body: "'Inter', sans-serif",         q: 'family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500' },
  'startup-gradient':      { display: "'Space Grotesk', sans-serif",      body: "'Inter', sans-serif",         q: 'family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500' },
  'feature-focus':         { display: "'Manrope', sans-serif",            body: "'Manrope', sans-serif",       q: 'family=Manrope:wght@400;600;800' },
  'corporate-clean':       { display: "'IBM Plex Serif', serif",          body: "'IBM Plex Sans', sans-serif", q: 'family=IBM+Plex+Serif:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600' },
  'agency-modern':         { display: "'Archivo Black', sans-serif",      body: "'Archivo', sans-serif",       q: 'family=Archivo+Black&family=Archivo:wght@400;500;600' },
  'professional-services': { display: "'Lora', serif",                    body: "'Source Sans 3', sans-serif", q: 'family=Lora:wght@500;600&family=Source+Sans+3:wght@400;600' },
};

// The craft layer shared by every theme — injected once. Real CSS (hover
// states, pseudo-elements, media queries) that inline styles can't express.
// All motion dies under prefers-reduced-motion.
const SITE_CSS = `
  .cs-btn { transition: transform .18s ease, filter .18s ease, box-shadow .18s ease; }
  .cs-btn:hover { transform: translateY(-2px); filter: brightness(1.06); box-shadow: 0 10px 24px rgba(10,12,18,0.18); }
  .cs-card { transition: transform .35s cubic-bezier(.2,.7,.3,1), box-shadow .35s cubic-bezier(.2,.7,.3,1); }
  .cs-card:hover { transform: translateY(-6px); box-shadow: 0 20px 44px rgba(10,12,18,0.14); }
  .cs-imgzoom { overflow: hidden; }
  .cs-imgzoom img { transition: transform .6s cubic-bezier(.2,.7,.3,1); }
  .cs-card:hover .cs-imgzoom img { transform: scale(1.06); }
  .cs-nl { position: relative; }
  .cs-nl::after { content: ''; position: absolute; left: 0; bottom: -5px; height: 2px; width: 0; background: var(--site-accent-ui); transition: width .25s ease; }
  .cs-nl:hover::after { width: 100%; }
  @keyframes cs-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  .cs-hero-in > * { animation: cs-rise .65s cubic-bezier(.2,.7,.3,1) both; }
  .cs-hero-in > *:nth-child(2) { animation-delay: .1s; }
  .cs-hero-in > *:nth-child(3) { animation-delay: .2s; }
  .cs-hero-in > *:nth-child(4) { animation-delay: .3s; }

  /* sticky translucent nav — every theme */
  .cs-nav { position: sticky; top: 0; z-index: 40; display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
    padding: 15px clamp(20px, 4vw, 48px); border-bottom: 1px solid var(--site-line);
    background: color-mix(in srgb, var(--site-bg) 80%, transparent); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
  .cs-wordmark { display: flex; align-items: center; gap: 10px; font-family: var(--site-font-display); font-weight: 700; font-size: 19px; }
  .cs-navlinks { margin-left: auto; display: flex; align-items: center; gap: clamp(16px, 2.6vw, 32px); flex-wrap: wrap; justify-content: flex-end; }

  /* store announcement bar (from the merchant's tagline) */
  .cs-root { overflow-x: clip; }
  .cs-announce { text-align: center; font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase;
    padding: 8px 16px; background: var(--site-fg); color: var(--site-bg); }

  /* oversized pull quote */
  .cs-pull { position: relative; padding-top: 34px !important; }
  .cs-pull::before { content: '\\201C'; position: absolute; top: -6px; left: 50%; transform: translateX(-50%);
    font-family: Georgia, serif; font-size: 84px; line-height: 1; color: var(--site-accent-ui); opacity: .35; }

  /* giant closing-band type */
  .cs-cta-h { letter-spacing: -0.01em; }

  /* product meta row */
  .cs-prow { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }

  @media (prefers-reduced-motion: reduce) {
    .cs-btn, .cs-card, .cs-imgzoom img, .cs-nl::after { transition: none !important; }
    .cs-hero-in > * { animation: none !important; }
  }
`;

// Load the theme's Google Fonts + the shared polish stylesheet into <head>.
function useThemeAssets(theme) {
  useEffect(() => {
    const fonts = THEME_FONTS[theme?.key];
    if (fonts && !document.getElementById(`cs-fonts-${theme.key}`)) {
      if (!document.getElementById('cs-fonts-preconnect')) {
        const pre = document.createElement('link');
        pre.id = 'cs-fonts-preconnect';
        pre.rel = 'preconnect'; pre.href = 'https://fonts.gstatic.com'; pre.crossOrigin = 'anonymous';
        document.head.appendChild(pre);
      }
      const link = document.createElement('link');
      link.id = `cs-fonts-${theme.key}`;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${fonts.q}&display=swap`;
      document.head.appendChild(link);
    }
    if (!document.getElementById('cs-site-style')) {
      const style = document.createElement('style');
      style.id = 'cs-site-style';
      style.textContent = SITE_CSS;
      document.head.appendChild(style);
    }
  }, [theme?.key]);
}

/* ---- the design decisions each theme owns ------------------------------- */
/* Beyond buttons and fonts, each theme owns a COMPOSITION:
   h2Mode  — how section headings are set (center / center-rule / left-kicker /
             pill / index) — the single loudest "different site" signal
   band    — section backgrounds: none (whitespace), alt (white/grey stripes),
             tint (accent-washed stripes)
   secPad  — vertical rhythm: airy boutiques vs compact markets
   ctaMode — the call-to-action band: surface / accent / gradient / invert
   footerMode — simple line / corporate columns / centered serif / agency caps */
const DEFAULT_VARIANT = {
  hero: 'overlay', card: 'bordered', btnRadius: 8, navCaps: false, narrow: false, display: 1, headingWeight: 700,
  h2Mode: 'center', band: 'none', secPad: 56, ctaMode: 'surface', footerMode: 'simple',
};
const VARIANTS = {
  // ecommerce
  'storefront-classic':    { hero: 'overlay',   card: 'bordered', btnRadius: 8,   headingWeight: 700,
                             h2Mode: 'left-kicker', band: 'alt', secPad: 56, ctaMode: 'accent', footerMode: 'columns' },
  'boutique-noir':         { hero: 'editorial', card: 'minimal',  btnRadius: 0,   navCaps: true, display: 1.12, headingWeight: 500,
                             h2Mode: 'center-rule', band: 'none', secPad: 88, ctaMode: 'surface', footerMode: 'serif' },
  'market-fresh':          { hero: 'split',     card: 'rounded',  btnRadius: 999, display: 1.05, headingWeight: 800,
                             h2Mode: 'pill', band: 'tint', secPad: 48, ctaMode: 'accent', footerMode: 'simple' },
  // landing
  'launch-bold':           { hero: 'full',      card: 'bordered', btnRadius: 4,   display: 1.3, headingWeight: 800,
                             h2Mode: 'center', band: 'none', secPad: 64, ctaMode: 'accent', footerMode: 'simple' },
  'minimal-pitch':         { hero: 'minimal',   card: 'plain',    btnRadius: 8,   narrow: true, display: 0.92, headingWeight: 600,
                             h2Mode: 'center-rule', band: 'none', secPad: 72, ctaMode: 'surface', footerMode: 'simple' },
  'startup-gradient':      { hero: 'gradient',  card: 'glass',    btnRadius: 999, display: 1.1, headingWeight: 800,
                             h2Mode: 'center', band: 'none', secPad: 64, ctaMode: 'gradient', footerMode: 'simple' },
  'feature-focus':         { hero: 'overlay',   card: 'zigzag',   btnRadius: 10,  headingWeight: 700,
                             h2Mode: 'left-kicker', band: 'alt', secPad: 56, ctaMode: 'accent', footerMode: 'simple' },
  // company
  'corporate-clean':       { hero: 'boxed',     card: 'bordered', btnRadius: 4,   display: 0.9, headingWeight: 700,
                             h2Mode: 'left-kicker', band: 'alt', secPad: 56, ctaMode: 'accent', footerMode: 'columns' },
  'agency-modern':         { hero: 'editorial', card: 'minimal',  btnRadius: 0,   navCaps: true, display: 1.25, headingWeight: 800, btnInvert: true,
                             h2Mode: 'index', band: 'none', secPad: 84, ctaMode: 'invert', footerMode: 'caps' },
  'professional-services': { hero: 'minimal',   card: 'bordered', btnRadius: 8,   display: 0.95, headingWeight: 600,
                             h2Mode: 'center-rule', band: 'alt', secPad: 64, ctaMode: 'surface', footerMode: 'serif' },
};
const variantFor = (theme) => ({ ...DEFAULT_VARIANT, ...(VARIANTS[theme?.key] || {}) });

// darken a hex for gradients/hover without a colour library
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (x) => Math.max(0, Math.min(255, Math.round(x * (1 + amt))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`;
}

// relative luminance of a hex colour — enough to know "is this readable on ink"
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

function useThemeVars(theme) {
  return useMemo(() => {
    const dark = theme.tone === 'dark';
    const accent = theme.accentColor || theme.accent;
    const fonts = THEME_FONTS[theme.key];
    return {
      '--site-accent': accent,
      // accent used as TEXT or thin borders: a near-black accent (Agency
      // Modern) vanishes on a dark surface — fall back to paper-white there.
      '--site-accent-ui': dark && lum(accent) < 0.22 ? '#f2f2f2' : accent,
      '--site-accent-dark': shade(theme.accentColor || theme.accent, -0.25),
      '--site-bg': dark ? '#0d0f14' : '#ffffff',
      '--site-fg': dark ? '#f2f2f2' : '#14161a',
      '--site-muted': dark ? '#a5a5ad' : '#5c5f66',
      '--site-surface': dark ? '#181b21' : '#f7f7f8',
      '--site-line': dark ? '#2a2e37' : '#e7e7ea',
      // themes without a THEME_FONTS entry (a future 11th) fall back to the
      // system stack — one fallback, not a parallel font system
      '--site-font': fonts?.body || 'system-ui, -apple-system, sans-serif',
      '--site-font-display': fonts?.display || 'Georgia, serif',
    };
  }, [theme]);
}

const btnStyle = (v, filled = true) => ({
  display: 'inline-block', padding: '15px 34px', borderRadius: v.btnRadius, textDecoration: 'none',
  fontWeight: 650, fontSize: 15, cursor: 'pointer', border: '1px solid transparent',
  ...(filled
    // btnInvert (Agency Modern): the accent is near-black, so a filled accent
    // button disappears on the dark surface — the editorial answer is a
    // white button with ink text.
    ? (v.btnInvert
      ? { background: '#ffffff', color: '#111318' }
      : { background: 'var(--site-accent)', color: '#fff' })
    : { background: 'transparent', color: 'var(--site-fg)', borderColor: 'var(--site-line)' }),
  ...(v.navCaps ? { textTransform: 'uppercase', letterSpacing: '.12em', fontSize: 12.5 } : {}),
});

const secWidth = (v, base = 960) => (v.narrow ? Math.min(base, 660) : base);

// Full-bleed section wrapper: owns the theme's vertical rhythm and band
// pattern (the background must bleed edge-to-edge, so the max-width lives on
// an inner div, not the section itself). `i` is the block's index on the page.
function Sec({ v, i = 0, w = 960, style, children }) {
  const band =
    v.band === 'alt' ? (i % 2 ? 'var(--site-surface)' : 'transparent')
    : v.band === 'tint' ? (i % 2 ? 'color-mix(in srgb, var(--site-accent) 6%, var(--site-bg))' : 'transparent')
    : 'transparent';
  return (
    <section style={{ background: band, padding: `${v.secPad}px 24px`, ...style }}>
      <div style={{ maxWidth: secWidth(v, w), margin: '0 auto' }}>{children}</div>
    </section>
  );
}

// Section headings are the loudest "this is a different site" signal — five
// distinct treatments, chosen per theme.
const H2 = ({ v, children, align = 'center', kicker, i }) => {
  const size = `clamp(${22 * v.display}px, ${3 * v.display}vw, ${28 * v.display}px)`;
  const base = { fontSize: size, margin: '0 0 24px', fontFamily: 'var(--site-font-display)', fontWeight: v.headingWeight, ...(v.navCaps ? { letterSpacing: '.04em' } : {}) };

  if (v.h2Mode === 'left-kicker') {
    return (
      <div style={{ marginBottom: 26 }}>
        {kicker && <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--site-accent-ui)', marginBottom: 8 }}>{kicker}</div>}
        <h2 style={{ ...base, margin: 0, textAlign: 'left' }}>{children}</h2>
        <div style={{ width: 44, height: 3, background: 'var(--site-accent-ui)', marginTop: 12 }} />
      </div>
    );
  }
  if (v.h2Mode === 'center-rule') {
    // Respect an explicit left alignment (arbitrary customer text blocks) —
    // the rule follows the alignment.
    const left = align === 'left';
    return (
      <div style={{ textAlign: left ? 'left' : 'center', marginBottom: 28 }}>
        <div style={{ width: 30, height: 2, background: 'var(--site-accent-ui)', margin: left ? '0 0 16px' : '0 auto 16px' }} />
        <h2 style={{ ...base, margin: 0, letterSpacing: '.02em' }}>{children}</h2>
        {kicker && <div style={{ fontSize: 12.5, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--site-muted)', marginTop: 10 }}>{kicker}</div>}
      </div>
    );
  }
  if (v.h2Mode === 'pill') {
    const left = align === 'left';
    return (
      <div style={{ textAlign: left ? 'left' : 'center', marginBottom: 26 }}>
        {kicker && <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', background: 'color-mix(in srgb, var(--site-accent) 14%, var(--site-bg))', color: 'var(--site-accent-ui)', borderRadius: 999, padding: '5px 14px', marginBottom: 12 }}>{kicker}</span>}
        <h2 style={{ ...base, margin: 0 }}>{children}</h2>
      </div>
    );
  }
  if (v.h2Mode === 'index') {
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, borderTop: '1px solid var(--site-line)', paddingTop: 22, marginBottom: 34 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.18em', color: 'var(--site-muted)', flexShrink: 0 }}>{String((i ?? 0) + 1).padStart(2, '0')} /</span>
        <h2 style={{ ...base, margin: 0, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.06em' }}>{children}</h2>
      </div>
    );
  }
  return <h2 style={{ ...base, textAlign: align, marginBottom: 24 }}>{children}</h2>;
};

/* ---- hero ------------------------------------------------------------------ */
function Hero({ c, v, site }) {
  const img = c.image_url;
  const h1Size = `clamp(${30 * v.display}px, ${6 * v.display}vw, ${46 * v.display}px)`;
  // stores surface the tagline in the announcement bar — no double-billing
  const eyebrow = site?.theme?.category === 'ecommerce' ? '' : (site?.tagline || '').trim();
  const button = c.button_text && (
    <a className="cs-btn" href={c.button_link || '#'} style={{ ...btnStyle(v), boxShadow: img || v.hero === 'gradient' ? '0 10px 28px rgba(0,0,0,0.3)' : 'none' }}>{c.button_text}</a>
  );

  if (v.hero === 'editorial') {
    return (
      <section style={{
        position: 'relative', minHeight: 'min(86vh, 820px)', display: 'flex', alignItems: 'flex-end', padding: 'clamp(28px, 5vw, 72px)',
        ...(img ? { backgroundImage: `linear-gradient(100deg, rgba(6,7,10,0.82) 8%, rgba(6,7,10,0.22) 60%, rgba(6,7,10,0.5)), url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center', color: '#fff' } : { background: 'var(--site-surface)' }),
      }}>
        <div className="cs-hero-in" style={{ maxWidth: 680 }}>
          {eyebrow && <div style={{ fontSize: 12, letterSpacing: '.34em', textTransform: 'uppercase', color: img ? 'rgba(255,255,255,0.75)' : 'var(--site-accent-ui)', marginBottom: 18 }}>— {eyebrow}</div>}
          <h1 style={{ fontSize: `clamp(${36 * v.display}px, ${7 * v.display}vw, ${62 * v.display}px)`, lineHeight: 1.02, margin: '0 0 16px', fontFamily: 'var(--site-font-display)', fontWeight: v.headingWeight, letterSpacing: '.01em' }}>{c.heading}</h1>
          {c.subheading && <p style={{ fontSize: 16.5, lineHeight: 1.65, color: img ? 'rgba(255,255,255,0.82)' : 'var(--site-muted)', maxWidth: 480, margin: '0 0 28px' }}>{c.subheading}</p>}
          {button}
        </div>
      </section>
    );
  }

  if (v.hero === 'split') {
    return (
      <section style={{ display: 'grid', gridTemplateColumns: img ? 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' : '1fr', minHeight: 'min(74vh, 700px)' }}>
        <div className="cs-hero-in" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'clamp(28px, 5vw, 64px)', background: 'color-mix(in srgb, var(--site-accent) 7%, var(--site-bg))' }}>
          {eyebrow && <span style={{ alignSelf: 'flex-start', fontSize: 12.5, fontWeight: 800, background: 'var(--site-accent)', color: '#fff', borderRadius: 999, padding: '6px 16px', marginBottom: 20 }}>{eyebrow}</span>}
          <h1 style={{ fontSize: h1Size, lineHeight: 1.08, margin: '0 0 14px', fontFamily: 'var(--site-font-display)', fontWeight: v.headingWeight }}>{c.heading}</h1>
          {c.subheading && <p style={{ fontSize: 16.5, lineHeight: 1.65, color: 'var(--site-muted)', margin: '0 0 26px', maxWidth: 440 }}>{c.subheading}</p>}
          <div>{button}</div>
        </div>
        {img && <div style={{ backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center', minHeight: 300 }} />}
      </section>
    );
  }

  if (v.hero === 'gradient') {
    return (
      <section style={{
        padding: 'clamp(100px, 17vw, 170px) 24px', textAlign: 'center', color: '#fff',
        background: `radial-gradient(700px 340px at 20% 0%, rgba(255,255,255,0.14), transparent 60%), radial-gradient(600px 320px at 90% 100%, rgba(0,0,0,0.25), transparent 60%), linear-gradient(135deg, var(--site-accent) 0%, var(--site-accent-dark) 100%)`,
      }}>
        <div className="cs-hero-in">
        <h1 style={{ fontSize: h1Size, lineHeight: 1.08, margin: '0 0 16px', fontFamily: 'var(--site-font-display)', fontWeight: v.headingWeight, textShadow: '0 1px 8px rgba(0,0,0,0.15)' }}>{c.heading}</h1>
        {c.subheading && <p style={{ fontSize: 17, lineHeight: 1.6, color: 'rgba(255,255,255,0.86)', maxWidth: 560, margin: '0 auto 30px' }}>{c.subheading}</p>}
        {c.button_text && <a className="cs-btn" href={c.button_link || '#'} style={{ ...btnStyle(v), background: '#fff', color: 'var(--site-accent-dark)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}>{c.button_text}</a>}
        </div>
      </section>
    );
  }

  if (v.hero === 'minimal') {
    return (
      <section className="cs-hero-in" style={{ padding: 'clamp(96px, 15vw, 150px) 24px', textAlign: 'center' }}>
        <div style={{ width: 34, height: 3, background: 'var(--site-accent-ui)', margin: '0 auto 30px' }} />
        <h1 style={{ fontSize: h1Size, lineHeight: 1.14, margin: '0 auto 16px', maxWidth: 640, fontFamily: 'var(--site-font-display)', fontWeight: v.headingWeight }}>{c.heading}</h1>
        {c.subheading && <p style={{ fontSize: 16.5, lineHeight: 1.7, color: 'var(--site-muted)', maxWidth: 520, margin: '0 auto 30px' }}>{c.subheading}</p>}
        {button}
      </section>
    );
  }

  if (v.hero === 'boxed') {
    return (
      <section style={{ borderBottom: '1px solid var(--site-line)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(40px, 7vw, 64px) 24px', display: 'grid', gridTemplateColumns: img ? '1.2fr minmax(220px, 0.8fr)' : '1fr', gap: 36, alignItems: 'center' }}>
          <div className="cs-hero-in">
            <h1 style={{ fontSize: h1Size, lineHeight: 1.15, margin: '0 0 14px', fontFamily: 'var(--site-font-display)', fontWeight: v.headingWeight }}>{c.heading}</h1>
            {c.subheading && <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--site-muted)', margin: '0 0 24px', maxWidth: 480 }}>{c.subheading}</p>}
            {button}
          </div>
          {img && <img src={img} alt="" style={{ width: '100%', borderRadius: 6, border: '1px solid var(--site-line)', objectFit: 'cover', aspectRatio: '4/3' }} />}
        </div>
      </section>
    );
  }

  // 'overlay' and 'full'
  const tall = v.hero === 'full';
  return (
    <section style={{
      padding: img ? `clamp(${tall ? 140 : 100}px, ${tall ? 23 : 18}vw, ${tall ? 240 : 180}px) 24px` : 'clamp(72px, 12vw, 110px) 24px', textAlign: 'center',
      ...(img ? { backgroundImage: `linear-gradient(165deg, color-mix(in srgb, var(--site-accent) ${tall ? 42 : 28}%, rgba(8,10,16,0.92)) 0%, rgba(8,10,16,0.5) 55%, rgba(8,10,16,0.68) 100%), url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center', color: '#fff' } : {}),
    }}>
      <div className="cs-hero-in">
      <h1 style={{ fontSize: tall ? `clamp(42px, 9vw, 84px)` : h1Size, lineHeight: 1.1, margin: '0 0 14px', fontFamily: 'var(--site-font-display)', fontWeight: v.headingWeight, ...(img ? { textShadow: '0 2px 18px rgba(0,0,0,0.35)' } : {}) }}>{c.heading}</h1>
      {c.subheading && <p style={{ fontSize: 'clamp(15px, 2.4vw, 18px)', color: img ? 'rgba(255,255,255,0.88)' : 'var(--site-muted)', maxWidth: 560, margin: '0 auto 26px', lineHeight: 1.6 }}>{c.subheading}</p>}
      {button}
      </div>
    </section>
  );
}

/* ---- features --------------------------------------------------------------- */
function Features({ c, v, i: si }) {
  const items = c.items || [];
  if (v.card === 'zigzag') {
    return (
      <Sec v={v} i={si} w={860}>
        {c.heading && <H2 v={v} i={si} kicker="What you get">{c.heading}</H2>}
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 26, alignItems: 'flex-start', flexDirection: i % 2 ? 'row-reverse' : 'row', padding: '26px 0', borderTop: i > 0 ? '1px solid var(--site-line)' : 'none' }}>
            <div style={{ fontSize: 44, fontWeight: 800, color: 'var(--site-accent)', opacity: 0.25, lineHeight: 1, fontFamily: 'var(--site-font)', flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</div>
            <div style={{ textAlign: i % 2 ? 'right' : 'left' }}>
              <h3 style={{ fontSize: 17, margin: '4px 0 8px', fontWeight: 700 }}>{it.title}</h3>
              <p style={{ fontSize: 14, color: 'var(--site-muted)', margin: 0, lineHeight: 1.65 }}>{it.body}</p>
            </div>
          </div>
        ))}
      </Sec>
    );
  }
  const cardStyles = {
    bordered: { padding: 20, background: 'var(--site-surface)', border: '1px solid var(--site-line)', borderRadius: Math.min(v.btnRadius === 999 ? 18 : v.btnRadius + 6, 18) },
    rounded: { padding: 24, background: 'var(--site-surface)', borderRadius: 20, boxShadow: '0 10px 30px rgba(20,22,26,0.07)' },
    glass: { padding: 22, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16, backdropFilter: 'blur(8px)' },
    minimal: { padding: '20px 0 0', borderTop: '2px solid var(--site-accent-ui)' },
    plain: { padding: 0 },
  };
  return (
    <Sec v={v} i={si}>
      {c.heading && <H2 v={v} i={si} kicker="What you get">{c.heading}</H2>}
      <div style={{ display: 'grid', gridTemplateColumns: v.narrow ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: v.card === 'minimal' ? 32 : 20 }}>
        {items.map((it, i) => (
          <div key={i} className={['bordered','rounded','glass'].includes(v.card) ? 'cs-card' : undefined} style={{ ...(cardStyles[v.card] || cardStyles.bordered), ...(v.narrow ? { textAlign: 'center' } : {}) }}>
            <h3 style={{ fontSize: 16, margin: '0 0 8px', fontWeight: 700, ...(v.navCaps ? { textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 13.5 } : {}) }}>{it.title}</h3>
            <p style={{ fontSize: 13.5, color: 'var(--site-muted)', margin: 0, lineHeight: 1.65 }}>{it.body}</p>
          </div>
        ))}
      </div>
    </Sec>
  );
}

/* ---- cart ---------------------------------------------------------------------
   Real store behaviour without demanding the merchant owns a payment
   gateway: the cart builds an order, checkout takes the customer's details,
   and payment is bank transfer to the merchant's own account (details shown
   after ordering, proof sent on WhatsApp) or cash on delivery. */
const CartCtx = createContext(null);
const fmtN = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;

function CartProvider({ slug, children }) {
  const storageKey = `collarone_cart_${slug}`;
  const [items, setItems] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const [open, setOpen] = useState(false);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(items)); } catch { /* private mode */ } }, [items, storageKey]);

  const add = (p) => {
    setItems((s) => {
      const found = s.find((x) => x.id === p.id);
      return found ? s.map((x) => (x.id === p.id ? { ...x, qty: Math.min(99, x.qty + 1) } : x))
                   : [...s, { id: p.id, name: p.name, price: p.price || 0, imageUrl: p.imageUrl || '', qty: 1 }];
    });
    setOpen(true);
  };
  const setQty = (id, qty) => setItems((s) => (qty < 1 ? s.filter((x) => x.id !== id) : s.map((x) => (x.id === id ? { ...x, qty: Math.min(99, qty) } : x))));
  const clear = () => setItems([]);
  const total = items.reduce((sum, x) => sum + (x.price || 0) * x.qty, 0);
  const count = items.reduce((sum, x) => sum + x.qty, 0);

  return <CartCtx.Provider value={{ items, add, setQty, clear, total, count, open, setOpen }}>{children}</CartCtx.Provider>;
}

function CartButton({ v }) {
  const cart = useContext(CartCtx);
  if (!cart) return null;
  return (
    <button onClick={() => cart.setOpen(true)} aria-label="Open cart"
      style={{ ...btnStyle(v), padding: '8px 16px', fontSize: v.navCaps ? 11.5 : 13, display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3.5h3l2.6 12h10.4l2-8.5H6.2" /></svg>
      Cart{cart.count > 0 && <span style={{ background: v.btnInvert ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.25)', borderRadius: 999, padding: '1px 8px', fontSize: 11.5, fontWeight: 800 }}>{cart.count}</span>}
    </button>
  );
}

function CartDrawer({ site, v }) {
  const cart = useContext(CartCtx);
  const [view, setView] = useState('cart'); // cart | checkout | done
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '', note: '', method: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const set = (k, val) => setF((s) => ({ ...s, [k]: val }));
  const pay = site.payments || { enableTransfer: true, enableCod: true };
  const methods = [
    // Demo builds have no /api/site-pay and their order stub has no orderId —
    // card checkout would dead-end, so it's not offered there.
    pay.enableCard && !DEMO && ['card', 'Pay with card', 'Card, bank or USSD — secure checkout by Paystack, straight to the store.'],
    pay.enableTransfer && ['transfer', 'Bank transfer', 'Pay into the store’s account — details shown after you order.'],
    pay.enableCod && ['cod', 'Pay on delivery', 'Pay cash or transfer when your order arrives.'],
  ].filter(Boolean);
  const wa = waDigits(site.contactWhatsapp);

  if (!cart || !cart.open) return null;

  const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', border: '1px solid #dcdce0', background: '#fff', color: '#14161a' };
  const label = { display: 'block', fontSize: 12.5, color: '#5c5f66', margin: '0 0 4px' };

  const placeOrder = async (e) => {
    e.preventDefault();
    if (site.isPreview) return setError('This is a preview — ordering switches on when the site is published.');
    if (!f.name.trim()) return setError('Your name is required.');
    if (!f.phone.trim()) return setError('Your phone number is required — it’s how the store reaches you.');
    if (!f.method) return setError('Choose how you want to pay.');
    if (f.method === 'card' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return setError('A valid email is required for card payment — your receipt goes there.');
    setBusy(true); setError('');
    try {
      const d = await apiPost('/site/order', {
        orgSlug: site.slug, name: f.name, phone: f.phone, email: f.email, address: f.address, note: f.note,
        method: f.method, items: cart.items.map((x) => ({ id: x.id, qty: x.qty })),
      });
      if (f.method === 'card') {
        // Hand over to the store's own Paystack checkout; the callback lands
        // back on this site with ?payref=… which PublicSite verifies.
        const r = await fetch('/api/site-pay', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'init', orgSlug: site.slug, orderId: d.orderId }),
        });
        const pd = await r.json().catch(() => ({}));
        if (!r.ok || !pd.authorizationUrl) throw new Error(pd.message || `Could not start the card payment — your order ${d.orderNo} is saved, choose another payment method or contact the store.`);
        // Cart is kept: an abandoned Paystack page returns to an intact cart.
        // PublicSite clears it once the payment verifies as paid.
        window.location.href = pd.authorizationUrl;
        return;
      }
      setReceipt(d);
      cart.clear();
      setView('done');
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  };

  const close = () => { cart.setOpen(false); if (view === 'done') { setView('cart'); setReceipt(null); setF({ name: '', phone: '', email: '', address: '', note: '', method: '' }); } };

  return (
    <div onMouseDown={close} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(10,12,18,0.55)' }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(430px, 96vw)', background: '#fff', color: '#14161a', boxShadow: '-24px 0 70px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #ececef' }}>
          <strong style={{ fontSize: 15.5 }}>{view === 'done' ? 'Order placed' : view === 'checkout' ? 'Checkout' : 'Your cart'}</strong>
          <button onClick={close} aria-label="Close cart" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5c5f66', padding: 4 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {view === 'cart' && (
            cart.items.length === 0 ? (
              <p style={{ fontSize: 14, color: '#5c5f66', textAlign: 'center', marginTop: 40 }}>Your cart is empty — add something you like.</p>
            ) : cart.items.map((x) => (
              <div key={x.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f0f2' }}>
                {x.imageUrl
                  ? <img src={x.imageUrl} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 52, height: 52, borderRadius: 8, background: '#f2f2f4', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name}</div>
                  <div style={{ fontSize: 12.5, color: '#5c5f66', marginTop: 2 }}>{fmtN(x.price)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => cart.setQty(x.id, x.qty - 1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #dcdce0', background: '#fff', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>−</button>
                  <span style={{ width: 22, textAlign: 'center', fontSize: 13.5, fontWeight: 650 }}>{x.qty}</span>
                  <button onClick={() => cart.setQty(x.id, x.qty + 1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #dcdce0', background: '#fff', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>+</button>
                </div>
              </div>
            ))
          )}

          {view === 'checkout' && (
            <form onSubmit={placeOrder} id="co-checkout">
              <div style={{ marginBottom: 10 }}><span style={label}>Your name *</span><input style={input} value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></div>
              <div style={{ marginBottom: 10 }}><span style={label}>Phone / WhatsApp *</span><input style={input} value={f.phone} onChange={(e) => set('phone', e.target.value)} required placeholder="0801 234 5678" /></div>
              <div style={{ marginBottom: 10 }}><span style={label}>Delivery address</span><textarea style={{ ...input, resize: 'vertical' }} rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div><span style={label}>Email{f.method === 'card' ? ' *' : ''}</span><input style={input} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required={f.method === 'card'} /></div>
                <div><span style={label}>Note to the store</span><input style={input} value={f.note} onChange={(e) => set('note', e.target.value)} /></div>
              </div>
              <span style={{ ...label, marginBottom: 8 }}>How will you pay? *</span>
              {methods.map(([key, title, desc]) => (
                <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: `1.5px solid ${f.method === key ? 'var(--site-accent, #FF5B1F)' : '#e2e2e6'}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8, cursor: 'pointer' }}>
                  <input type="radio" name="method" checked={f.method === key} onChange={() => set('method', key)} style={{ marginTop: 3 }} />
                  <span>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700 }}>{title}</span>
                    <span style={{ display: 'block', fontSize: 12, color: '#5c5f66', marginTop: 2 }}>{desc}</span>
                  </span>
                </label>
              ))}
              {methods.length === 0 && <p style={{ fontSize: 13, color: '#5c5f66' }}>This store takes orders on WhatsApp — use the button below.</p>}
              {error && <p style={{ color: '#c0392b', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
            </form>
          )}

          {view === 'done' && receipt && (
            <div>
              <div style={{ textAlign: 'center', padding: '10px 0 18px' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1a7a3e" strokeWidth="2" strokeLinecap="round" style={{ margin: '0 auto 10px', display: 'block' }}><circle cx="12" cy="12" r="9.5" /><path d="M8 12.5l2.7 2.7L16 9.5" /></svg>
                <div style={{ fontSize: 17, fontWeight: 750 }}>Order {receipt.orderNo}</div>
                <div style={{ fontSize: 13.5, color: '#5c5f66', marginTop: 4 }}>
                  {Number(receipt.deliveryFee) > 0 && <>Items {fmtN(receipt.subtotal)} + delivery {fmtN(receipt.deliveryFee)} · </>}
                  Total: <strong style={{ color: '#14161a' }}>{fmtN(receipt.total)}</strong>
                </div>
              </div>
              {receipt.method === 'transfer' && receipt.bank && (
                <div style={{ border: '1px solid #e2e2e6', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5c5f66', marginBottom: 10 }}>Pay by transfer</div>
                  {receipt.bank.accountNumber ? (
                    <>
                      <div style={{ fontSize: 14, lineHeight: 1.9 }}>
                        <div><span style={{ color: '#5c5f66' }}>Bank:</span> <strong>{receipt.bank.bankName || '—'}</strong></div>
                        <div><span style={{ color: '#5c5f66' }}>Account name:</span> <strong>{receipt.bank.accountName || '—'}</strong></div>
                        <div><span style={{ color: '#5c5f66' }}>Account number:</span> <strong style={{ fontSize: 16, letterSpacing: '.04em' }}>{receipt.bank.accountNumber}</strong></div>
                        <div><span style={{ color: '#5c5f66' }}>Amount:</span> <strong>{fmtN(receipt.total)}</strong></div>
                      </div>
                      {receipt.bank.note && <p style={{ fontSize: 12.5, color: '#5c5f66', margin: '10px 0 0' }}>{receipt.bank.note}</p>}
                    </>
                  ) : (
                    <p style={{ fontSize: 13.5, color: '#5c5f66', margin: 0 }}>The store will send you their account details on WhatsApp or by phone.</p>
                  )}
                </div>
              )}
              {receipt.method === 'cod' && (
                <p style={{ fontSize: 13.5, color: '#5c5f66', lineHeight: 1.65, border: '1px solid #e2e2e6', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  You'll pay when your order arrives. The store will call <strong>{f.phone}</strong> to confirm delivery.
                </p>
              )}
              {wa && (
                <a target="_blank" rel="noreferrer"
                  href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hello ${site.siteName || site.orgName}, I just placed order ${receipt.orderNo} for ${fmtN(receipt.total)}${receipt.method === 'transfer' ? ' — I will send my transfer proof here.' : ' (pay on delivery).'}`)}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#1FAF54', color: '#fff', borderRadius: 10, padding: '13px 0', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.2 14.2c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-3-.9-5-3.6-5.6-4.5-.5-.8-1-1.9-1-2.9 0-1 .5-1.5.7-1.7.3-.3.9-.3 1.1-.2.2 0 .5.1.7.6l.7 1.7c.1.2 0 .5-.1.6l-.5.6c-.1.2-.2.3 0 .6.5.8 1.6 2 3 2.6.3.1.5.1.7-.1l.7-.9c.2-.2.4-.2.6-.1l1.8.8c.3.2.5.3.5.5s0 .8-.2 1.3z"/></svg>
                  {receipt.method === 'transfer' ? 'Send payment proof on WhatsApp' : 'Confirm your order on WhatsApp'}
                </a>
              )}
            </div>
          )}
        </div>

        {view !== 'done' && cart.items.length > 0 && (() => {
          // mirror of the server's fee rule — the server total is authoritative
          const del = site.delivery || {};
          const fee = Number(del.feeNaira) > 0 && (del.freeAbove == null || cart.total < Number(del.freeAbove)) ? Number(del.feeNaira) : 0;
          const toFree = fee > 0 && del.freeAbove != null ? Number(del.freeAbove) - cart.total : 0;
          const grand = cart.total + fee;
          return (
          <div style={{ borderTop: '1px solid #ececef', padding: 18 }}>
            {fee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: '#5c5f66' }}>
                <span>Subtotal</span><span>{fmtN(cart.total)}</span>
              </div>
            )}
            {fee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: '#5c5f66' }}>
                <span>Delivery</span><span>{fmtN(fee)}</span>
              </div>
            )}
            {fee > 0 && toFree > 0 && (
              <div style={{ fontSize: 12, color: '#1a6a1a', marginBottom: 6 }}>Add {fmtN(toFree)} more for free delivery.</div>
            )}
            {fee === 0 && Number(del.feeNaira) > 0 && (
              <div style={{ fontSize: 12, color: '#1a6a1a', marginBottom: 6 }}>Free delivery on this order.</div>
            )}
            {del.note && <div style={{ fontSize: 12, color: '#5c5f66', marginBottom: 6 }}>{del.note}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14.5, marginBottom: 12 }}>
              <span style={{ color: '#5c5f66' }}>Total</span>
              <strong>{fmtN(grand)}</strong>
            </div>
            {view === 'cart' ? (
              <button onClick={() => setView('checkout')} style={{ ...btnStyle(v), width: '100%', textAlign: 'center', border: 'none' }}>Checkout</button>
            ) : (
              site.isPreview ? (
                <div style={{ fontSize: 13, color: '#5c5f66', textAlign: 'center', lineHeight: 1.6, padding: '4px 6px' }}>
                  Preview mode — the cart works, and ordering switches on the moment this site is published.
                </div>
              ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setView('cart')} style={{ ...btnStyle(v, false), color: '#14161a', flex: '0 0 auto' }}>Back</button>
                <button form="co-checkout" disabled={busy} style={{ ...btnStyle(v), flex: 1, textAlign: 'center', border: 'none', opacity: busy ? 0.7 : 1 }}>
                  {busy ? (f.method === 'card' ? 'Opening secure payment…' : 'Placing order…') : f.method === 'card' ? `Pay ${fmtN(grand)} by card` : `Place order · ${fmtN(grand)}`}
                </button>
              </div>
              )
            )}
          </div>
          );
        })()}
        {view === 'done' && (
          <div style={{ borderTop: '1px solid #ececef', padding: 18 }}>
            <button onClick={close} style={{ ...btnStyle(v, false), width: '100%', textAlign: 'center', color: '#14161a' }}>Continue shopping</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- products (with cart + CRM enquiry + WhatsApp order) ---------------------- */
function ProductsSection({ c, site, v, i: si }) {
  const cart = useContext(CartCtx); // present on store sites; null elsewhere → Enquire fallback
  const [enquire, setEnquire] = useState(null); // product | null
  const products = (site.products || []).slice(0, c.limit > 0 ? c.limit : undefined);
  const wa = waDigits(site.contactWhatsapp);
  const money = (n) => `₦${Number(n).toLocaleString('en-NG')}`;

  const cardChrome = {
    bordered: { border: '1px solid var(--site-line)', borderRadius: 10, overflow: 'hidden', background: 'var(--site-surface)' },
    rounded: { borderRadius: 20, overflow: 'hidden', background: 'var(--site-surface)', boxShadow: '0 12px 32px rgba(20,22,26,0.08)' },
    minimal: {},
    glass: { border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' },
  }[v.card] || {};
  const imgRadius = v.card === 'minimal' ? 2 : 0;

  return (
    <Sec v={v} i={si} w={1000}>
      {c.heading && <H2 v={v} i={si} kicker="Shop">{c.heading}</H2>}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${v.card === 'minimal' ? 240 : 210}px, 1fr))`, gap: v.card === 'minimal' ? 32 : 18 }}>
        {products.map((p) => (
          <div key={p.id} className="cs-card" style={cardChrome}>
            <div className="cs-imgzoom" style={{ aspectRatio: v.card === 'minimal' ? '4/5' : '1/1', background: 'var(--site-surface)', overflow: 'hidden', borderRadius: imgRadius }}>
              {p.imageUrl
                ? <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--site-muted)', fontSize: 12 }}>No image</div>}
            </div>
            <div style={{ padding: v.card === 'minimal' ? '12px 0 0' : 14 }}>
              {v.card === 'rounded' ? (
                <>
                  <div style={{ fontWeight: 650, fontSize: 14.5 }}>{p.name}</div>
                  {p.price != null && <span style={{ display: 'inline-block', marginTop: 8, background: 'var(--site-accent)', color: '#fff', fontWeight: 700, fontSize: 12.5, borderRadius: 999, padding: '4px 12px' }}>{money(p.price)}</span>}
                </>
              ) : (
                <div className="cs-prow">
                  <div style={{ fontWeight: 650, fontSize: 14, minWidth: 0, ...(v.navCaps ? { textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 12.5 } : {}) }}>{p.name}</div>
                  {p.price != null && <div style={{ color: v.card === 'minimal' ? 'var(--site-fg)' : 'var(--site-accent-ui)', fontWeight: 650, fontSize: 13.5, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{money(p.price)}</div>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {cart ? (
                  <button onClick={() => cart.add(p)} style={{ ...btnStyle(v), padding: '9px 14px', fontSize: 12.5, flex: 1, textAlign: 'center', border: 'none' }}>
                    Add to cart
                  </button>
                ) : (
                  <button onClick={() => setEnquire(p)} style={{ ...btnStyle(v, false), padding: '8px 14px', fontSize: 12.5, flex: 1, textAlign: 'center', color: 'var(--site-accent-ui)', borderColor: 'var(--site-accent-ui)' }}>
                    Enquire
                  </button>
                )}
                {wa && (
                  <a target="_blank" rel="noreferrer" title="Order on WhatsApp"
                    href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hello ${site.siteName || site.orgName}, I want to order: ${p.name}${p.price != null ? ` (${money(p.price)})` : ''}`)}`}
                    style={{ ...btnStyle(v), padding: '8px 12px', fontSize: 12.5, background: '#1FAF54', display: 'inline-flex', alignItems: 'center', border: 'none' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.2 14.2c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-3-.9-5-3.6-5.6-4.5-.5-.8-1-1.9-1-2.9 0-1 .5-1.5.7-1.7.3-.3.9-.3 1.1-.2.2 0 .5.1.7.6l.7 1.7c.1.2 0 .5-.1.6l-.5.6c-.1.2-.2.3 0 .6.5.8 1.6 2 3 2.6.3.1.5.1.7-.1l.7-.9c.2-.2.4-.2.6-.1l1.8.8c.3.2.5.3.5.5s0 .8-.2 1.3z"/></svg>
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
        {products.length === 0 && <p style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--site-muted)' }}>No products listed yet.</p>}
      </div>
      {enquire && <EnquiryModal product={enquire} site={site} v={v} onClose={() => setEnquire(null)} />}
    </Sec>
  );
}

// Product enquiry → lands in the business's CRM Messages inbox with the
// product named, via the same public lead RPC as the contact form.
function EnquiryModal({ product, site, v, onClose }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', message: `I'm interested in ${product.name}. Is it available?` });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const set = (k, val) => setF((s) => ({ ...s, [k]: val }));
  const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', border: '1px solid #dcdce0', background: '#fff', color: '#14161a' };
  const label = { display: 'block', fontSize: 12.5, color: '#5c5f66', margin: '0 0 4px' };

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setError('Your name is required.');
    setBusy(true); setError('');
    try {
      const price = product.price != null ? ` (₦${Number(product.price).toLocaleString('en-NG')})` : '';
      await apiPost('/embed/lead', {
        orgSlug: site.slug, name: f.name, email: f.email, phone: f.phone,
        message: `[Product enquiry] ${product.name}${price} — ${f.message}`, source: 'product_enquiry',
      });
      setDone(true);
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  };

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(10,12,18,0.6)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(430px, 100%)', background: '#fff', color: '#14161a', borderRadius: 14, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.4)' }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '18px 4px' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Enquiry sent</div>
            <div style={{ fontSize: 13.5, color: '#5c5f66', lineHeight: 1.6 }}>Thanks {f.name.split(' ')[0]} — {site.siteName || site.orgName} has received your enquiry about {product.name} and will get back to you.</div>
            <button onClick={onClose} style={{ ...btnStyle(v), marginTop: 18 }}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 2 }}>Enquire about {product.name}</div>
            <p style={{ fontSize: 12.5, color: '#5c5f66', margin: '0 0 16px' }}>Send your details — the team replies on WhatsApp, call or email.</p>
            <div style={{ marginBottom: 10 }}><span style={label}>Your name *</span><input style={input} value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><span style={label}>Phone / WhatsApp</span><input style={input} value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
              <div><span style={label}>Email</span><input style={input} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
            </div>
            <div style={{ marginBottom: 14 }}><span style={label}>Message</span><textarea style={{ ...input, resize: 'vertical' }} rows={3} value={f.message} onChange={(e) => set('message', e.target.value)} /></div>
            {error && <p style={{ color: '#c0392b', fontSize: 13, margin: '0 0 10px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={{ ...btnStyle(v, false), color: '#14161a' }}>Cancel</button>
              <button disabled={busy} style={{ ...btnStyle(v), opacity: busy ? 0.7 : 1 }}>{busy ? 'Sending…' : 'Send enquiry'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ---- mailing-list signup → CRM contact ---------------------------------------- */
function SubscribeSection({ c, site, v, i: si }) {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email address.');
    setBusy(true); setError('');
    try {
      await apiPost('/embed/lead', {
        orgSlug: site.slug, name: email.split('@')[0], email, phone: '',
        message: '[Mailing list] Subscribed through the website.', source: 'subscribe',
      });
      setDone(true);
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  };

  return (
    <section style={{ padding: `${Math.min(v.secPad, 64)}px 24px`, background: v.hero === 'gradient' ? 'transparent' : 'var(--site-surface)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
        <H2 v={v} i={si} kicker="Newsletter">{c.heading || 'Stay in the loop'}</H2>
        <p style={{ fontSize: 14.5, color: 'var(--site-muted)', margin: '-10px 0 22px', lineHeight: 1.6 }}>
          {c.blurb || 'New arrivals, offers and updates — straight to your inbox. No spam.'}
        </p>
        {done ? (
          <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--site-accent-ui)' }}>You're on the list — thank you.</div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required
              style={{ flex: '1 1 220px', maxWidth: 320, boxSizing: 'border-box', padding: '12px 14px', borderRadius: v.btnRadius === 999 ? 999 : Math.max(v.btnRadius, 4), fontSize: 14, fontFamily: 'inherit', border: '1px solid var(--site-line)', background: 'var(--site-bg)', color: 'var(--site-fg)' }} />
            <button disabled={busy} style={{ ...btnStyle(v), opacity: busy ? 0.7 : 1 }}>{busy ? 'Joining…' : (c.button_text || 'Subscribe')}</button>
          </form>
        )}
        {error && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 10 }}>{error}</p>}
      </div>
    </section>
  );
}

/* ---- contact form (lead capture) ---------------------------------------------- */
function ContactFormSection({ site, v, i: si }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const set = (k, val) => setF((s) => ({ ...s, [k]: val }));

  const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: Math.max(v.btnRadius === 999 ? 10 : v.btnRadius, 2), fontSize: 14, fontFamily: 'inherit', border: '1px solid var(--site-line)', background: 'var(--site-bg)', color: 'var(--site-fg)' };
  const label = { display: 'block', fontSize: 12.5, color: 'var(--site-muted)', margin: '0 0 4px' };

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setError('Your name is required.');
    if (!f.message.trim()) return setError('Write a short message.');
    setBusy(true); setError('');
    try {
      await apiPost('/embed/lead', { orgSlug: site.slug, ...f });
      setDone(true);
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  };

  return (
    <section id="contact" style={{ padding: `${Math.min(v.secPad, 64)}px 24px`, maxWidth: 520, margin: '0 auto' }}>
      <H2 v={v} i={si} kicker="Contact">Get in touch</H2>
      <p style={{ fontSize: 14, color: 'var(--site-muted)', textAlign: v.h2Mode === 'left-kicker' || v.h2Mode === 'index' ? 'left' : 'center', margin: '-10px 0 22px' }}>Send a message and we'll get back to you.</p>

      {done ? (
        <div style={{ textAlign: 'center', padding: '26px 16px', background: 'var(--site-surface)', border: '1px solid var(--site-line)', borderRadius: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Message sent</div>
          <div style={{ fontSize: 13.5, color: 'var(--site-muted)' }}>Thanks {f.name.split(' ')[0]} — we've received it and will reply shortly.</div>
        </div>
      ) : (
        <form onSubmit={submit} style={{ background: 'var(--site-surface)', border: '1px solid var(--site-line)', borderRadius: 12, padding: 20 }}>
          <div style={{ marginBottom: 12 }}><span style={label}>Your name *</span><input style={input} value={f.name} onChange={(e) => set('name', e.target.value)} required /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><span style={label}>Email</span><input style={input} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
            <div><span style={label}>Phone / WhatsApp</span><input style={input} value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          </div>
          <div style={{ marginBottom: 14 }}><span style={label}>Message *</span><textarea style={{ ...input, resize: 'vertical' }} rows={4} value={f.message} onChange={(e) => set('message', e.target.value)} required /></div>
          {error && <p style={{ color: '#c0392b', fontSize: 13, margin: '0 0 10px' }}>{error}</p>}
          <button disabled={busy} style={{ ...btnStyle(v), width: '100%', textAlign: 'center', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Sending…' : 'Send message'}
          </button>
        </form>
      )}

      {(site.contactEmail || site.contactPhone || site.contactWhatsapp) && (
        <div style={{ textAlign: 'center', fontSize: 13.5, lineHeight: 2, marginTop: 18, color: 'var(--site-muted)' }}>
          {site.contactEmail && <span style={{ margin: '0 10px' }}>Email: <a href={`mailto:${site.contactEmail}`} style={{ color: 'var(--site-accent-ui)' }}>{site.contactEmail}</a></span>}
          {site.contactPhone && <span style={{ margin: '0 10px' }}>Phone: <a href={`tel:${site.contactPhone}`} style={{ color: 'var(--site-accent-ui)' }}>{site.contactPhone}</a></span>}
          {site.contactWhatsapp && <span style={{ margin: '0 10px' }}>WhatsApp: <a href={`https://wa.me/${waDigits(site.contactWhatsapp)}`} style={{ color: 'var(--site-accent-ui)' }}>{site.contactWhatsapp}</a></span>}
        </div>
      )}
    </section>
  );
}

/* ---- block dispatcher --------------------------------------------------------- */
function Block({ block, site, v, i }) {
  const c = block.content || {};
  const leftish = v.h2Mode === 'left-kicker' || v.h2Mode === 'index';
  switch (block.type) {
    case 'hero':
      return <Hero c={c} v={v} site={site} />;
    case 'text':
      return (
        <Sec v={v} i={i} w={720}>
          {c.heading && <H2 v={v} i={i} align="left">{c.heading}</H2>}
          <p style={{ fontSize: 15.5, lineHeight: 1.75, color: 'var(--site-muted)', whiteSpace: 'pre-wrap', margin: 0 }}>{c.body}</p>
        </Sec>
      );
    case 'image':
      return c.image_url ? (
        <section style={{ padding: '24px', textAlign: 'center', maxWidth: secWidth(v, 1000), margin: '0 auto' }}>
          <img src={c.image_url} alt={c.alt || ''} style={{ maxWidth: '100%', borderRadius: v.card === 'minimal' ? 0 : 16, boxShadow: v.card === 'minimal' ? 'none' : '0 30px 70px rgba(10,12,18,0.16)' }} />
          {c.caption && <p style={{ fontSize: 13, color: 'var(--site-muted)', marginTop: 8 }}>{c.caption}</p>}
        </section>
      ) : null;
    case 'features':
      return <Features c={c} v={v} i={i} />;
    case 'team':
      return (
        <Sec v={v} i={i}>
          {c.heading && <H2 v={v} i={i} kicker="Our people">{c.heading}</H2>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20 }}>
            {(c.items || []).length === 0 && <p style={{ textAlign: 'center', color: 'var(--site-muted)', gridColumn: '1/-1' }}>Team members coming soon.</p>}
            {(c.items || []).map((it, ti) => (
              <div key={ti} style={{ textAlign: leftish ? 'left' : 'center' }}>
                {it.photo_url && <img src={it.photo_url} alt={it.name} style={{
                  width: leftish ? '100%' : 96, height: leftish ? 150 : 96, maxWidth: leftish ? 200 : 96,
                  borderRadius: v.card === 'minimal' ? 2 : leftish ? 8 : '50%', objectFit: 'cover',
                  margin: leftish ? '0 0 10px' : '0 auto 10px', display: 'block',
                }} />}
                <div style={{ fontWeight: 600, ...(v.navCaps ? { textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 13.5 } : {}) }}>{it.name}</div>
                <div style={{ fontSize: 13, color: 'var(--site-muted)', marginTop: 2 }}>{it.role}</div>
              </div>
            ))}
          </div>
        </Sec>
      );
    case 'testimonials': {
      // Serif/centered themes set testimonials as large pull-quotes; the rest
      // keep the carded treatment.
      const pull = v.card === 'minimal' || v.h2Mode === 'center-rule';
      return (
        <Sec v={v} i={i} w={720}>
          {c.heading && <H2 v={v} i={i} kicker="Kind words">{c.heading}</H2>}
          {(c.items || []).map((it, ti) => (
            <blockquote key={ti} className={pull ? 'cs-pull' : undefined} style={{
              margin: '0 0 28px', padding: pull ? '8px 12px' : '16px 20px',
              ...(pull
                ? { borderLeft: 'none', textAlign: 'center' }
                : { borderLeft: '3px solid var(--site-accent-ui)', background: 'var(--site-surface)', borderRadius: v.card === 'rounded' ? 14 : 0 }),
            }}>
              <p style={{ fontStyle: 'italic', margin: '0 0 10px', lineHeight: 1.6, ...(pull ? { fontSize: `clamp(20px, 3vw, ${30 * v.display}px)`, lineHeight: 1.45, fontFamily: 'var(--site-font-display)' } : {}) }}>&ldquo;{it.quote}&rdquo;</p>
              <footer style={{ fontSize: 13, color: 'var(--site-muted)', ...(pull ? { letterSpacing: '.12em', textTransform: 'uppercase', fontSize: 11.5 } : {}) }}>— {it.author}</footer>
            </blockquote>
          ))}
        </Sec>
      );
    }
    case 'faq':
      return (
        <Sec v={v} i={i} w={640}>
          {c.heading && <H2 v={v} i={i} kicker="Questions">{c.heading}</H2>}
          {(c.items || []).map((it, ti) => (
            <div key={ti} style={{ marginBottom: 14, ...(v.card === 'bordered' || v.card === 'rounded'
              ? { padding: '14px 16px', border: '1px solid var(--site-line)', borderRadius: v.card === 'rounded' ? 14 : 10, background: 'var(--site-bg)' }
              : { paddingBottom: 14, borderBottom: '1px solid var(--site-line)' }) }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{it.q}</div>
              <div style={{ fontSize: 14, color: 'var(--site-muted)', lineHeight: 1.6 }}>{it.a}</div>
            </div>
          ))}
        </Sec>
      );
    case 'contact_form':
      return <ContactFormSection site={site} v={v} i={i} />;
    case 'subscribe':
      return <SubscribeSection c={c} site={site} v={v} i={i} />;
    case 'products':
      return <ProductsSection c={c} site={site} v={v} i={i} />;
    case 'cta': {
      // The closing band is a theme signature: flat accent, brand gradient,
      // stark inverse, or a quiet surface.
      const mode = v.ctaMode;
      const bandStyle =
        mode === 'gradient' ? { background: `linear-gradient(135deg, var(--site-accent) 0%, var(--site-accent-dark) 100%)`, color: '#fff' }
        : mode === 'accent' ? { background: 'var(--site-accent)', color: '#fff' }
        : mode === 'invert' ? { background: 'var(--site-fg)', color: 'var(--site-bg)' }
        : { background: 'var(--site-surface)' };
      const onColor = mode !== 'surface';
      return (
        <section style={{ padding: `${Math.min(v.secPad + 8, 80)}px 24px`, textAlign: 'center', ...bandStyle }}>
          <h2 className="cs-cta-h" style={{ fontSize: `clamp(${26 * v.display}px, 4.4vw, ${42 * v.display}px)`, margin: '0 0 22px', fontFamily: 'var(--site-font-display)', fontWeight: v.headingWeight, ...(v.navCaps ? { textTransform: 'uppercase', letterSpacing: '.08em' } : {}) }}>{c.heading}</h2>
          {c.button_text && (
            <a className="cs-btn" href={c.button_link || '#contact'} style={{
              ...btnStyle(v),
              ...(onColor ? { background: mode === 'invert' ? 'var(--site-bg)' : '#fff', color: mode === 'invert' ? 'var(--site-fg)' : (mode === 'accent' ? 'var(--site-accent-dark)' : 'var(--site-accent-dark)') } : {}),
            }}>
              {c.button_text}
            </a>
          )}
        </section>
      );
    }
    case 'footer':
      return c.note ? (
        <section style={{ padding: '18px 24px', textAlign: 'center', fontSize: 12.5, color: 'var(--site-muted)' }}>{c.note}</section>
      ) : null;
    default:
      return null;
  }
}

function SiteFooter({ site, v = DEFAULT_VARIANT }) {
  const year = new Date().getFullYear();
  const name = site.siteName || site.orgName;

  if (v.footerMode === 'columns') {
    return (
      <footer style={{ borderTop: '1px solid var(--site-line)', background: 'var(--site-surface)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '36px 24px 28px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 6 }}>{name}</div>
            {site.tagline && <div style={{ fontSize: 13, color: 'var(--site-muted)', lineHeight: 1.6 }}>{site.tagline}</div>}
          </div>
          {(site.contactPhone || site.contactWhatsapp || site.contactEmail) && (
            <div style={{ fontSize: 13.5, color: 'var(--site-muted)', lineHeight: 2 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--site-fg)', marginBottom: 4 }}>Contact</div>
              {site.contactPhone && <div>{site.contactPhone}</div>}
              {site.contactWhatsapp && <div>WhatsApp: {site.contactWhatsapp}</div>}
              {site.contactEmail && <div>{site.contactEmail}</div>}
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid var(--site-line)', padding: '14px 24px', textAlign: 'center', fontSize: 12, color: 'var(--site-muted)' }}>
          &copy; {year} {name}. Built with Collarone.
        </div>
      </footer>
    );
  }
  if (v.footerMode === 'serif') {
    return (
      <footer style={{ padding: '44px 24px', textAlign: 'center', borderTop: '1px solid var(--site-line)' }}>
        <div style={{ fontFamily: 'var(--site-font-display)', fontSize: 19, letterSpacing: '.06em', marginBottom: 10 }}>{name}</div>
        {(site.contactPhone || site.contactEmail) && (
          <div style={{ fontSize: 12.5, color: 'var(--site-muted)', letterSpacing: '.08em', marginBottom: 12 }}>
            {[site.contactPhone, site.contactEmail].filter(Boolean).join('   ·   ')}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: 'var(--site-muted)', letterSpacing: '.14em', textTransform: 'uppercase' }}>&copy; {year} · Built with Collarone</div>
      </footer>
    );
  }
  if (v.footerMode === 'caps') {
    return (
      <footer style={{ padding: '40px 24px', borderTop: '1px solid var(--site-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontWeight: 800, letterSpacing: '.24em', textTransform: 'uppercase', fontSize: 13 }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--site-muted)', letterSpacing: '.14em', textTransform: 'uppercase' }}>&copy; {year} — Built with Collarone</div>
      </footer>
    );
  }
  return (
    <footer style={{ padding: '24px', textAlign: 'center', fontSize: 12.5, color: 'var(--site-muted)', borderTop: '1px solid var(--site-line)' }}>
      &copy; {year} {name}. Built with Collarone.
    </footer>
  );
}

function PageBody({ page, site, v }) {
  return <main>{(page.blocks || []).map((b, i) => <Block key={i} block={b} site={site} v={v} i={i} />)}</main>;
}

/* ---- shells --------------------------------------------------------------------
   Nav treatments follow the variant too — caps themes get spaced uppercase
   links, pill themes get pill CTAs, boxed themes keep the contact strip. */
const navLink = (v, active) => ({
  fontSize: v.navCaps ? 12 : 14, textDecoration: 'none',
  color: active ? 'var(--site-accent-ui)' : 'var(--site-fg)',
  fontWeight: active ? 650 : 450,
  ...(active ? { borderBottom: '2px solid var(--site-accent-ui)', paddingBottom: 3 } : {}),
  ...(v.navCaps ? { textTransform: 'uppercase', letterSpacing: '.16em' } : {}),
});

function EcommerceSite({ data, activeSlug, setActiveSlug }) {
  const vars = useThemeVars(data.theme);
  useThemeAssets(data.theme);
  const v = variantFor(data.theme);
  const page = data.pages.find((p) => p.slug === activeSlug) || data.pages.find((p) => p.is_home) || data.pages[0];
  const shop = data.pages.find((p) => p.slug === 'shop');
  return (
    <CartProvider slug={data.slug}>
      <div className="cs-root" style={{ ...vars, background: 'var(--site-bg)', color: 'var(--site-fg)', minHeight: '100vh', fontFamily: 'var(--site-font)' }}>
        {(data.tagline || '').trim() && <div className="cs-announce">{data.tagline}</div>}
        <header className="cs-nav">
          <div className="cs-wordmark" style={{ ...(v.navCaps ? { letterSpacing: '.22em', textTransform: 'uppercase', fontSize: 15 } : {}) }}>
            {data.logoUrl && <img src={data.logoUrl} alt="" style={{ width: 30, height: 30, borderRadius: v.card === 'minimal' ? 2 : 6, objectFit: 'cover' }} />}
            {data.siteName || data.orgName}
          </div>
          <nav className="cs-navlinks">
            {data.pages.filter((p) => p.slug !== 'shop').map((p) => (
              <a key={p.slug} className="cs-nl" href={`#${p.slug}`} onClick={(e) => { e.preventDefault(); setActiveSlug(p.slug); }} style={navLink(v, page?.slug === p.slug)}>{p.title}</a>
            ))}
            {shop && (
              <a className="cs-nl" href="#shop" onClick={(e) => { e.preventDefault(); setActiveSlug('shop'); }} style={navLink(v, page?.slug === 'shop')}>
                Shop
              </a>
            )}
            <CartButton v={v} />
          </nav>
        </header>
        {page && <PageBody page={page} site={data} v={v} />}
        <SiteFooter site={data} v={v} />
        <CartDrawer site={data} v={v} />
      </div>
    </CartProvider>
  );
}

function LandingSite({ data }) {
  const vars = useThemeVars(data.theme);
  useThemeAssets(data.theme);
  const v = variantFor(data.theme);
  const home = data.pages.find((p) => p.is_home) || data.pages[0];
  const ctaBlock = (home?.blocks || []).find((b) => b.type === 'cta' || b.type === 'hero');
  return (
    <div className="cs-root" style={{ ...vars, background: 'var(--site-bg)', color: 'var(--site-fg)', minHeight: '100vh', fontFamily: 'var(--site-font)' }}>
      <header className="cs-nav" style={{ ...(v.hero === 'gradient' ? { background: 'rgba(13,15,20,0.55)' } : {}), ...(v.hero === 'minimal' ? { borderBottom: 'none' } : {}) }}>
        <div className="cs-wordmark">
          {data.logoUrl && <img src={data.logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />}
          {data.siteName || data.orgName}
        </div>
        <span style={{ marginLeft: 'auto' }} />
        <a href="#contact" style={{ ...btnStyle(v), padding: '9px 20px', fontSize: 13 }}>
          {ctaBlock?.content?.button_text || 'Get started'}
        </a>
      </header>
      {home && <PageBody page={home} site={data} v={v} />}
      <SiteFooter site={data} v={v} />
    </div>
  );
}

function CompanySite({ data, activeSlug, setActiveSlug }) {
  const vars = useThemeVars(data.theme);
  useThemeAssets(data.theme);
  const v = variantFor(data.theme);
  const page = data.pages.find((p) => p.slug === activeSlug) || data.pages.find((p) => p.is_home) || data.pages[0];
  return (
    <div className="cs-root" style={{ ...vars, background: 'var(--site-bg)', color: 'var(--site-fg)', minHeight: '100vh', fontFamily: 'var(--site-font)' }}>
      {(data.contactPhone || data.contactEmail) && (
        <div style={{ background: 'var(--site-surface)', padding: '6px 24px', fontSize: 12, color: 'var(--site-muted)', textAlign: 'right' }}>
          {data.contactPhone && <span style={{ marginRight: 16 }}>{data.contactPhone}</span>}
          {data.contactEmail && <span>{data.contactEmail}</span>}
        </div>
      )}
      <header className="cs-nav">
        <div className="cs-wordmark" style={{ ...(v.navCaps ? { letterSpacing: '.22em', textTransform: 'uppercase', fontSize: 15 } : {}) }}>
          {data.logoUrl && <img src={data.logoUrl} alt="" style={{ width: 32, height: 32, borderRadius: v.card === 'minimal' ? 2 : 6, objectFit: 'cover' }} />}
          {data.siteName || data.orgName}
        </div>
        <nav className="cs-navlinks">
          {data.pages.map((p) => (
            <a key={p.slug} className="cs-nl" href={`#${p.slug}`} onClick={(e) => { e.preventDefault(); setActiveSlug(p.slug); }} style={navLink(v, page?.slug === p.slug)}>
              {p.title}
            </a>
          ))}
        </nav>
      </header>
      {page && <PageBody page={page} site={data} v={v} />}
      <SiteFooter site={data} v={v} />
    </div>
  );
}

export const LAYOUTS = {
  'ecommerce-grid': EcommerceSite,
  'landing-hero': LandingSite,
  'company-profile': CompanySite,
};

// Shared commerce engine, reused by the folder-based themes/ so each new theme
// gets the real cart + Paystack/transfer/COD checkout without reinventing it.
export { CartProvider, CartButton, CartDrawer, CartCtx, Block, waDigits, fmtN };
