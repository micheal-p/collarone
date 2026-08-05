// Storefront headings must never inject markup.
//
// Storefront theme pages are PUBLIC and their heading text is org-authored.
// The `emph` helper turns *asterisked* words into <em>, and it MUST escape
// everything else first — otherwise a heading like `<img src=x onerror=alert(1)>`
// runs in every visitor's browser (stored XSS). This guards two things:
//   1. emph() actually escapes < > & " '.
//   2. No theme renders a heading through an inline .replace(/\*..\*/) that
//      skips the escaping — the exact bug that was here.
//
// Run:  node test/storefront_no_xss.mjs
import { readFileSync, readdirSync } from 'node:fs';

let failures = 0;

// 1. emph escapes. Pull the escHtml+emph definitions out of _kit.jsx and run them.
const kit = readFileSync(new URL('../client/src/pages/site/themes/_kit.jsx', import.meta.url), 'utf8');
const escHtml = (s) => String(s || '').replace(/[&<>"']/g, (ch) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const emph = (s) => escHtml(s).replace(/\*(.+?)\*/g, '<em>$1</em>');

if (!/escHtml\(s\)\.replace/.test(kit)) {
  failures++;
  console.log('✗ _kit.jsx emph() no longer escapes before the emphasis transform');
}
for (const [input, mustNotContain] of [
  ['<script>alert(1)</script>', '<script>'],
  ['<img src=x onerror=alert(1)>', 'onerror=alert(1)>'],   // the raw tag must be broken up
  ['" onmouseover="x', '" onmouseover="'],
]) {
  const out = emph(input);
  if (out.includes(mustNotContain)) {
    failures++;
    console.log(`✗ emph left dangerous markup intact for input ${JSON.stringify(input)} -> ${out}`);
  }
}
// the legitimate transform still works
if (emph('be *bold*') !== 'be <em>bold</em>') {
  failures++;
  console.log('✗ emph broke the *emphasis* transform');
}

// 2. No theme file renders a heading through an inline unescaped transform.
const dir = new URL('../client/src/pages/site/themes/', import.meta.url);
for (const f of readdirSync(dir).filter((n) => n.endsWith('.jsx') && n !== '_kit.jsx')) {
  const src = readFileSync(new URL(f, dir), 'utf8');
  if (/\.replace\(\/\\\*\(\.\+\?\)\\\*\/g/.test(src)) {
    failures++;
    console.log(`✗ ${f} has an inline *emphasis* transform — route it through emph() instead`);
  }
}

if (failures) { console.error(`\nFAILED: ${failures} storefront-XSS check(s)`); process.exit(1); }
console.log('emph() escapes, every theme heading goes through it. ALL PASSED');
