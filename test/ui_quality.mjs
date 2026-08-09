// Three UI defects that no build, review or type-check will ever catch.
//
// Each was found by measuring the rendered product rather than reading the
// source, and each is invisible until someone is inconvenienced by it:
//
//   1. Money that isn't right-aligned. 32 of the 33 money cells in the suites
//      were left-aligned, which makes a column of amounts impossible to
//      compare — ₦9,500.00 and ₦12,000,000.00 start at the same x.
//
//   2. `outline: none` with nothing put back. A keyboard user tabbing to the
//      product's main search box had no indication they had landed on it,
//      because `.cmd-search input` (0,1,1) outranks the global
//      `:focus-visible` (0,1,0) and the shared ring never applied.
//
//   3. An empty table that says nothing useful. "Nothing here." tells someone
//      staring at a blank screen neither whether it is broken nor what would
//      make something appear.
//
// Run:  node test/ui_quality.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../client/src/', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk(root);
const jsx = files.filter((f) => /\.jsx$/.test(f));
// Comments are stripped BEFORE the rules are split. Without this, a rule
// preceded by an explanatory comment has that comment swallowed into its
// selector, so ".cmd-search:focus-within" reads as
// "/* … */ .cmd-search:focus-within" and never matches. That produced a false
// failure against code that was already correct — the test was wrong, not the
// stylesheet.
const css = files.filter((f) => /\.css$/.test(f))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

const problems = [];

// --- 1. money columns are right-aligned -------------------------------------
// A money cell is one whose content is produced by a currency formatter. The
// first column is exempt: it is the row's identity, and right-aligning a name
// would be worse than left-aligning a number.
const MONEY_CALL = /\{\s*[A-Za-z_.]*(?:money|fmtN|naira|Money)[A-Za-z_.]*\s*\(/;

for (const file of jsx) {
  const src = readFileSync(file, 'utf8');
  const name = file.slice(root.length);
  for (const table of src.matchAll(/<table className="table[^"]*">([\s\S]*?)<\/table>/g)) {
    const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(table[0]);
    if (!body) continue;
    let dataRow = null;
    for (const tr of body[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
      if (tr[0].includes('colSpan')) continue;      // the empty-state row
      dataRow = tr[1]; break;
    }
    if (!dataRow) continue;
    const cells = dataRow.split(/(?=<td\b)/).filter((c) => c.trimStart().startsWith('<td'));
    cells.forEach((cell, i) => {
      if (i === 0 || !MONEY_CALL.test(cell)) return;
      const tag = /<td\b[^>]*>/.exec(cell)?.[0] || '';
      // Some tables do their own numeric styling with an inline style or a
      // suite-specific class; those are fine, they just have to do SOMETHING.
      const aligned = /\bnum\b/.test(tag) || /textAlign:\s*'right'/.test(tag)
        || /\bta-r\b/.test(tag) || /-num"/.test(tag) || /\.\.\.num\b/.test(tag);
      if (!aligned) {
        problems.push(`${name}: a money cell in column ${i + 1} is not right-aligned. Add className="num" to the cell AND its <th>, so the column can be read down.`);
      }
    });
  }
}

// --- 2. nothing removes a focus ring without replacing it -------------------
// Rule: a selector that sets `outline: none` must, in the same rule, provide a
// visible substitute (a box-shadow or a border-colour change), or the element
// it lives in must have a :focus-within rule that does.
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
  selector: m[1].trim().replace(/\s+/g, ' '),
  body: m[2],
}));
const focusWithinSelectors = rules
  .filter((r) => r.selector.includes(':focus-within'))
  .map((r) => r.selector.replace(/:focus-within.*$/, '').trim());

// An element that takes focus itself — a range input, say — is covered by its
// OWN :focus-visible rule; it does not need a container. Only elements that
// cannot show their own ring rely on :focus-within further up.
const selfFocusSelectors = rules
  .filter((r) => /:focus(-visible)?\b/.test(r.selector) && /box-shadow|border-color|outline/i.test(r.body))
  .map((r) => r.selector.replace(/:focus(-visible)?\b.*$/, '').trim());

for (const rule of rules) {
  if (!/outline:\s*none/i.test(rule.body)) continue;
  const substitutes = /box-shadow|border-color/i.test(rule.body);
  if (substitutes) continue;
  // Does an ancestor class in this selector have its own :focus-within?
  const covered = focusWithinSelectors.some((fw) => fw && rule.selector.startsWith(fw))
    || selfFocusSelectors.some((sf) => sf && sf === rule.selector);
  if (!covered) {
    problems.push(`css: "${rule.selector}" sets outline:none with no visible replacement, and no :focus-within on its container. A keyboard user cannot see where they are. Add a :focus-within ring on the wrapper, or a box-shadow here.`);
  }
}

// --- 3. empty states say something ------------------------------------------
// A blank table is the moment someone decides whether the product is working.
const USELESS = /^(nothing here\.?|no data\.?|none\.?|empty\.?|n\/a)$/i;
for (const file of jsx) {
  const src = readFileSync(file, 'utf8');
  const name = file.slice(root.length);
  for (const m of src.matchAll(/className="td-empty"[^>]*>\s*([^<{][^<]*?)\s*</g)) {
    const text = m[1].trim();
    if (USELESS.test(text)) {
      problems.push(`${name}: the empty state reads "${text}". Say what would make something appear here, or what the person should do next.`);
    }
  }
}

if (problems.length) {
  console.error('UI quality problems:\n');
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`\nFAILED, ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('Money columns are right-aligned, focus is always visible, and empty states explain themselves. ALL PASSED');
