// Guard: the FAQPage markup in client/index.html must say exactly what the
// landing page shows.
//
// Google's requirement for FAQPage rich results is that the question and answer
// text is visible on the page. Ours is, because both come from
// client/src/config/faqs.js — but index.html is a static file, so it only stays
// true while someone remembers to re-run the sync. This makes forgetting a
// build failure instead of a silent SEO penalty.
//
// It had already drifted once: 9 of 15 answers in the markup described copy
// that had been rewritten on the page months earlier.
//
// Run:  node test/faq_jsonld_matches.mjs
import { readFileSync } from 'node:fs';
import { FAQS } from '../client/src/config/faqs.js';

const html = readFileSync(new URL('../client/index.html', import.meta.url), 'utf8');

const START = '<script type="application/ld+json" data-faq>';
const i = html.indexOf(START);
if (i === -1) {
  console.error('✗ No data-faq JSON-LD block in client/index.html');
  process.exit(1);
}
const raw = html.slice(i + START.length, html.indexOf('</script>', i));

let block;
try {
  block = JSON.parse(raw);
} catch (e) {
  console.error(`✗ The FAQ JSON-LD does not parse: ${e.message}`);
  process.exit(1);
}

const unesc = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const marked = (block.mainEntity || []).map((q) => ({
  q: unesc(q.name),
  a: unesc(q.acceptedAnswer?.text || ''),
}));

let failures = 0;
const fail = (msg) => { failures++; console.log(`✗ ${msg}`); };

if (marked.length !== FAQS.length) {
  fail(`markup has ${marked.length} questions, the page renders ${FAQS.length}`);
}

for (const [n, page] of FAQS.entries()) {
  const m = marked[n];
  if (!m) { fail(`question ${n + 1} is missing from the markup: "${page.q}"`); continue; }
  if (m.q !== page.q) fail(`question ${n + 1} differs\n    page:   ${page.q}\n    markup: ${m.q}`);
  if (m.a !== page.a) {
    fail(`answer ${n + 1} differs ("${page.q}")\n    page:   ${page.a.slice(0, 90)}…\n    markup: ${m.a.slice(0, 90)}…`);
  }
}

if (failures) {
  console.error(`\nFAILED, ${failures} mismatch(es). Fix with: node ops/sync-faq-jsonld.mjs`);
  process.exit(1);
}
console.log(`FAQ markup matches the page (${FAQS.length} questions). ALL PASSED`);
