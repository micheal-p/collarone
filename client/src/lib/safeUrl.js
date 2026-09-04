// Make a user-supplied URL safe to put in an href.
//
// Org websites, applicant portfolio links and the like are entered by users and
// rendered as clickable links to other users (recruiters, platform admins,
// public visitors). Two things go wrong if you trust them raw:
//   - `javascript:` / `data:` schemes run code when clicked (XSS).
//   - `//evil.com`, `/\evil.com`, `\\evil.com` are open-redirects — and through
//     react-router's <Link> the backslash form is a known CVE. A `startsWith('/')`
//     check is NOT enough: `//` and `/\` both pass it.
//
// Returns a safe absolute http(s) URL, or null so the caller renders no link.
// A bare domain ("acme.com") gets https:// added. Everything else is rejected.
export function safeExternalUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  // Normalise backslashes (browsers treat \ as / in URLs) then refuse anything
  // that starts with a slash — an external field is never an internal/protocol-
  // relative path, and this kills //host and /\host open-redirects.
  if (s.replace(/\\/g, '/').startsWith('/')) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;  // no javascript:, data:, etc.
    return u.href;
  } catch {
    return null;
  }
}

// Standard safe attributes for a user-supplied external link.
export const EXTERNAL_LINK_REL = 'noopener noreferrer nofollow';

// For storefront CTA buttons, whose link a merchant sets and public visitors
// click. Keeps in-page #anchors, site-relative /paths, mailto:/tel: and safe
// http(s); anything dangerous (javascript:, data:, //host, /\host) becomes ''
// so the caller's `|| '#fallback'` default takes over — never an active link.
export function safeLinkOrEmpty(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const norm = s.replace(/\\/g, '/');
  if (s.startsWith('#')) return s;                       // in-page anchor
  if (s.startsWith('/') && !norm.startsWith('//')) return s;  // site-relative, not protocol-relative
  if (/^(mailto:|tel:)/i.test(s)) return s;
  return safeExternalUrl(s) || '';                       // http(s)/bare-domain, else drop
}

// For a user-supplied value that goes into an <img src>.
//
// letterheadTemplates.js built `<img src="${d.logo}">` by string concatenation
// and rendered it through dangerouslySetInnerHTML — the one interpolation in
// that file that skipped esc(). `details` is arbitrary jsonb from the
// letterhead settings, so a value containing a quote broke out of the
// attribute and injected markup into a letter that then gets filed to
// Documents and downloaded as HTML.
//
// safeExternalUrl() is too strict here: logos and signatures are legitimately
// either a storage URL or a drawn `data:image/...`. So allow both, and nothing
// else. SVG is excluded on purpose — it can carry script, and no signature pad
// or logo uploader in this product produces one.
const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

export function safeImageSrc(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (DATA_IMAGE.test(s)) return s;
  return safeExternalUrl(s);   // http(s) only; javascript:, //host etc. rejected
}

// For a path that arrived in the URL bar and is about to be navigated to —
// today only Login's `?next=`, the deep link ProtectedRoute hands back after
// sign-in.
//
// Login hand-rolled `startsWith('/') && !startsWith('//')`, which is exactly
// the check the top of this file warns is not enough: `/\evil.ng` passes it and
// the browser resolves it to https://evil.ng. That turns a genuine
// collarone.app login page into a credential-phishing hop, the victim types
// their password on our own domain and is then handed to the attacker's site.
//
// So don't restate the rule by hand: normalise backslashes, refuse
// protocol-relative paths and control characters (the parser strips those, and
// a stripped one can hide a leading //), then make the URL parser itself prove
// the result is still same-origin. Returns the safe path, or null so the caller
// falls back to home.
const SAME_ORIGIN_PROBE = 'https://collarone.invalid';

export function safeInternalPath(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/[\u0000-\u001f\u007f]/.test(s)) return null;
  const norm = s.replace(/\\/g, '/');                  // browsers treat \ as / in URLs
  if (!norm.startsWith('/') || norm.startsWith('//')) return null;
  try {
    const u = new URL(norm, SAME_ORIGIN_PROBE);
    if (u.origin !== SAME_ORIGIN_PROBE) return null;   // the parser gets the last word
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}
