// Public-site rendering. Three real layout skeletons (ecommerce-grid,
// landing-hero, company-profile) × each theme's own accent/font/tone tokens
// is what makes the 10 catalog themes look meaningfully different from each
// other without hand-building 10 bespoke templates from scratch.
import { useMemo } from 'react';

const FONT_STACKS = {
  'sans-clean':    "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  'sans-bold':     "'Poppins', 'Inter', sans-serif",
  'serif-display': "'Georgia', 'Times New Roman', serif",
};

function useThemeVars(theme) {
  return useMemo(() => {
    const dark = theme.tone === 'dark';
    return {
      '--site-accent': theme.accentColor || theme.accent,
      '--site-bg': dark ? '#0d0f14' : '#ffffff',
      '--site-fg': dark ? '#f2f2f2' : '#14161a',
      '--site-muted': dark ? '#a5a5ad' : '#5c5f66',
      '--site-surface': dark ? '#181b21' : '#f7f7f8',
      '--site-line': dark ? '#2a2e37' : '#e7e7ea',
      '--site-font': FONT_STACKS[theme.fontPair] || FONT_STACKS['sans-clean'],
    };
  }, [theme]);
}

function Block({ block, site }) {
  const c = block.content || {};
  switch (block.type) {
    case 'hero':
      return (
        <section style={{ padding: '72px 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 40, margin: '0 0 14px', fontFamily: 'var(--site-font)' }}>{c.heading}</h1>
          {c.subheading && <p style={{ fontSize: 18, color: 'var(--site-muted)', maxWidth: 560, margin: '0 auto 24px' }}>{c.subheading}</p>}
          {c.button_text && (
            <a href={c.button_link || '#'} style={{ display: 'inline-block', padding: '12px 28px', background: 'var(--site-accent)', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>
              {c.button_text}
            </a>
          )}
        </section>
      );
    case 'text':
      return (
        <section style={{ padding: '48px 24px', maxWidth: 720, margin: '0 auto' }}>
          {c.heading && <h2 style={{ fontSize: 26, marginBottom: 12, fontFamily: 'var(--site-font)' }}>{c.heading}</h2>}
          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: 'var(--site-muted)', whiteSpace: 'pre-wrap' }}>{c.body}</p>
        </section>
      );
    case 'image':
      return c.image_url ? (
        <section style={{ padding: '24px', textAlign: 'center' }}>
          <img src={c.image_url} alt={c.alt || ''} style={{ maxWidth: '100%', borderRadius: 10 }} />
          {c.caption && <p style={{ fontSize: 13, color: 'var(--site-muted)', marginTop: 8 }}>{c.caption}</p>}
        </section>
      ) : null;
    case 'features':
      return (
        <section style={{ padding: '48px 24px', maxWidth: 960, margin: '0 auto' }}>
          {c.heading && <h2 style={{ fontSize: 26, marginBottom: 24, textAlign: 'center', fontFamily: 'var(--site-font)' }}>{c.heading}</h2>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
            {(c.items || []).map((it, i) => (
              <div key={i} style={{ padding: 20, background: 'var(--site-surface)', border: '1px solid var(--site-line)', borderRadius: 10 }}>
                <h3 style={{ fontSize: 16, margin: '0 0 8px' }}>{it.title}</h3>
                <p style={{ fontSize: 13.5, color: 'var(--site-muted)', margin: 0 }}>{it.body}</p>
              </div>
            ))}
          </div>
        </section>
      );
    case 'team':
      return (
        <section style={{ padding: '48px 24px', maxWidth: 960, margin: '0 auto' }}>
          {c.heading && <h2 style={{ fontSize: 26, marginBottom: 24, textAlign: 'center', fontFamily: 'var(--site-font)' }}>{c.heading}</h2>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20 }}>
            {(c.items || []).length === 0 && <p style={{ textAlign: 'center', color: 'var(--site-muted)', gridColumn: '1/-1' }}>Team members coming soon.</p>}
            {(c.items || []).map((it, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                {it.photo_url && <img src={it.photo_url} alt={it.name} style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 10px' }} />}
                <div style={{ fontWeight: 600 }}>{it.name}</div>
                <div style={{ fontSize: 13, color: 'var(--site-muted)' }}>{it.role}</div>
              </div>
            ))}
          </div>
        </section>
      );
    case 'testimonials':
      return (
        <section style={{ padding: '48px 24px', maxWidth: 720, margin: '0 auto' }}>
          {c.heading && <h2 style={{ fontSize: 26, marginBottom: 24, textAlign: 'center', fontFamily: 'var(--site-font)' }}>{c.heading}</h2>}
          {(c.items || []).map((it, i) => (
            <blockquote key={i} style={{ margin: '0 0 20px', padding: '16px 20px', borderLeft: '3px solid var(--site-accent)', background: 'var(--site-surface)' }}>
              <p style={{ fontStyle: 'italic', margin: '0 0 8px' }}>&ldquo;{it.quote}&rdquo;</p>
              <footer style={{ fontSize: 13, color: 'var(--site-muted)' }}>— {it.author}</footer>
            </blockquote>
          ))}
        </section>
      );
    case 'faq':
      return (
        <section style={{ padding: '48px 24px', maxWidth: 640, margin: '0 auto' }}>
          {c.heading && <h2 style={{ fontSize: 26, marginBottom: 20, textAlign: 'center', fontFamily: 'var(--site-font)' }}>{c.heading}</h2>}
          {(c.items || []).map((it, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{it.q}</div>
              <div style={{ fontSize: 14, color: 'var(--site-muted)' }}>{it.a}</div>
            </div>
          ))}
        </section>
      );
    case 'contact_form':
      return (
        <section id="contact" style={{ padding: '48px 24px', maxWidth: 480, margin: '0 auto' }}>
          <h2 style={{ fontSize: 26, marginBottom: 16, textAlign: 'center', fontFamily: 'var(--site-font)' }}>Get in touch</h2>
          <div style={{ textAlign: 'center', fontSize: 14.5, lineHeight: 2 }}>
            {site.contactEmail && <div>Email: <a href={`mailto:${site.contactEmail}`} style={{ color: 'var(--site-accent)' }}>{site.contactEmail}</a></div>}
            {site.contactPhone && <div>Phone: <a href={`tel:${site.contactPhone}`} style={{ color: 'var(--site-accent)' }}>{site.contactPhone}</a></div>}
            {site.contactWhatsapp && <div>WhatsApp: <a href={`https://wa.me/${site.contactWhatsapp.replace(/[^0-9]/g, '')}`} style={{ color: 'var(--site-accent)' }}>{site.contactWhatsapp}</a></div>}
            {!site.contactEmail && !site.contactPhone && !site.contactWhatsapp && <p style={{ color: 'var(--site-muted)' }}>Contact details coming soon.</p>}
          </div>
        </section>
      );
    case 'products':
      return (
        <section style={{ padding: '48px 24px', maxWidth: 1000, margin: '0 auto' }}>
          {c.heading && <h2 style={{ fontSize: 26, marginBottom: 24, textAlign: 'center', fontFamily: 'var(--site-font)' }}>{c.heading}</h2>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 18 }}>
            {(site.products || []).slice(0, c.limit > 0 ? c.limit : undefined).map((p) => (
              <div key={p.id} style={{ border: '1px solid var(--site-line)', borderRadius: 10, overflow: 'hidden', background: 'var(--site-surface)' }}>
                <div style={{ aspectRatio: '1/1', background: '#e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {p.imageUrl ? <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#999', fontSize: 12 }}>No image</span>}
                </div>
                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  {p.price != null && <div style={{ color: 'var(--site-accent)', fontWeight: 700, marginTop: 4 }}>₦{Number(p.price).toLocaleString('en-NG')}</div>}
                </div>
              </div>
            ))}
            {(site.products || []).length === 0 && <p style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--site-muted)' }}>No products listed yet.</p>}
          </div>
        </section>
      );
    case 'cta':
      return (
        <section style={{ padding: '56px 24px', textAlign: 'center', background: 'var(--site-surface)' }}>
          <h2 style={{ fontSize: 26, marginBottom: 16, fontFamily: 'var(--site-font)' }}>{c.heading}</h2>
          {c.button_text && (
            <a href={c.button_link || '#contact'} style={{ display: 'inline-block', padding: '12px 28px', background: 'var(--site-accent)', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>
              {c.button_text}
            </a>
          )}
        </section>
      );
    case 'footer':
    default:
      return null;
  }
}

function SiteFooter({ site }) {
  return (
    <footer style={{ padding: '24px', textAlign: 'center', fontSize: 12.5, color: 'var(--site-muted)', borderTop: '1px solid var(--site-line)' }}>
      &copy; {new Date().getFullYear()} {site.siteName || site.orgName}. Built with Collarone.
    </footer>
  );
}

function PageBody({ page, site }) {
  return <main>{(page.blocks || []).map((b, i) => <Block key={i} block={b} site={site} />)}</main>;
}

// ---- Ecommerce Grid — multi-page (Home/Shop/Contact), a shop-forward top
// bar with a persistent "Shop now" pill next to the nav, product-grid blocks
// get extra visual weight (handled in Block() via the aspect-ratio grid).
function EcommerceSite({ data, activeSlug, setActiveSlug }) {
  const vars = useThemeVars(data.theme);
  const page = data.pages.find((p) => p.slug === activeSlug) || data.pages.find((p) => p.is_home) || data.pages[0];
  const shop = data.pages.find((p) => p.slug === 'shop');
  return (
    <div style={{ ...vars, background: 'var(--site-bg)', color: 'var(--site-fg)', minHeight: '100vh', fontFamily: 'var(--site-font)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--site-line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 17 }}>
          {data.logoUrl && <img src={data.logoUrl} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover' }} />}
          {data.siteName || data.orgName}
        </div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {data.pages.filter((p) => p.slug !== 'shop').map((p) => (
            <a key={p.slug} href={`#${p.slug}`} onClick={(e) => { e.preventDefault(); setActiveSlug(p.slug); }}
              style={{ fontSize: 14, color: page?.slug === p.slug ? 'var(--site-accent)' : 'var(--site-fg)', textDecoration: 'none' }}>{p.title}</a>
          ))}
          {shop && (
            <a href="#shop" onClick={(e) => { e.preventDefault(); setActiveSlug('shop'); }}
              style={{ fontSize: 13, fontWeight: 700, padding: '7px 16px', borderRadius: 999, background: 'var(--site-accent)', color: '#fff', textDecoration: 'none' }}>
              Shop now
            </a>
          )}
        </nav>
      </header>
      {page && <PageBody page={page} site={data} />}
      <SiteFooter site={data} />
    </div>
  );
}

// ---- Landing Hero — deliberately single-scrolling-page: a landing site's
// "pages" collapse into anchor-linked sections of the Home page, sticky nav
// bar with a CTA button always visible (matches how real product-launch
// pages behave — no separate multi-page site chrome).
function LandingSite({ data }) {
  const vars = useThemeVars(data.theme);
  const home = data.pages.find((p) => p.is_home) || data.pages[0];
  const ctaBlock = (home?.blocks || []).find((b) => b.type === 'cta' || b.type === 'hero');
  return (
    <div style={{ ...vars, background: 'var(--site-bg)', color: 'var(--site-fg)', minHeight: '100vh', fontFamily: 'var(--site-font)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', background: 'var(--site-bg)', borderBottom: '1px solid var(--site-line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 16 }}>
          {data.logoUrl && <img src={data.logoUrl} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover' }} />}
          {data.siteName || data.orgName}
        </div>
        <a href="#contact" style={{ fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 8, background: 'var(--site-accent)', color: '#fff', textDecoration: 'none' }}>
          {ctaBlock?.content?.button_text || 'Get started'}
        </a>
      </header>
      {home && <PageBody page={home} site={data} />}
      <SiteFooter site={data} />
    </div>
  );
}

// ---- Company Profile — traditional multi-page corporate nav (Home/About/
// Services/Team/Contact), a quieter/smaller hero (text-forward, not a big
// splash), and a persistent contact strip in the header for trust signal.
function CompanySite({ data, activeSlug, setActiveSlug }) {
  const vars = useThemeVars(data.theme);
  const page = data.pages.find((p) => p.slug === activeSlug) || data.pages.find((p) => p.is_home) || data.pages[0];
  return (
    <div style={{ ...vars, background: 'var(--site-bg)', color: 'var(--site-fg)', minHeight: '100vh', fontFamily: 'var(--site-font)' }}>
      {(data.contactPhone || data.contactEmail) && (
        <div style={{ background: 'var(--site-surface)', padding: '6px 24px', fontSize: 12, color: 'var(--site-muted)', textAlign: 'right' }}>
          {data.contactPhone && <span style={{ marginRight: 16 }}>{data.contactPhone}</span>}
          {data.contactEmail && <span>{data.contactEmail}</span>}
        </div>
      )}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--site-line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 18, fontFamily: 'var(--site-font)' }}>
          {data.logoUrl && <img src={data.logoUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />}
          {data.siteName || data.orgName}
        </div>
        <nav style={{ display: 'flex', gap: 22 }}>
          {data.pages.map((p) => (
            <a key={p.slug} href={`#${p.slug}`} onClick={(e) => { e.preventDefault(); setActiveSlug(p.slug); }}
              style={{ fontSize: 14, letterSpacing: '.02em', color: page?.slug === p.slug ? 'var(--site-accent)' : 'var(--site-fg)', textDecoration: 'none', fontWeight: page?.slug === p.slug ? 600 : 400 }}>
              {p.title}
            </a>
          ))}
        </nav>
      </header>
      {page && <PageBody page={page} site={data} />}
      <SiteFooter site={data} />
    </div>
  );
}

export const LAYOUTS = {
  'ecommerce-grid': EcommerceSite,
  'landing-hero': LandingSite,
  'company-profile': CompanySite,
};
