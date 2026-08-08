// Every motion child inside <AnimatePresence> must carry a key.
//
// This is not style policing. Framer Motion tracks presence BY KEY: a keyless
// child gets mounted and then never unmounted on exit. That is exactly how the
// landing page's mobile menu shipped broken — it opened, and then nothing
// closed it (not the burger, not tapping away), because the node stayed in the
// DOM forever while React state flipped correctly underneath. The bug is
// invisible in code review and invisible in a build; only a live click finds
// it. So we check it here instead.
//
// Run:  node test/animatepresence_keys.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../client/src/', import.meta.url).pathname;

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : (/\.jsx?$/.test(f) ? [p] : []);
});

let failures = 0;
for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  if (!src.includes('AnimatePresence')) continue;
  for (const block of src.matchAll(/<AnimatePresence[^>]*>(.*?)<\/AnimatePresence>/gs)) {
    for (const child of block[1].matchAll(/<motion\.\w+\b([^>]*?)>/gs)) {
      if (!/\bkey=/.test(child[1])) {
        failures++;
        const line = src.slice(0, block.index + child.index).split('\n').length;
        console.log(`✗ ${file.replace(SRC, 'client/src/')}:${line}`);
        console.log('    motion child inside AnimatePresence has no key — it will never unmount on exit');
      }
    }
  }
}

if (failures) {
  console.error(`\nFAILED, ${failures} keyless AnimatePresence child(ren)`);
  process.exit(1);
}
console.log('Every AnimatePresence child is keyed, so exits actually unmount. ALL PASSED');
