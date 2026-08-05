// Turnstile must protect the public forms without ever breaking them.
//
// Two properties this guards:
//   1. Graceful default — with no TURNSTILE_SECRET, verifyTurnstile() returns
//      ok (skipped), so submissions keep working until Turnstile is configured.
//      With the secret set, a missing token is rejected.
//   2. The gate function handles every action the forms send (careers-apply,
//      embed-lead), and the forms only hard-require a token when TURNSTILE_ON.
//
// Run:  node test/turnstile_graceful.mjs
import { readFileSync } from 'node:fs';

let failures = 0;
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// 1. verifyTurnstile graceful/strict behaviour.
const { verifyTurnstile } = await import('../client/api/_lib/turnstile.js');
delete process.env.TURNSTILE_SECRET;
const noSecret = await verifyTurnstile('', null);
if (!noSecret.ok || !noSecret.skipped) { failures++; console.log('✗ verifyTurnstile should skip (ok) when no secret is set'); }
process.env.TURNSTILE_SECRET = 'x';
const noToken = await verifyTurnstile('', null);
if (noToken.ok) { failures++; console.log('✗ verifyTurnstile should reject a missing token once the secret is set'); }
delete process.env.TURNSTILE_SECRET;

// 2. The gate function covers both form actions.
const fn = read('client/api/public-form.js');
for (const action of ['careers-apply', 'embed-lead']) {
  if (!fn.includes(`'${action}'`)) { failures++; console.log(`✗ public-form.js does not handle action '${action}'`); }
}

// 3. Each form only blocks on a token behind TURNSTILE_ON (no hard dependency).
for (const [file, marker] of [
  ['client/src/pages/careers/CareersApply.jsx', 'TURNSTILE_ON && !token'],
  ['client/src/pages/embed/EmbedContactForm.jsx', 'TURNSTILE_ON && !token'],
]) {
  if (!read(file).includes(marker)) { failures++; console.log(`✗ ${file} should gate its token requirement on TURNSTILE_ON`); }
}

if (failures) { console.error(`\nFAILED: ${failures} turnstile check(s)`); process.exit(1); }
console.log('Turnstile is graceful when off, enforced when on, and covers every public form. ALL PASSED');
