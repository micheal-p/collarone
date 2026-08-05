// User-supplied URLs must never reach an href/Link raw.
//
// Org websites and applicant portfolio links are entered by users and shown as
// clickable links to others. Raw, they allow `javascript:`-scheme XSS and
// `//host` / `/\host` open-redirects (the latter a react-router <Link> CVE).
// safeExternalUrl() normalises them to safe http(s) or null.
//
// Run:  node test/safe_url.mjs
import { readFileSync } from 'node:fs';
import { safeExternalUrl, safeLinkOrEmpty } from '../client/src/lib/safeUrl.js';

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
