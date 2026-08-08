// Every tour step must point at something that exists.
//
// ProductTour deliberately skips a step whose [data-tour] target isn't on
// screen — that's how it hides steps for features a given user can't see. The
// cost of that kindness is that a TYPO also disappears silently: the step just
// never shows, the tour is quietly one step shorter, and nothing complains.
// Anchors are collected across the WHOLE app, not per file: Launcher defines
// steps that spotlight the topbar, which AppLayout renders. Checking per file
// reported those as broken when they are fine.
//
// Run:  node test/tour_targets.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../client/src', import.meta.url).pathname;

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});

const files = walk(ROOT).filter((f) => /\.(jsx|js)$/.test(f));

// Every anchor the app renders anywhere.
//
// The negative lookbehind is the whole point. A step's own selector is the
// string '[data-tour="foo"]', which matches a naive /data-tour="…"/ — so the
// first version of this test checked every step against itself and passed even
// when the real anchor had been renamed. Only a match NOT preceded by '[' is a
// rendered attribute.
const literals = new Set();
const prefixes = [];
const steps = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/(?<!\[)data-tour="([^"{]+)"/g)) literals.add(m[1]);
  // Templated anchors: data-tour={`foo-${bar}`} — the fixed prefix is all that
  // can be checked statically, which still catches a misspelt prefix.
  for (const m of src.matchAll(/data-tour=\{`([^`$]*)\$\{/g)) if (m[1]) prefixes.push(m[1]);
  for (const m of src.matchAll(/target:\s*'\[data-tour="([^"]+)"\]'/g)) {
    steps.push({ target: m[1], file: file.replace(ROOT, 'client/src') });
  }
}

let checked = 0;
let failures = 0;
for (const { target, file } of steps) {
  checked++;
  if (literals.has(target) || prefixes.some((p) => target.startsWith(p))) continue;
  failures++;
  console.log(`✗ ${file}\n    step targets [data-tour="${target}"] but nothing in the app renders it`);
}

if (!checked) {
  console.error('✗ Found no tour steps at all — did the pattern change?');
  process.exit(1);
}
if (failures) {
  console.error(`\nFAILED, ${failures} of ${checked} tour targets point at nothing`);
  process.exit(1);
}
console.log(`All ${checked} tour steps point at a real anchor. ALL PASSED`);

// ---- tours must exist for real customers, and be substantial ---------------
// demoTours.js was imported by exactly one file — the public /try demo — so a
// paying customer opening a suite for the first time got no guidance at all.
// Every tour was also 3 steps except payroll's 7, and three steps cannot teach
// a module. Both are regressions worth failing a build over.
{
  const { readFileSync } = await import('node:fs');
  const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  let bad = 0;

  const shell = src('../client/src/pages/SuiteShell.jsx');
  if (!/CoachTour/.test(shell) || !/tourForSuite/.test(shell)) {
    console.log('✗ SuiteShell.jsx no longer runs the guided tour — signed-in customers get no walkthrough'); bad++;
  }
  if (!/Take the tour/.test(shell)) {
    console.log('✗ SuiteShell.jsx has no replay affordance; a tour you can only see once is a tour you cannot re-read'); bad++;
  }

  const tours = src('../client/src/config/demoTours.js');
  const MIN = 5;
  for (const m of tours.matchAll(/ {2}'?([\w-]+)'?: \[/g)) {
    const key = m[1];
    if (key === '_generic') continue;
    let i = m.index + m[0].length, depth = 1, steps = 0;
    while (i < tours.length && depth > 0) {
      const c = tours[i];
      if (c === '[') depth++;
      else if (c === ']') depth--;
      else if (c === '{' && depth === 1) steps++;
      i++;
    }
    if (steps < MIN) { console.log(`✗ tour "${key}" has only ${steps} steps — too thin to teach the module (min ${MIN})`); bad++; }
  }

  if (bad) { console.error(`\nFAILED, ${bad} tour coverage problem(s)`); process.exit(1); }
  console.log('Tours run in the real app and every suite has a substantial walkthrough. ALL PASSED');
}
