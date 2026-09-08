// Anonymous dimensions for a page view, derived at the edge of our API and
// then thrown away: the raw user agent and the full referring URL never reach
// the database. What is stored is a device CLASS and a referring HOST, which
// is enough to answer "are people on phones" and "did LinkedIn send them"
// without being able to answer "who".
//
// callerCity lives in callerCountry.js with the other edge-supplied headers,
// because the same rule applies to it: the edge changes, the callers should
// not, so one file knows which header carries it.

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegrambot|preview|headless|lighthouse|pingdom|uptime|monitor/i;
const TABLET_RE = /ipad|tablet|(android(?!.*mobile))|silk|kindle|playbook/i;
const PHONE_RE = /mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/i;

// phone | tablet | desktop | bot. Order matters: many bots say "Mobile" too.
export function deviceClass(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return 'desktop';
  if (BOT_RE.test(ua)) return 'bot';
  if (TABLET_RE.test(ua)) return 'tablet';
  if (PHONE_RE.test(ua)) return 'phone';
  return 'desktop';
}

// Every host that is us. A visit that arrives from a tenant's storefront or
// from our own marketing page is navigation, not acquisition.
const INTERNAL_HOST_RE = /(^|\.)collarone\.app$|^localhost$|^127\.0\.0\.1$/i;

// The referring HOST, lowercased, www-stripped, or null when there is none or
// it is one of ours. Never the path or query: a referrer URL can carry a
// search term, a session id, or a person's name.
export function referrerHost(referrer) {
  const raw = String(referrer || '').trim();
  if (!raw) return null;
  let host;
  try { host = new URL(raw).hostname; } catch { return null; }
  host = host.toLowerCase().replace(/^www\./, '');
  if (!host || INTERNAL_HOST_RE.test(host)) return null;
  return host.slice(0, 120);
}
