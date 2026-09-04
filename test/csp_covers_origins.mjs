// Every external origin the browser LOADS must be allowed by the CSP.
//
// The Content-Security-Policy lives in deploy/deploy.sh, a long way from the
// code that decides what to load. Nothing connected the two, and the policy ran
// Report-Only with no report-uri — so it shipped a real policy, logged what it
// would block to nobody, and could never be promoted to enforcing with any
// evidence.
//
// What that gap was hiding: style-src and font-src did not allow
// fonts.googleapis.com / fonts.gstatic.com, which ten tenant storefront themes
// load. Enforcing the policy would have stripped the typography from every
// published customer website, and the first anyone would have known is a
// customer asking why their site looked wrong.
//
// This asserts the direction that matters: anything the client references must
// be in the policy. The reverse is deliberately not checked — js.paystack.co is
// injected at runtime and Cloudflare injects its own beacon, so the policy
// legitimately allows more than the source mentions.
//
// Run:  node test/csp_covers_origins.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const deploy = readFileSync(join(root, 'deploy/deploy.sh'), 'utf8');

// Origins that appear in the source but are never fetched by the browser, so
// no CSP directive governs them. Adding a name here asserts exactly that.
const NOT_LOADED = new Map([
  ['collarone.app', 'our own origin — it is the document, not a third party'],
  ['collarone.invalid', 'safeInternalPath() same-origin probe, never requested'],
  ['evil.ng', 'the open-redirect example in safeUrl.js comments and tests'],
  ['maps.google.com', 'an <a href> a user clicks, from the attendance map pin'],
  ['paystack.com', 'brand/link text, the SDK itself is js.paystack.co'],
  ['schema.org', 'JSON-LD vocabulary identifier, never dereferenced'],
  ['sunrisefoods.ng', 'sample tenant data in the demo'],
  ['wa.me', 'an <a href> a user clicks, to open WhatsApp'],
  ['www.w3.org', 'the SVG xmlns attribute, never dereferenced'],
  ['yourcompany.com', 'placeholder copy in a form hint'],
]);

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const files = [
  ...walk(join(root, 'client/src')).filter((f) => /\.(js|jsx|ts|tsx|html)$/.test(f)),
  join(root, 'client/index.html'),
];

const found = new Map();
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(/https?:\/\/([a-zA-Z0-9.-]+\.[a-z]{2,})/g)) {
    if (!found.has(m[1])) found.set(m[1], f.slice(root.length));
  }
}

let failures = 0;

// The policies are checked SEPARATELY, never joined. Joining them was the first
// version of this test and it was useless: fonts.googleapis.com removed from
// the main policy still passed, because the /embed/ policy also names it. A
// host allowed only on the embed surface does not help the app.
const policy = (label, needle) => {
  const line = deploy.split('\n').find((l) => l.includes('Content-Security-Policy') && l.includes(needle));
  if (!line) { failures++; console.log(`x could not find the ${label} CSP in deploy/deploy.sh`); }
  return line || '';
};
const mainCsp = policy('main app', 'accounts.google.com');
const embedCsp = policy('/embed/', 'frame-ancestors *');

// 1. Each policy must actually collect evidence. Without report-uri, Report-Only
//    is theatre: it blocks nothing and tells nobody.
for (const [label, line] of [['main app', mainCsp], ['/embed/', embedCsp]]) {
  if (line && !/report-uri\s+\S/.test(line)) {
    failures++;
    console.log(`x the ${label} CSP has no report-uri, so violations are reported to nobody`);
  }
}

// 2. Every origin the client references is allowed BY THE DIRECTIVE THAT
//    GOVERNS HOW IT IS USED, or declared unfetched.
//
//    Checking only that the host appears somewhere in the policy is not enough,
//    and that weaker check is what the first version of this test did. It went
//    green while PDF previews were about to break for everyone: the Supabase
//    host was present in connect-src, so the test was satisfied, but the
//    previews render a signed storage URL in an <iframe>, which frame-src
//    governs — and frame-src did not list it. Presence is not permission.
const REQUIRED_IN = new Map([
  ['accounts.google.com', ['script-src', 'frame-src', 'connect-src', 'style-src']],
  ['js.paystack.co', ['script-src', 'frame-src']],
  ['api.paystack.co', ['connect-src']],
  ['checkout.paystack.com', ['frame-src', 'connect-src', 'form-action']],
  ['challenges.cloudflare.com', ['script-src', 'frame-src']],
  ['static.cloudflareinsights.com', ['script-src', 'connect-src']],
  // Data and realtime, plus signed storage URLs shown in the FilePreview iframe.
  ['dxekronjsvnwmnbanlqh.supabase.co', ['connect-src', 'frame-src']],
  ['fonts.googleapis.com', ['style-src']],
  ['fonts.gstatic.com', ['font-src']],
  ['images.unsplash.com', ['connect-src']],
]);

// Slice the policy into its directives so each can be inspected on its own.
const directives = new Map(
  mainCsp
    .replace(/^[^"]*"/, '').replace(/"\s*always;?\s*$/, '')
    .split(';').map((d) => d.trim()).filter(Boolean)
    .map((d) => { const [name, ...vals] = d.split(/\s+/); return [name, vals]; }),
);

for (const [host, where] of [...found].sort()) {
  if (NOT_LOADED.has(host)) continue;
  const needed = REQUIRED_IN.get(host);
  if (!needed) {
    failures++;
    console.log(`x ${host} is loaded by ${where} and this test does not know which directive should allow it`);
    console.log('    add it to REQUIRED_IN with the directives that govern it, or to NOT_LOADED if the browser never fetches it');
    continue;
  }
  for (const directive of needed) {
    const values = directives.get(directive) || [];
    if (!values.some((v) => v.includes(host))) {
      failures++;
      console.log(`x ${host} is loaded by ${where} but ${directive} does not allow it`);
      console.log(`    ${directive} is currently: ${values.join(' ') || '(absent, so it falls back to default-src)'}`);
    }
  }
}

if (failures) { console.error(`\nFAILED, ${failures} CSP problem(s)`); process.exit(1); }
console.log(`CSP allows all ${REQUIRED_IN.size} externally-loaded origins in the right directives, and reports violations. ALL PASSED`);
