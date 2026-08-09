// A "type this to confirm" box must accept what it told you to type.
//
// Deleting an organisation was unfollowable as written. The instruction sat in
// a .pc-field span, which platform.css renders `text-transform: uppercase`, so
// an org with the slug "hdh" was told to type "HDH" — while the gate demanded
// an exact match against the lowercase original. Typing precisely what the
// screen said failed, and the disabled button gave no reason, so the honest
// conclusion was that delete is broken. It was reported as exactly that.
//
// The trap is worth a test because neither half looks wrong alone: the CSS is
// ordinary label styling, and an exact string comparison is the obvious way to
// write a confirmation gate. Only together do they lock the user out, and
// nothing in a build or a review surfaces the combination.
//
// Two rules for any destructive confirm-by-typing box:
//   1. the comparison normalises case and surrounding whitespace;
//   2. the token the user must type is NOT rendered inside an element that CSS
//      transforms, so what is displayed is what is accepted.
//
// Run:  node test/destructive_confirm.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : (/\.jsx?$/.test(p) ? [p] : []);
});

const problems = [];

// --- which class names does the CSS uppercase? ------------------------------
// Read them rather than hard-coding, so a new uppercasing label style is
// covered the day it is added.
const cssDir = new URL('../client/src/styles/', import.meta.url).pathname;
const uppercasing = new Set();
for (const file of readdirSync(cssDir).filter((f) => f.endsWith('.css'))) {
  const css = readFileSync(join(cssDir, file), 'utf8');
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/text-transform:\s*uppercase/i.test(m[2])) continue;
    for (const cls of m[1].matchAll(/\.([\w-]+)/g)) uppercasing.add(cls[1]);
  }
}

// --- find the confirm-by-typing modals --------------------------------------
const srcDir = new URL('../client/src/', import.meta.url).pathname;
let found = 0;

for (const file of walk(srcDir)) {
  const src = readFileSync(file, 'utf8');
  // A component that both asks the user to type something to confirm and gates
  // a control on what they typed.
  if (!/to confirm|Confirm by typing/i.test(src)) continue;
  const rel = file.slice(srcDir.length);

  // Narrow to the component containing the instruction, so an unrelated
  // comparison elsewhere in a large file cannot satisfy or fail this.
  const at = src.search(/to confirm|Confirm by typing/i);
  const from = src.lastIndexOf('function ', at);
  const block = src.slice(from === -1 ? 0 : from, at + 2500);
  if (!/disabled=\{/.test(block)) continue;
  found++;

  // --- rule 1 ---------------------------------------------------------------
  const normalises = /toLowerCase\(\)|toUpperCase\(\)|localeCompare\([^)]*sensitivity/.test(block);
  const trims = /\.trim\(\)/.test(block);
  if (!normalises) {
    problems.push(`${rel}: a confirm-by-typing gate compares exactly, without normalising case. If any CSS uppercases the displayed token, typing what the screen says will fail. Compare with .toLowerCase() on both sides.`);
  }
  if (!trims) {
    problems.push(`${rel}: a confirm-by-typing gate does not .trim() the typed value — a trailing space pasted in silently blocks the action.`);
  }

  // --- rule 2 ---------------------------------------------------------------
  // The token must not be rendered inside one of the uppercasing classes.
  for (const m of block.matchAll(/<(\w+)[^>]*className="([^"]*)"[^>]*>([^<]*\{[^}]*\}[^<]*)</g)) {
    const classes = m[2].split(/\s+/);
    const hit = classes.find((c) => uppercasing.has(c));
    if (hit && /type/i.test(m[3])) {
      problems.push(`${rel}: the token the user must type is rendered inside .${hit}, which CSS uppercases — the instruction will not match the value the gate accepts.`);
    }
  }

  // --- and a disabled button has to say why --------------------------------
  if (!/doesn|not match|match/i.test(block)) {
    problems.push(`${rel}: nothing tells the user why the confirm button is still disabled. A grey button with no explanation reads as a broken feature.`);
  }
}

if (!found) {
  console.error('✗ found no confirm-by-typing gate to check — was the delete dialog removed, or its wording changed? Update this test.');
  process.exit(1);
}

if (problems.length) {
  console.error('Destructive confirmation problems:\n');
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`\nFAILED, ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`Checked ${found} confirm-by-typing gate(s): case-tolerant, trimmed, and they explain themselves. ALL PASSED`);
