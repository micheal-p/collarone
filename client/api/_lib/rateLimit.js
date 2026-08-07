// Token-bucket rate limiter, in memory, per key (usually IP + route).
//
// Classic token bucket: a bucket holds up to `capacity` tokens, refilling
// continuously at `refillPerSec`. Each request spends one token; an empty
// bucket means 429. Bursts up to `capacity` pass instantly (a human retrying
// twice is fine), sustained hammering settles to the refill rate.
//
// In-memory is correct here on purpose: this runs inside the single
// long-lived Express process on the VPS (server/index.js), not on serverless,
// so the buckets persist across requests. A restart clears them — acceptable,
// the guarded actions are cheap-but-abusable, not billing-critical.
const buckets = new Map();
let lastSweep = Date.now();

export function allow(key, { capacity = 5, refillPerSec = 1 / 15 } = {}) {
  const now = Date.now();

  // Sweep occasionally so one-time visitors don't accumulate forever.
  if (now - lastSweep > 10 * 60 * 1000) {
    lastSweep = now;
    for (const [k, b] of buckets) if (now - b.last > 30 * 60 * 1000) buckets.delete(k);
  }

  let b = buckets.get(key);
  if (!b) { b = { tokens: capacity, last: now }; buckets.set(key, b); }
  b.tokens = Math.min(capacity, b.tokens + ((now - b.last) / 1000) * refillPerSec);
  b.last = now;
  if (b.tokens >= 1) { b.tokens -= 1; return true; }
  return false;
}

// The one honest thing to tell a throttled human.
export const LIMIT_MESSAGE = 'Too many attempts from this connection — wait a minute and try again.';
