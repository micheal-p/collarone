// A missing secret must never mean "let everyone in".
//
// automations-run.js shipped with `if (secret && req.headers.authorization !== ...)`.
// Read it quickly and it looks like a guard. It isn't: when CRON_SECRET is
// unset the whole condition is false and the request sails through. CRON_SECRET
// was never set on the production box, so a write endpoint that creates tasks
// and notices in EVERY tenant was open to anyone who knew the URL.
//
// The pattern is seductive because it makes local development convenient. This
// test exists so convenience can't quietly reopen the door.
//
// Run:  node test/no_fail_open_secrets.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = [
  new URL('../client/api/', import.meta.url).pathname,
  new URL('../server/', import.meta.url).pathname,
];

const walk = (dir) => {
  let out = [];
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules') continue;
    const p = join(dir, f);
    out = out.concat(statSync(p).isDirectory() ? walk(p) : (/\.m?js$/.test(f) ? [p] : []));
  }
  return out;
};

// `if (SOMETHING_SECRET && <comparison>)` — the guard that evaporates when the
// secret is absent.
const FAIL_OPEN = /if\s*\(\s*!?\s*(\w*(?:secret|SECRET|token|TOKEN|key|KEY)\w*)\s*&&[^)]*(?:!==|!=|===|==)/;

let failures = 0;
for (const root of ROOTS) {
  let files = [];
  try { files = walk(root); } catch { continue; }
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
      const m = FAIL_OPEN.exec(line);
      if (m && !/^\s*if\s*\(\s*!/.test(line)) {
        failures++;
        console.log(`✗ ${file.split('/').slice(-2).join('/')}:${i + 1}`);
        console.log(`    ${line.trim()}`);
        console.log(`    '${m[1]}' being unset skips this check entirely — refuse the request instead.`);
      }
    });
  }
}

if (failures) {
  console.error(`\nFAILED, ${failures} fail-open secret check(s)`);
  process.exit(1);
}
console.log('No fail-open secret checks: a missing secret refuses, never admits. ALL PASSED');
