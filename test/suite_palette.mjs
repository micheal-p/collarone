// The suite tile palette has to stay legible.
//
// This exists because payroll and automation shipped with the SAME hex, and
// five unrelated suites (hr, leave, crm, finance, compliance) were greens close
// enough that the launcher read as a wall of one colour. Nobody noticed for
// months, because a colour clash produces no error, no failing build and no
// console warning — it just quietly makes the product look careless.
//
// Colour on the launcher carries meaning: it encodes which family a suite
// belongs to, matching the sidebar groups. That only works while the families
// are visibly distinct from each other, so all four rules below are enforced:
//
//   1. no two suites share a hex;
//   2. the white glyph on the tint clears 3:1 (WCAG non-text contrast);
//   3. two suites from DIFFERENT families are clearly distinguishable, and no
//      tint sits near the grey a locked tile uses — a live suite that looks
//      locked is worse than an ugly colour;
//   4. two suites from the SAME family are still told apart.
//
// Rule 4 was added after the launcher was looked at rather than reasoned
// about. The original note here said same-family similarity was "the design,
// not a defect" — and that was too generous by half. HR and Payroll sat 40
// apart, Trade Docs and Finance 40, Inventory and Procurement 43, and at tile
// size each pair read as one colour. Related is the goal; identical is a bug.
// The floor is 65 and the closest pair now sits at 74.
//
// Run:  node test/suite_palette.mjs
import { readFileSync } from 'node:fs';

const SRC = new URL('../client/src/config/suites.js', import.meta.url).pathname;
const src = readFileSync(SRC, 'utf8');

// Which family each suite belongs to. Kept here rather than in the app config
// because it is a property of the PALETTE, not of the product — the app never
// needs to know, and a second copy in shipped code would only drift.
const FAMILY = {
  hr: 'people', leave: 'people', payroll: 'people', attendance: 'people',
  crm: 'money', 'trade-docs': 'money', finance: 'money', chat: 'money',
  inventory: 'stock', procurement: 'stock',
  tasks: 'work', projects: 'work', documents: 'work',
  visitors: 'visitors', compliance: 'compliance', automation: 'automation',
};

// --- read the tints out of the config ---------------------------------------
const tints = new Map();
for (const m of src.matchAll(/(\w[\w-]*)'?:\s*\{[^}]*?tint: '(#[0-9a-fA-F]{6})'/g)) {
  tints.set(m[1], m[2].toLowerCase());
}
// The pinned Chat tool declares its tint in a different shape.
const chat = /key: 'chat'[\s\S]{0,400}?tint: '(#[0-9a-fA-F]{6})'/.exec(src);
if (chat) tints.set('chat', chat[1].toLowerCase());

// --- colour maths -----------------------------------------------------------
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const luminance = (h) => {
  const [r, g, b] = rgb(h).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastWithWhite = (h) => 1.05 / (luminance(h) + 0.05);
// Weighted RGB distance. Not a real perceptual space, but far closer to one
// than plain Euclidean RGB, and it needs no dependency to compute.
const distance = (a, b) => {
  const A = rgb(a); const B = rgb(b);
  const rm = (A[0] + B[0]) / 2;
  return Math.sqrt(
    (2 + rm / 256) * (A[0] - B[0]) ** 2
    + 4 * (A[1] - B[1]) ** 2
    + (2 + (255 - rm) / 256) * (A[2] - B[2]) ** 2,
  );
};

// A locked tile paints its icon with rgba(10,14,26,0.28) over the card, which
// resolves to roughly this. A live suite must never land near it.
const LOCKED_GREY = '#babdc4';
const MIN_CONTRAST = 3;      // WCAG 2.1 non-text contrast
const MIN_CROSS_FAMILY = 70; // measured: the shipped palette sits at 79
// Same-family colours are meant to be RELATED, not interchangeable. Three
// pairs were close enough to read as one colour on the launcher — that is what
// "the cards all look the same" turned out to mean.
const MIN_WITHIN_FAMILY = 65; // measured: the closest pair sits at 74
const MIN_VS_LOCKED = 150;

const problems = [];

// --- rule 0: every suite actually has one -----------------------------------
for (const key of Object.keys(FAMILY)) {
  if (!tints.has(key)) problems.push(`${key}: no tint found in suites.js (renamed, or the config shape changed — update FAMILY here too)`);
}
for (const key of tints.keys()) {
  if (!FAMILY[key]) problems.push(`${key}: has a tint but no family in test/suite_palette.mjs — add it, so its colour is checked against the others`);
}

const keys = [...tints.keys()].filter((k) => FAMILY[k]);

// --- rule 1: no duplicates ---------------------------------------------------
const byHex = new Map();
for (const key of keys) {
  const hex = tints.get(key);
  if (byHex.has(hex)) problems.push(`${byHex.get(hex)} and ${key} are both ${hex} — two suites cannot share a colour`);
  else byHex.set(hex, key);
}

// --- rule 2: white glyph is readable ----------------------------------------
for (const key of keys) {
  const c = contrastWithWhite(tints.get(key));
  if (c < MIN_CONTRAST) {
    problems.push(`${key} (${tints.get(key)}): white icon contrast is ${c.toFixed(2)}:1, below ${MIN_CONTRAST}:1 — pick a darker shade`);
  }
}

// --- rule 3: families stay apart, and nothing looks locked -------------------
for (let i = 0; i < keys.length; i++) {
  for (let j = i + 1; j < keys.length; j++) {
    const a = keys[i]; const b = keys[j];
    const d = distance(tints.get(a), tints.get(b));
    if (FAMILY[a] === FAMILY[b]) {
      if (d < MIN_WITHIN_FAMILY) {
        problems.push(`${a} (${tints.get(a)}) and ${b} (${tints.get(b)}) are both ${FAMILY[a]} and only ${d.toFixed(0)} apart, below ${MIN_WITHIN_FAMILY} — same family should read as related, not identical`);
      }
      continue;
    }
    if (d < MIN_CROSS_FAMILY) {
      problems.push(`${a} (${FAMILY[a]}, ${tints.get(a)}) and ${b} (${FAMILY[b]}, ${tints.get(b)}) are only ${d.toFixed(0)} apart, below ${MIN_CROSS_FAMILY} — different families must look different`);
    }
  }
}
for (const key of keys) {
  const d = distance(tints.get(key), LOCKED_GREY);
  if (d < MIN_VS_LOCKED) {
    problems.push(`${key} (${tints.get(key)}) is ${d.toFixed(0)} from the locked-tile grey — a live suite would look locked`);
  }
}

// --- the launcher line each tile shows --------------------------------------
// Long copy is why the grid was ragged. `desc` stays long on purpose (it runs
// on the marketing page); `short` is the tile line and is clamped to two lines
// at roughly 26 characters each, so anything much past that is silently cut.
const MAX_SHORT = 56;
for (const m of src.matchAll(/key: '([\w-]+)',[\s\S]{0,400}?short: '((?:[^'\\]|\\.)*)'/g)) {
  const [, key, short] = m;
  if (short.length > MAX_SHORT) {
    problems.push(`${key}: short is ${short.length} chars, over ${MAX_SHORT} — it will be cut off mid-sentence on the tile`);
  }
}

if (problems.length) {
  console.error('Suite palette problems:\n');
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`\nFAILED, ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`Checked ${keys.length} suite tints: all distinct, readable, and family-separated. ALL PASSED`);
