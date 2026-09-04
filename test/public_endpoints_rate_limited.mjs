// Every unauthenticated write endpoint must be rate limited.
//
// These are the handlers anyone on the internet can POST to without an account.
// The content guards (Turnstile, AI spam scoring, share tokens, length caps)
// all answer "is this request legitimate". None of them answer "how many of
// these will we accept from one connection", and several of these endpoints
// spend real money per call: OpenAI credit on job-post 'structure', and an
// outbound call to a CUSTOMER'S Paystack account on both payment endpoints.
//
// job-post.js carried "real per-IP rate-limiting is a v1.1 TODO (needs a
// store)" for months. The store existed the whole time; the note predated the
// move off serverless onto one long-lived Express process, where the in-memory
// bucket in _lib/rateLimit.js simply works. This test exists so the next such
// endpoint cannot quietly ship in the same state.
//
// Run:  node test/public_endpoints_rate_limited.mjs
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const read = (f) => readFileSync(`${root}client/api/${f}`, 'utf8');

// Open to the internet, writes something or spends something. Must throttle.
const MUST_LIMIT = [
  'signup.js',
  'job-post.js',
  'public-form.js',
  'invoice-pay.js',
  'site-pay.js',
  'support-notify.js',
  'onboard-ai.js',
];

// Open but deliberately unthrottled. Each line is a claim to defend.
const EXEMPT = new Map([
  ['track.js', 'a fire-and-forget beacon that writes analytics and CSP reports; throttling it would drop the evidence it exists to collect, and it makes no outbound call'],
  ['paystack-webhook.js', 'not caller-controlled: rejected unless it carries a valid Paystack HMAC signature'],
  ['invoice-webhook.js', 'same, HMAC verified before anything happens'],
]);

let failures = 0;

for (const file of MUST_LIMIT) {
  const src = read(file);
  const imports = /from '\.\/_lib\/rateLimit\.js'/.test(src);
  const calls = /\ballow\(/.test(src);
  if (!imports || !calls) {
    failures++;
    console.log(`x ${file} is an open write endpoint with no rate limit`);
    console.log(`    import { allow, LIMIT_MESSAGE } from './_lib/rateLimit.js' and refuse with 429`);
  }
}

// Guard the exemptions too: if one of them grows an outbound fetch it is no
// longer cheap, and the claim above stops being true.
for (const [file, why] of EXEMPT) {
  if (/paystack-webhook|invoice-webhook/.test(file)) continue;  // signature gated
  const src = read(file);
  if (/\bfetch\(/.test(src)) {
    failures++;
    console.log(`x ${file} is exempt from rate limiting on the grounds that it "${why}"`);
    console.log(`    but it now makes an outbound fetch(), so that reasoning no longer holds`);
  }
}

if (failures) { console.error(`\nFAILED, ${failures} unthrottled public endpoint(s)`); process.exit(1); }
console.log(`All ${MUST_LIMIT.length} open write endpoints are rate limited, ${EXEMPT.size} exemptions declared. ALL PASSED`);
