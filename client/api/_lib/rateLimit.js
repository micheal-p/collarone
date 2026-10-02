// Token-bucket rate limiter, in memory, per key (usually IP + route).
//
// Classic token bucket: a bucket holds up to `capacity` tokens, refilling
// continuously at `refillPerSec`. Each request spends one token; an empty
// bucket means 429. Bursts up to `capacity` pass instantly (a human retrying
// twice is fine), sustained hammering settles to the refill rate.
//
// In memory, in ONE place. server/index.js runs several API workers so the
// box uses every core, and a bucket per worker would quietly multiply every
// limit by the number of workers. So a worker asks the supervisor process,
// which holds the only set of buckets, over the cluster IPC channel. A single
// process (local dev, the tests, WEB_CONCURRENCY=1) keeps them itself.
// A restart clears them — acceptable, the guarded actions are
// cheap-but-abusable, not billing-critical.
import cluster from 'node:cluster';
import { randomUUID } from 'node:crypto';

const buckets = new Map();
let lastSweep = Date.now();

// The bucket itself. Synchronous; called directly in a single process and by
// the supervisor on a worker's behalf.
export function take(key, { capacity = 5, refillPerSec = 1 / 15 } = {}) {
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

// Ask the supervisor. If it does not answer within half a second (it is
// restarting, or the channel is gone), decide locally rather than hang the
// request: a briefly looser limit beats a frozen sign-up form.
const pending = new Map();
let listening = false;
function askSupervisor(key, opts) {
  if (!listening) {
    listening = true;
    process.on('message', (m) => {
      if (m?.type !== 'ratelimit:answer') return;
      const done = pending.get(m.id);
      if (done) { pending.delete(m.id); done(m.allowed); }
    });
  }
  return new Promise((resolve) => {
    const id = randomUUID();
    const timer = setTimeout(() => { pending.delete(id); resolve(take(key, opts)); }, 500);
    pending.set(id, (allowed) => { clearTimeout(timer); resolve(allowed); });
    try { process.send({ type: 'ratelimit:ask', id, key, opts }); }
    catch { clearTimeout(timer); pending.delete(id); resolve(take(key, opts)); }
  });
}

// Every caller awaits this: `if (!(await allow(key, opts))) refuse with 429`.
export function allow(key, opts) {
  if (cluster.isWorker && typeof process.send === 'function') return askSupervisor(key, opts);
  return Promise.resolve(take(key, opts));
}

// The one honest thing to tell a throttled human.
export const LIMIT_MESSAGE = 'Too many attempts from this connection — wait a minute and try again.';
