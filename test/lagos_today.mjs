// "Today" must mean today in Lagos.
//
// `new Date().toISOString().slice(0, 10)` is the UTC date. Nigeria is UTC+1,
// so for the hour between midnight and 1am Lagos time it returns YESTERDAY.
// Everything keyed on it is wrong during that hour: the attendance board shows
// the previous day, leave starting "tomorrow" is rejected as past, a task due
// today reads overdue. That hour is exactly when night-shift staff clock in,
// which is the workforce attendance was built for.
//
// Every "what day is it" must go through client/src/lib/today.js.
//
// Run:  node test/lagos_today.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../client/src/', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : (/\.jsx?$/.test(f) ? [p] : []);
});

let failures = 0;
for (const file of walk(SRC)) {
  if (file.endsWith('lib/today.js')) continue;
  const src = readFileSync(file, 'utf8');
  src.split('\n').forEach((line, i) => {
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
    if (/new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/.test(line)) {
      failures++;
      console.log(`✗ ${file.replace(SRC, 'client/src/')}:${i + 1} — UTC date used as "today"`);
      console.log(`    use todayISO() from lib/today.js instead`);
    }
    if (/new Date\(\)\.getFullYear\(\)\}-\$\{String\(.*getMonth/.test(line)) {
      failures++;
      console.log(`✗ ${file.replace(SRC, 'client/src/')}:${i + 1} — device-local date used as "today"`);
    }
  });
}

if (failures) {
  console.error(`\nFAILED, ${failures} place(s) computing "today" outside Lagos`);
  process.exit(1);
}
console.log('Every "today" is computed in Lagos. ALL PASSED');
