// Lightweight per-page SEO for the SPA. Google renders JS, so setting these on
// mount gets our public pages (jobs board, individual job posts) proper titles,
// descriptions, Open Graph cards and JSON-LD — which is how the WhatsApp-share
// loop compounds into organic search traffic. Call from a page's useEffect.
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
  if (image) tag('og:image', image, 'property');
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
