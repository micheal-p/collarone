// Visitor analytics are aggregated in the database, never counted in the browser.
//
// THE BUG THIS GUARDS AGAINST
//
// The analytics page fetched raw page_views rows with .limit(20000) and did
// the counting in React. PostgREST caps every response at 1,000 rows, so once
// the site passed a thousand visits in the window the page silently charted
// only the newest thousand. Cloudflare said 10,000+ page views; our own page
// said a fraction of that and nobody could tell why. Same class as the status
// page bug (test/../supabase/status_daily.sql): a window derived from a
// LIMITed sample is a function of traffic density, which nobody controls.
//
// So: the client never selects from page_views; it calls the summary RPC. The
// RPC is platform-admin only. The beacon stores classes (device, referring
// host, city), never the raw user agent or the full referrer URL, and never an
// IP. And the stale "analytics live in Vercel" line that sent the founder to a
// dashboard that no longer exists stays gone.
//
// Run:  node test/platform_analytics_aggregate.mjs
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(`${root}${p}`, 'utf8');
let failures = 0;
const fail = (msg) => { failures++; console.log(`x ${msg}`); };
const ok = (msg) => console.log(`✓ ${msg}`);

// 1. No client code reads page_views rows.
const clientFiles = ['client/src/api/supabaseApi.js', 'client/src/pages/PlatformAnalytics.jsx', 'client/src/pages/PlatformOverview.jsx'];
for (const f of clientFiles) {
  const src = read(f);
  if (/from\(\s*['"]page_views['"]\s*\)/.test(src)) fail(`${f} selects page_views rows directly; aggregate with platform_analytics_summary instead`);
}
if (!/rpc\(\s*'platform_analytics_summary'/.test(read('client/src/api/supabaseApi.js'))) fail('supabaseApi.js no longer calls platform_analytics_summary');
else ok('the client asks the database for totals, not rows');

// 2. The RPC exists, is platform-only, and is not executable by anon.
const sql = read('supabase/platform_analytics.sql');
const fnBody = sql.slice(sql.indexOf('platform_analytics_summary'), sql.indexOf('platform_counts'));
if (!/is_platform_admin\(\)/.test(fnBody)) fail('platform_analytics_summary does not check is_platform_admin()');
if (!/revoke execute on function public\.platform_analytics_summary\(int\) from public, anon/.test(sql)) fail('platform_analytics_summary is not revoked from anon');
if (!/security definer/.test(fnBody) || !/set search_path = public/.test(fnBody)) fail('platform_analytics_summary is missing security definer + search_path');
if (!/path not like '\/platform-admin%'/.test(fnBody)) fail('the summary counts the operator\'s own control-plane browsing as visitor traffic');
if (!failures) ok('platform_analytics_summary is definer, search_path-pinned, platform-admin only, anon revoked');

// 3. The beacon stores classes, not identities.
const track = read('client/api/track.js');
const signals = read('client/api/_lib/visitorSignals.js');
const pvInserts = [...track.matchAll(/from\('page_views'\)\.insert\(\{([^}]*)\}\)/g)].map((m) => m[1]);
if (pvInserts.length === 0) fail('track.js no longer inserts page_views');
for (const cols of pvInserts) {
  if (/user_agent|\bip\b|ip_address|email/.test(cols)) fail(`a page_views insert stores an identifying column: {${cols.trim()}}`);
  for (const want of ['device', 'referrer', 'city']) if (!new RegExp(`\\b${want}\\b`).test(cols)) fail(`a page_views insert is missing ${want}: {${cols.trim()}}`);
}
if (!/hostname/.test(signals) || /search|pathname/.test(signals.replace(/\/\/.*$/gm, ''))) fail('referrerHost must keep only the hostname of the referring URL');
if (!/collarone\\?\.app/.test(signals)) fail('referrerHost does not discard our own hosts, so in-app navigation would count as acquisition');
if (!/'bot'/.test(signals)) fail('deviceClass no longer classifies bots, which is the honest reason our count differs from Cloudflare\'s');
if (!failures) ok('the beacon stores device class, referring host and city, never the UA, URL or IP');

// 4. The referrer travels once per page load, not once per route change.
const app = read('client/src/App.jsx');
if (!/referrerSent/.test(app) || !/document\.referrer/.test(app)) fail('App.jsx no longer sends the referrer once per page load');
else ok('referrer is sent with the first beacon of a page load only');

// 5. The line that pointed at a dashboard that no longer exists.
for (const f of ['client/src/pages/PlatformAdmin.jsx', 'client/src/pages/PlatformOverview.jsx', 'client/src/pages/PlatformAnalytics.jsx']) {
  if (/Vercel's dashboard/.test(read(f))) fail(`${f} still tells the operator analytics live in Vercel`);
}
ok('nothing sends the operator to Vercel for analytics');

// 6. Every rail link has a route that renders it.
const shell = read('client/src/components/PlatformShell.jsx');
const links = [...shell.matchAll(/to: '(\/platform-admin[^']*)'/g)].map((m) => m[1]);
const admin = read('client/src/pages/PlatformAdmin.jsx');
const sections = [...admin.matchAll(/^  (\w+): \{ title:/gm)].map((m) => m[1]);
for (const to of links) {
  const seg = to.replace('/platform-admin', '').replace(/^\//, '');
  const routed = seg === '' || seg === 'analytics' || seg === 'support' || sections.includes(seg);
  if (!routed) fail(`rail links to ${to} but no route or PlatformAdmin section renders it`);
}
if (!/path="\/platform-admin\/:section"/.test(app)) fail('App.jsx is missing the /platform-admin/:section route');
if (!failures) ok(`all ${links.length} rail links resolve to a page`);

if (failures) { console.error(`\nFAILED, ${failures} problem(s)`); process.exit(1); }
console.log('Visitor analytics are aggregated, anonymous and reachable. ALL PASSED');
