// Auto-SEO for every published tenant site.
//
// The SPA's index.html carries Collarone's OWN meta — its title, description,
// og:image and canonical. Every tenant site is served from that same shell, so
// without this a customer's storefront at shop.collarone.app showed up in
// Google and on WhatsApp/Facebook shares as "Collarone: HR, Payroll…" with
// Collarone's logo and description. Their business, invisible; ours, in their
// place. This rewrites the head from the tenant's OWN data on every page, so
// each site represents itself.
//
// It runs client-side (the sites are a SPA, no SSR). Google renders JavaScript,
// so it indexes the corrected tags; link-preview crawlers that don't run JS
// fall back to whatever is in the HTML, which is why the eventual proper fix is
// server-rendered meta — noted, not blocking. This is the high-value 90%.

const HEAD = () => document.head;

// Find an existing meta by name= or property=, update it, or create it. The
// index.html already has many of these, so we UPDATE in place rather than
// stacking duplicates.
function setMeta(attr, key, content) {
  if (!content) return removeMeta(attr, key);
  let el = HEAD().querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); HEAD().appendChild(el); }
  el.setAttribute('content', content);
}
function removeMeta(attr, key) {
  const el = HEAD().querySelector(`meta[${attr}="${key}"]`);
  if (el) el.setAttribute('content', ''); // blank rather than remove, so a stale Collarone value never shows
}
function setLink(rel, href) {
  let el = HEAD().querySelector(`link[rel="${rel}"]`);
  if (!el) { el = document.createElement('link'); el.setAttribute('rel', rel); HEAD().appendChild(el); }
  el.setAttribute('href', href);
}

// A clean, trimmed sentence for the description — search engines cut ~155 chars.
function clean(s, max = 155) {
  if (!s) return '';
  const t = String(s).replace(/\s+/g, ' ').replace(/\*/g, '').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// Best description available for THIS page: the hero subheading, else the first
// text block, else the site tagline.
function pageDescription(page, data) {
  const blocks = page?.blocks || [];
  const hero = blocks.find((b) => b.type === 'hero');
  if (hero?.content?.subheading) return clean(hero.content.subheading);
  const text = blocks.find((b) => b.type === 'text');
  if (text?.content?.body) return clean(text.content.body);
  return clean(data.tagline || `${data.siteName || 'Welcome'} — find us online.`);
}

// A representative image: the home hero image, else an absolute logo URL. Never
// fall back to Collarone's image — a blank preview beats the wrong brand.
function pageImage(data) {
  const home = (data.pages || []).find((p) => p.is_home) || (data.pages || [])[0];
  const hero = (home?.blocks || []).find((b) => b.type === 'hero');
  const heroImg = hero?.content?.image_url;
  if (heroImg && /^https?:\/\//i.test(heroImg)) return heroImg;
  if (data.logoUrl && /^https?:\/\//i.test(data.logoUrl)) return data.logoUrl;
  return '';
}

// Organization / Store structured data, so Google understands the business
// (name, logo, contact) rather than guessing from text.
function applyJsonLd(data, url, image) {
  const old = document.getElementById('tenant-jsonld');
  if (old) old.remove();
  const isStore = (data.products || []).length > 0 || data.theme?.category === 'ecommerce';
  const ld = {
    '@context': 'https://schema.org',
    '@type': isStore ? 'Store' : 'Organization',
    name: data.siteName || data.orgName,
    url,
    ...(image ? { logo: image, image } : {}),
    ...(data.tagline ? { description: clean(data.tagline, 300) } : {}),
    ...(data.contactEmail || data.contactPhone ? {
      contactPoint: {
        '@type': 'ContactPoint',
        ...(data.contactEmail ? { email: data.contactEmail } : {}),
        ...(data.contactPhone ? { telephone: data.contactPhone } : {}),
        contactType: 'customer service',
        areaServed: 'NG',
      },
    } : {}),
  };
  const s = document.createElement('script');
  s.type = 'application/ld+json';
  s.id = 'tenant-jsonld';
  s.textContent = JSON.stringify(ld);
  HEAD().appendChild(s);
}

// Called on every site load and page change. `data` is the public site payload;
// `activeSlug` is the page currently shown.
export function applySiteSeo(data, activeSlug) {
  if (!data || typeof document === 'undefined') return;
  const siteName = data.siteName || data.orgName || 'Home';
  const tagline = data.tagline || '';
  const pages = data.pages || [];
  const page = pages.find((p) => p.slug === activeSlug) || pages.find((p) => p.is_home) || pages[0];
  const isHome = !!page?.is_home;

  // Home reads "<Name> — <tagline>"; inner pages read "<Page> · <Name>".
  const title = isHome
    ? (tagline ? `${siteName} — ${clean(tagline, 70)}` : siteName)
    : `${page?.title || 'Page'} · ${siteName}`;
  const description = pageDescription(page, data);
  const image = pageImage(data);
  // The tenant's real address — its own subdomain or custom domain, not ours.
  const url = `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '') || window.location.origin;

  document.title = title;
  setMeta('name', 'description', description);
  setLink('canonical', url);

  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:site_name', siteName);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', url);
  setMeta('property', 'og:locale', 'en_NG');
  setMeta('property', 'og:image', image);           // blanked if none — never Collarone's

  setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', image);

  // Let search engines index a published site; a preview must never be indexed.
  setMeta('name', 'robots', data.isPreview ? 'noindex, nofollow' : 'index, follow');

  applyJsonLd(data, url, image);
}
