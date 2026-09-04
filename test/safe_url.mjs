// User-supplied URLs must never reach an href/Link raw.
//
// Org websites and applicant portfolio links are entered by users and shown as
// clickable links to others. Raw, they allow `javascript:`-scheme XSS and
// `//host` / `/\host` open-redirects (the latter a react-router <Link> CVE).
// safeExternalUrl() normalises them to safe http(s) or null.
//
// Run:  node test/safe_url.mjs
import { readFileSync } from 'node:fs';
import { safeExternalUrl, safeLinkOrEmpty, safeImageSrc, safeInternalPath } from '../client/src/lib/safeUrl.js';

let failures = 0;

// 0. safeLinkOrEmpty — CTA buttons: keep anchors/paths/http(s), drop the rest.
for (const [input, expected] of [
  ['#contact', '#contact'],
  ['/shop', '/shop'],
  ['//evil.com', ''],
  ['/\\evil.com', ''],
  ['javascript:alert(1)', ''],
  ['mailto:hi@x.com', 'mailto:hi@x.com'],
  ['acme.com', 'https://acme.com/'],
  ['', ''],
]) {
  const got = safeLinkOrEmpty(input);
  if (String(got) !== String(expected)) {
    failures++;
    console.log(`✗ safeLinkOrEmpty(${JSON.stringify(input)}) = ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
  }
}
// storefront content is sanitised centrally before any theme renders it
if (!readFileSync(new URL('../client/src/pages/site/PublicSite.jsx', import.meta.url), 'utf8')
      .includes('safeLinkOrEmpty(b.content.button_link)')) {
  failures++;
  console.log('✗ PublicSite.jsx no longer sanitises button_link centrally');
}

// 1. The helper itself.
const cases = [
  ['acme.com', 'https://acme.com/'],
  ['https://acme.com', 'https://acme.com/'],
  ['//evil.com', null],
  ['/\\evil.com', null],
  ['\\\\evil.com', null],
  ['javascript:alert(1)', null],
  ['data:text/html,x', null],
  ['/internal', null],
  ['http://ok.io/x', 'http://ok.io/x'],
  ['', null],
];
for (const [input, expected] of cases) {
  const got = safeExternalUrl(input);
  if (String(got) !== String(expected)) {
    failures++;
    console.log(`✗ safeExternalUrl(${JSON.stringify(input)}) = ${got}, expected ${expected}`);
  }
}

// 2. Each known user-URL field must be sanitised via safeExternalUrl, AND must
//    never appear raw in an href={<field>} (the old unsafe form).
const SITES = [
  ['client/src/pages/careers/CareersApply.jsx', 'org.website', /(?:href|to)=\{org\.website\}/],
  ['client/src/suites/hr/RecruitingApp.jsx', 'app.candidate.portfolio_url', /href=\{app\.candidate\.portfolio_url\}/],
  ['client/src/pages/PlatformAdmin.jsx', 'org.external_website_url', /href=\{org\.external_website_url\}/],
  ['client/src/pages/PlatformAdmin.jsx', 'p.website', /href=\{\/\^https\?/],
  ['client/src/pages/admin/website/WebsiteBuilder.jsx', 'org.externalWebsiteUrl', /href=\{org\.externalWebsiteUrl\}/],
];
for (const [file, field, rawPattern] of SITES) {
  const src = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  if (!src.includes(`safeExternalUrl(${field})`)) {
    failures++;
    console.log(`✗ ${file}: ${field} is not passed through safeExternalUrl()`);
  }
  if (rawPattern.test(src)) {
    failures++;
    console.log(`✗ ${file}: ${field} still rendered raw in an href`);
  }
}

if (failures) { console.error(`\nFAILED: ${failures} safe-URL check(s)`); process.exit(1); }
console.log('User URLs are sanitised before they become links. ALL PASSED');

// ---- <img src> from user-supplied letterhead settings ----------------------
// letterheadTemplates.js built `<img src="${d.logo}">` by concatenation and
// rendered it via dangerouslySetInnerHTML — the one interpolation in that file
// that skipped esc(). `details` is arbitrary jsonb, so a quote in the value
// broke out of the attribute and injected markup into a letter that is then
// filed to Documents and downloaded as HTML.
//
// Logos and signatures are legitimately data: URLs (compressLogo and
// compressSignature both produce canvas.toDataURL), so a blanket http(s)-only
// rule would silently blank every signature. Allow those two shapes, nothing
// else.
{
  let bad = 0;
  const allow = (v, why) => { if (safeImageSrc(v) === null) { bad++; console.log(`✗ image src wrongly rejected (${why}): ${v.slice(0, 40)}`); } };
  const reject = (v, why) => { if (safeImageSrc(v) !== null) { bad++; console.log(`✗ image src wrongly allowed (${why}): ${v.slice(0, 40)}`); } };

  allow('data:image/png;base64,iVBORw0KGgo=', 'drawn or compressed signature');
  allow('data:image/jpeg;base64,/9j/4AAQ', 'compressed logo');
  allow('https://x.supabase.co/storage/v1/logo.png', 'uploaded logo URL');

  reject('x" onerror="alert(1)', 'attribute breakout — the actual vulnerability');
  reject('javascript:alert(1)', 'javascript scheme');
  reject('data:text/html;base64,PHNjcmlwdD4=', 'html masquerading as an image');
  reject('data:image/svg+xml;base64,PHN2Zz4=', 'svg can carry script');
  reject('//evil.com/x.png', 'protocol-relative');

  if (bad) { console.error(`\nFAILED, ${bad} image-src problem(s)`); process.exit(1); }
  console.log('Letterhead image sources are sanitised. ALL PASSED');
}

// ---- ?next= on the login page ----------------------------------------------
// Login hand-rolled `startsWith('/') && !startsWith('//')` to decide whether a
// ?next= path was same-origin. A backslash defeats that check: browsers treat
// \ as / when parsing a URL, so `/\evil.ng` passes the guard and resolves to
// https://evil.ng. The result is a phishing hop wearing our own domain, the
// victim signs in on the real collarone.app and is handed to the attacker.
// safeInternalPath() replaces the guard, and this locks the bypasses out.
{
  let bad = 0;
  const keep = (v, why) => { if (safeInternalPath(v) === null) { bad++; console.log(`x next= wrongly dropped (${why}): ${JSON.stringify(v)}`); } };
  const drop = (v, why) => { const got = safeInternalPath(v); if (got !== null) { bad++; console.log(`x next= wrongly allowed (${why}): ${JSON.stringify(v)} -> ${JSON.stringify(got)}`); } };

  keep('/workspace', 'the ordinary deep link');
  keep('/suite/payroll?tab=runs', 'query string survives');
  keep('/admin/billing#plan', 'hash survives');

  drop('/\\evil.ng', 'THE BUG: backslash open-redirect, react-router CVE shape');
  drop('/\\\\evil.ng', 'double backslash');
  drop('/\\/evil.ng', 'backslash then slash');
  drop('//evil.ng', 'protocol-relative');
  drop('https://evil.ng', 'absolute off-origin URL');
  drop('javascript:alert(1)', 'javascript scheme');
  drop('/\nevil.ng', 'control character the parser would strip');
  drop('workspace', 'not a path at all');
  drop('', 'empty');
  drop(null, 'absent');

  // The guard that used to live in Login.jsx, kept here so the bypass it missed
  // stays visible: if someone reintroduces it, this fails loudly.
  const oldGuard = (r) => typeof r === 'string' && r.startsWith('/') && !r.startsWith('//');
  if (!oldGuard('/\\evil.ng')) { bad++; console.log('x the regression case no longer describes the old bug'); }

  if (bad) { console.error(`\nFAILED, ${bad} next= problem(s)`); process.exit(1); }
  console.log('Login ?next= stays on our own origin. ALL PASSED');
}
