// Tenant subdomain detection. When a customer's published site is served at
// <slug>.collarone.app, this returns that slug so the app renders their store
// instead of the Collarone product. Anything that isn't a real tenant
// subdomain (the apex, www, the app host, reserved names, vercel.app,
// localhost, a bare IP) returns null and the normal app renders.
const RESERVED = new Set(['www', 'app', 'api', 'status', 'admin', 'staging', 'preview', 'mail', 'ftp', 'cdn', 'assets']);

export function tenantSlug() {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  const m = host.match(/^([a-z0-9][a-z0-9-]{0,38}[a-z0-9])\.collarone\.(app|ng|com)$/i);
  if (!m) return null;
  const sub = m[1].toLowerCase();
  return RESERVED.has(sub) ? null : sub;
}
