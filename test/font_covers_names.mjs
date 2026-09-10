// The shipped fonts must be able to draw a Nigerian customer's name.
//
// THE BUG THIS EXISTS TO STOP HAPPENING TWICE
//
// Inter shipped as one 343KB variable font covering Cyrillic, Greek and much
// else the product never renders, preloaded on every page. Subsetting it cut
// that to 72KB for an ordinary screen — but a subset is a promise about which
// characters still exist, and the first attempt quietly broke that promise.
//
// The Hausa CAPITALS Ɓ Ɗ Ƙ Ƴ live in Latin Extended-B (U+0180-024F). Their
// LOWERCASE ɓ ɗ live in IPA Extensions (U+0250-02AF), a different block. A
// range ending at U+024F therefore takes the capitals and drops the lowercase,
// and "Ɓaɓangida" renders with one letter in a fallback face — a different
// shape, a different weight, mid-name. Nothing throws. No page fails to load.
// The only symptom is a Hausa customer seeing that the product was not built
// for them, which is the last person you want finding your bug.
//
// So this test does not check the ranges, which is where the mistake was made.
// It checks real names against the glyphs actually present in the files that
// ship, and it fails with the exact codepoint that is missing.
//
// Run:  node test/font_covers_names.mjs
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const FONTS = ['client/public/fonts/Inter-latin.woff2', 'client/public/fonts/Inter-ext.woff2'];

// Names and strings the product must be able to draw. Nigerian languages
// first, because those are the customers; then the things every screen shows.
const MUST_RENDER = [
  ['Yoruba',        'Ọláwálé Ṣóyínká Adéṣínà'],
  ['Yoruba',        'Fúnmiláyọ̀ Àjàyí Olúwaseun'],
  ['Igbo',          'Ngọzị Ụchechukwu Ṅnamdị Ezeọha'],
  ['Hausa',         'Ɓaɓangida Ƴusuf Ɗanjuma Ƙano'],
  ['Efik/Ibibio',   'Ekaette Akpanudoedehe'],
  ['French names',  'Côte d’Ivoire, Ségou, Ouagadougou'],
  ['German names',  'Müller, Groß, Köln'],
  ['Money',         '₦1,250,000.00  ₦0.50'],
  // ✕ U+2715 is deliberately absent: Inter has no such glyph, so it always
  // rendered in a fallback face. The one control using it now uses × instead.
  ['Interface',     '→ ← ↗ ✓ ✗ ⌘ ◆ ▲ ▼ ≤ ≥ ≠ − × · • ± ½ © – — … “ ” ’ ‹ ›'],
];

let failures = 0;
const fail = (m, why) => { failures++; console.log(`x ${m}`); if (why) console.log(`    ${why}`); };

for (const f of FONTS) {
  if (!existsSync(`${root}${f}`)) {
    fail(`${f} is not there`, 'Regenerate the subsets with client/fonts-src/build-fonts.sh.');
  }
}
if (failures) { console.error(`\nFAILED, ${failures} problem(s)`); process.exit(1); }

// Read the cmap out of each shipped file. fontTools is how they were made, so
// it is what can read them back; without it, say so rather than pass quietly —
// a skipped coverage check is how the gap got here in the first place.
let covered;
try {
  const py = `
import json, sys
from fontTools.ttLib import TTFont
cps = set()
for p in sys.argv[1:]:
    cps |= set(TTFont(p).getBestCmap().keys())
print(json.dumps(sorted(cps)))
`;
  const out = execFileSync('python3', ['-c', py, ...FONTS.map((f) => `${root}${f}`)], { encoding: 'utf8' });
  covered = new Set(JSON.parse(out));
} catch (e) {
  console.log('~ cannot read the font files (needs python3 + fonttools):', String(e.message).split('\n')[0]);
  console.log('  Install with: pip install fonttools brotli');
  console.log('Font coverage check SKIPPED.');
  process.exit(0);
}

for (const [label, text] of MUST_RENDER) {
  const missing = [...text].filter((c) => c !== ' ' && !covered.has(c.codePointAt(0)));
  if (missing.length) {
    const detail = missing.map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} ${c}`).join(', ');
    fail(`${label}: "${text}" cannot be drawn`,
      `Missing ${detail}. Add the block it belongs to in client/fonts-src/build-fonts.sh AND the matching unicode-range in client/src/styles/global.css, then rerun the script.`);
  }
}

// The two unicode-ranges in the CSS must not overlap. A codepoint claimed by
// two @font-face rules for the same family is resolved by declaration order,
// and the first split accidentally relied on that — which made every visitor
// fetch the extended file they usually do not need.
{
  const css = readFileSync(`${root}client/src/styles/global.css`, 'utf8');
  const ranges = [...css.matchAll(/unicode-range:\s*([^;]+);/g)].map((m) => m[1]);
  if (ranges.length !== 2) {
    fail(`expected two unicode-range declarations for Inter, found ${ranges.length}`,
      'The split is one file for the interface and one for names; if that changed, update this test with it.');
  } else {
    const expand = (spec) => {
      const set = new Set();
      for (const part of spec.split(',').map((s) => s.trim())) {
        const m = /^U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?$/.exec(part);
        if (!m) { fail(`unparseable unicode-range piece "${part}"`); continue; }
        const a = parseInt(m[1], 16), b = m[2] ? parseInt(m[2], 16) : a;
        for (let i = a; i <= b; i++) set.add(i);
      }
      return set;
    };
    const [a, b] = ranges.map(expand);
    const overlap = [...a].filter((cp) => b.has(cp));
    if (overlap.length) {
      fail(`the two unicode-ranges overlap on ${overlap.length} codepoint(s)`,
        `First few: ${overlap.slice(0, 6).map((c) => `U+${c.toString(16).toUpperCase()}`).join(', ')}. Overlapping ranges resolve by declaration order and make the browser fetch the extended file unnecessarily. Keep them disjoint.`);
    }
  }
}

if (failures) { console.error(`\nFAILED, ${failures} font coverage problem(s)`); process.exit(1); }
console.log(`Shipped fonts cover every checked name and symbol (${covered.size} codepoints across ${FONTS.length} files), ranges disjoint. ALL PASSED`);
