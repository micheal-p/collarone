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
