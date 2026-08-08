// A delete that was refused must say so.
//
// Under row-level security, a DELETE whose rows the policy hides does not
// error — it simply removes nothing and reports success. Every delete in the
// API facade used to be written as:
//
//     const { error } = await supabase.from('x').delete().eq('id', id);
//     if (error) fail(400, error.message);
//     return { ok: true };
//
// so a user without permission saw "Deleted." and a row that was still there,
// and only found out later when it reappeared on a refresh. Silent failure is
// worse than an error, because the user stops trusting what the screen says.
//
// The fix is `.select('id')` plus a check that something actually went. This
// test stops the old shape coming back.
//
// Run:  node test/no_silent_deletes.mjs
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../client/src/api/supabaseApi.js', import.meta.url), 'utf8');
const lines = src.split('\n');

let failures = 0;
lines.forEach((line, i) => {
  if (!/\.delete\(\)/.test(line)) return;
  // The whole statement may wrap, so look at a small window.
  const stmt = lines.slice(i, i + 3).join(' ');
  if (!/\.select\(/.test(stmt)) {
    failures++;
    console.log(`✗ supabaseApi.js:${i + 1} — delete with no .select(), so a refusal looks like success`);
    console.log(`    ${line.trim()}`);
    return;
  }
  // and the result must actually be checked
  const after = lines.slice(i, i + 6).join(' ');
  if (!/if \(!\w+\?\.length\)/.test(after)) {
    failures++;
    console.log(`✗ supabaseApi.js:${i + 1} — delete selects rows but never checks whether any were removed`);
  }
});

if (failures) {
  console.error(`\nFAILED, ${failures} delete(s) that can report success while doing nothing`);
  process.exit(1);
}
const total = lines.filter((l) => /\.delete\(\)/.test(l)).length;
console.log(`All ${total} deletes confirm a row actually went. ALL PASSED`);
