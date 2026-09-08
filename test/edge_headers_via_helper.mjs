// Nobody reads an edge-supplied header directly.
//
// `x-vercel-ip-country` was read in three places. Collarone moved off Vercel to
// nginx behind Cloudflare, the header stopped arriving, and nothing failed:
// analytics quietly filed every visit as country "XX", and the Nigeria-only
// payroll gate in admin.js went completely inert while still telling the UI it
// had withheld payroll. It was written `if (ipCountry && ipCountry !== 'NG')`,
// so an empty value skips the check.
//
// The lesson is not "use the Cloudflare header". It is that a value supplied by
// whatever sits in front of the app is infrastructure-dependent, and reading it
// inline puts the assumption in N places where changing the edge silently
// breaks all of them. _lib/callerCountry.js is the one place that knows.
//
// Run:  node test/edge_headers_via_helper.mjs
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const HELPER = '_lib/callerCountry.js';

// Headers only an edge/proxy can set. A handler reading one of these directly
// is coupling itself to today's hosting.
const EDGE_HEADERS = [
  'x-vercel-ip-country',
  'cf-ipcountry',
  'cf-ipcity',
  'x-vercel-ip-city',
  'x-vercel-ip-region',
];

let failures = 0;
const files = readdirSync(`${root}client/api`).filter((f) => f.endsWith('.js'));

for (const f of files) {
  const src = readFileSync(`${root}client/api/${f}`, 'utf8');
  for (const h of EDGE_HEADERS) {
    // Only a real header lookup counts, not a mention in a comment.
    const reads = new RegExp(`headers\\s*\\[\\s*['"\`]${h}['"\`]`, 'i').test(src);
    if (reads) {
      failures++;
      console.log(`x client/api/${f} reads the ${h} header directly`);
      console.log(`    use callerCountry(req) / callerCity(req) from ${HELPER} — the edge changes, the callers should not`);
    }
  }
}

// And the helper itself must still handle the unknown case, which is the whole
// reason it exists. Cloudflare sends XX for unknown and T1 for Tor.
const helper = readFileSync(`${root}client/api/${HELPER}`, 'utf8');
if (!/XX/.test(helper) || !/T1/.test(helper)) {
  failures++;
  console.log(`x ${HELPER} no longer normalises the "edge did not say" values (XX / T1)`);
}

if (failures) { console.error(`\nFAILED, ${failures} direct edge-header read(s)`); process.exit(1); }
console.log(`No handler reads an edge header directly; ${HELPER} owns it. ALL PASSED`);
