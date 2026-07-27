// Lightweight per-page SEO for the SPA. Google renders JS, so setting these on
// mount gets our public pages (jobs board, individual job posts) proper titles,
// descriptions, Open Graph cards and JSON-LD — which is how the WhatsApp-share
// loop compounds into organic search traffic. Call from a page's useEffect.
let defaultOgImage; let capturedDefault = false; // the index.html og:image, captured once
export function setSeo({ title, description, canonical, image, jsonLd }) {
  if (title) document.title = title;

  const tag = (key, val, attr = 'name') => {
    if (val == null) return;
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
    el.setAttribute('content', val);
  };
  tag('description', description);
  tag('og:title', title, 'property');
  tag('og:description', description, 'property');
  tag('og:type', 'website', 'property');
  // Image is page-specific. Remember the site default (index.html) on first run,
  // and restore it when a page sets none — so a previous page's image can't bleed
  // onto the next, AND image-less pages keep the default rather than losing it.
  const removeTag = (key, attr = 'name') => { const el = document.head.querySelector(`meta[${attr}="${key}"]`); if (el) el.remove(); };
  if (!capturedDefault) { const el = document.head.querySelector('meta[property="og:image"]'); defaultOgImage = el ? el.getAttribute('content') : null; capturedDefault = true; }
  const finalImage = image || defaultOgImage;
  if (finalImage) { tag('og:image', finalImage, 'property'); tag('twitter:image', finalImage); }
  else { removeTag('og:image', 'property'); removeTag('twitter:image'); }
  tag('twitter:card', 'summary_large_image');
  tag('twitter:title', title);
  tag('twitter:description', description);

  if (canonical) {
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = canonical;
    tag('og:url', canonical, 'property');
  }

  let s = document.getElementById('page-jsonld');
  if (jsonLd) {
    if (!s) { s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'page-jsonld'; document.head.appendChild(s); }
    s.textContent = JSON.stringify(jsonLd);
  } else if (s) {
    s.remove();
  }
}
