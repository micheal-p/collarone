// Regenerate the FAQPage block in client/index.html from client/src/config/faqs.js.
//
// Google's rule for FAQPage markup is that the questions and answers must be
// visible on the page. Ours are: the landing page renders the same array. The
// failure mode is drift — the page copy gets rewritten and the markup keeps
// describing the old words, which is markup claiming content the page doesn't
// have. That had already happened to 9 of 15 answers before this script existed.
//
// Run:  node ops/sync-faq-jsonld.mjs
// Check without writing:  node ops/sync-faq-jsonld.mjs --check
import { readFileSync, writeFileSync } from 'node:fs';
import { FAQS } from '../client/src/config/faqs.js';

const FILE = new URL('../client/index.html', import.meta.url);
const html = readFileSync(FILE, 'utf8');

// JSON-LD is JSON, so JSON.stringify handles the escaping. Only the HTML-unsafe
// characters need care, since this sits inside a <script> element.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const block = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((f) => ({
    '@type': 'Question',
    name: esc(f.q),
    acceptedAnswer: { '@type': 'Answer', text: esc(f.a) },
  })),
};

const START = '<script type="application/ld+json" data-faq>';
const END = '</script>';
const i = html.indexOf(START);
if (i === -1) {
  console.error(`No FAQ block found. Mark it in client/index.html as:\n  ${START} … ${END}`);
  process.exit(2);
}
const j = html.indexOf(END, i);
const current = html.slice(i + START.length, j);
const next = `\n${JSON.stringify(block, null, 2)}\n    `;

if (current.trim() === next.trim()) {
  console.log(`FAQ structured data is in sync (${FAQS.length} questions).`);
  process.exit(0);
}
if (process.argv.includes('--check')) {
  console.error('FAQ structured data is STALE. Run: node ops/sync-faq-jsonld.mjs');
  process.exit(1);
}
writeFileSync(FILE, html.slice(0, i + START.length) + next + html.slice(j), 'utf8');
console.log(`Rewrote the FAQPage block from faqs.js (${FAQS.length} questions).`);
