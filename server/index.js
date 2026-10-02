// Self-hosted equivalent of Vercel's file-based /api routing (client/api/*.js).
// Each handler already uses the standard Vercel Node signature (req, res),
// so they run unmodified here.
//
// ONE SUPERVISOR, SEVERAL WORKERS
//
// This used to be a single Node process: one CPU core however big the box,
// and any crash took every /api route down until systemd noticed. Now the
// process systemd starts is a small supervisor that forks one API worker per
// core (capped, see workerCount) and shares port 4000 between them; the
// kernel hands each new connection to the next worker in turn. That is the
// load balancing, on this box, with nothing to change in nginx.
//
// What the supervisor keeps, because doing it per worker would be wrong:
//   * the schedules (watchdog, the daily automation sweep). Run per worker,
//     every customer would get each morning's reminder once per core.
//   * the rate-limit buckets (client/api/_lib/rateLimit.js asks over IPC).
//     Per worker, every limit would quietly multiply by the worker count.
//   * restarting a worker that dies, with a growing delay if it keeps dying,
//     so one bad request costs one worker for a second, not the whole API.
//
// WEB_CONCURRENCY=1 (or a one-core box) runs exactly as before: one process,
// everything in it.
import cluster from 'node:cluster';
import os from 'node:os';
import express from 'express';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { take } from '../client/api/_lib/rateLimit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(__dirname, '..', 'client', 'api');
const port = process.env.PORT || 4000;

// One worker per core, at most four, and fewer on a small box: each worker can
// launch its own headless Chromium for invoice PDFs (~150-250MB once warm),
// and running out of memory is a worse failure than running a little slower.
function workerCount() {
  const asked = Number(process.env.WEB_CONCURRENCY);
  if (Number.isInteger(asked) && asked > 0) return Math.min(asked, 16);
  const cores = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  const byMemory = Math.max(1, Math.floor(os.totalmem() / (768 * 1024 * 1024)));
  return Math.max(1, Math.min(cores, byMemory, 4));
}
const WORKERS = workerCount();

if (cluster.isPrimary && WORKERS > 1) {
  runSupervisor();
} else {
  await runApi();
  // Single-process mode: nobody else will run the schedules.
  if (cluster.isPrimary) startSchedules();
}

function runSupervisor() {
  let stopping = false;
  const recentDeaths = [];
  const fork = () => cluster.fork({ COLLARONE_WORKERS: String(WORKERS) });

  cluster.on('message', (worker, m) => {
    if (m?.type === 'ratelimit:ask') {
      let allowed = true;
      try { allowed = take(m.key, m.opts || {}); } catch { /* never block on a bad key */ }
      try { worker.send({ type: 'ratelimit:answer', id: m.id, allowed }); } catch { /* worker already gone */ }
    }
  });

  cluster.on('exit', (worker, code, signal) => {
    if (stopping) return;
    const now = Date.now();
    recentDeaths.push(now);
    while (recentDeaths.length && now - recentDeaths[0] > 60_000) recentDeaths.shift();
    // A worker that dies on boot would otherwise be re-forked in a tight loop.
    // Back off as deaths pile up within a minute: 0.5s, 1s, 2s ... up to 30s.
    const delay = Math.min(30_000, 500 * 2 ** Math.max(0, recentDeaths.length - 1));
    console.error(`api worker ${worker.process.pid} exited (${signal || code}); replacing in ${delay}ms`);
    setTimeout(() => { if (!stopping) fork(); }, delay);
  });

  for (let i = 0; i < WORKERS; i++) fork();
  console.log(`collarone-api supervisor ${process.pid}: ${WORKERS} workers on 127.0.0.1:${port}`);
  startSchedules();

  // systemd stop/restart sends SIGTERM. Let each worker finish what it is
  // serving (it stops accepting, completes in-flight requests), then leave.
  const stop = (sig) => {
    if (stopping) return;
    stopping = true;
    console.log(`supervisor: ${sig}, draining ${Object.keys(cluster.workers || {}).length} workers`);
    for (const w of Object.values(cluster.workers || {})) w?.process.kill('SIGTERM');
    const done = () => { if (!Object.keys(cluster.workers || {}).length) process.exit(0); };
    cluster.on('exit', done);
    done();
    setTimeout(() => process.exit(0), 15_000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

async function runApi() {
  const app = express();
  // Behind nginx (a single proxy hop): derive req.ip from the trusted chain so a
  // client-sent X-Forwarded-For can't be spoofed. The job-post report dedup keys
  // off req.ip, so this prevents forged reports from hiding posts.
  app.set('trust proxy', 1);
  // Keep the raw request bytes alongside the parsed body — webhook HMAC
  // signatures (Paystack x-paystack-signature) are computed over the raw body,
  // and a re-stringified JSON.parse round-trip would not match byte-for-byte.
  // The type list matters: a browser posts a CSP violation as
  // `application/csp-report` (or `application/reports+json` via the newer
  // Reporting API), never as `application/json`. Without these, express.json
  // leaves req.body empty and every violation report is silently discarded —
  // which is the same "reporting to nowhere" the Report-Only policy already
  // suffered from, just moved one step later.
  app.use(express.json({
    type: ['application/json', 'application/csp-report', 'application/reports+json'],
    verify: (req, _res, buf) => { req.rawBody = buf; },
  }));

  // Each handler answers on two paths, deliberately.
  //
  // `/api/<name>` is what the app itself calls and what DeviceGuide.jsx has
  // already published to hardware integrators — an attendance terminal bolted to
  // a customer's wall has POST https://collarone.app/api/punch burned into its
  // configuration. That path can never be withdrawn, whatever we build later.
  //
  // `/api/v1/<name>` is the same handler under a base URL that carries a promise:
  // a customer integrating against v1 gets to keep the shape they built on, and
  // the day something has to change incompatibly it becomes v2 while v1 keeps
  // answering. Retrofitting that after somebody depends on you is the expensive
  // version of this, so it is done now, while the only integrator is us.
  //
  // Same function, no duplicated logic, no behaviour change today.
  for (const file of readdirSync(apiDir).filter((f) => f.endsWith('.js'))) {
    const name = file.slice(0, -3);
    const { default: handler } = await import(pathToFileURL(path.join(apiDir, file)));
    app.all(`/api/${name}`, (req, res) => handler(req, res));
    app.all(`/api/v1/${name}`, (req, res) => handler(req, res));
  }

  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`collarone-api ${cluster.isWorker ? `worker ${process.pid}` : process.pid} listening on 127.0.0.1:${port}`);
  });
  // nginx keeps upstream connections for up to 60s; the server must hold them a
  // little longer, or nginx reuses a socket Node has just closed and the
  // customer gets a 502. The request timeout stops one stuck request (a slow
  // client trickling bytes) holding a worker forever; two minutes still covers
  // the slowest real thing here, a cold PDF render.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 120_000;

  // Stop accepting, finish what is in flight, then exit. A deploy or a worker
  // replacement should cost nobody a half-sent invoice.
  const drain = () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections?.();
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', drain);
  if (cluster.isWorker) process.on('SIGINT', () => {}); // Ctrl-C goes to the supervisor, which drains us

  // A thrown error that escaped a handler leaves this process in an unknown
  // state. Log it and let the worker be replaced rather than limp on; in
  // single-process mode systemd restarts it, as before.
  process.on('uncaughtException', (e) => {
    console.error('uncaught exception, worker exiting:', e);
    drain();
  });
}

// Everything below runs ONCE, in the supervisor (or the single process). The
// loopback fetches land on whichever worker the kernel picks, which is fine:
// the point is that they are sent once.
function startSchedules() {
  // The watchdog clock: the platform examines itself every 30 minutes instead
  // of waiting for a founder to notice something. The handler (client/api/
  // watchdog.js) only answers loopback callers, so this in-process interval is
  // its sole trigger. First run shortly after boot, then on the half hour.
  const runWatchdog = () => {
    fetch(`http://127.0.0.1:${port}/api/watchdog`, { method: 'POST' })
      .then((r) => r.json()).then((d) => {
        if (d?.findings?.length) console.log(`watchdog: ${d.findings.map((f) => f.kind).join(', ')}`);
      })
      .catch((e) => console.error('watchdog run failed:', e.message));
  };
  setTimeout(runWatchdog, 2 * 60 * 1000);
  setInterval(runWatchdog, 30 * 60 * 1000);

  // The automation clock.
  //
  // The Automation suite advertises six daily checks — expiring documents,
  // overdue probations, forgotten clock-outs, overdue invoices, low stock,
  // pending approvals. Nothing on this box ever ran them. The endpoint was
  // written for Vercel Cron, and when the product moved to this VPS the
  // schedule did not come with it, so the checks only fired if a human happened
  // to load a page that triggered them. A reminder that only arrives when you
  // are already looking is not a reminder.
  //
  // Daily rather than half-hourly: these are deadlines measured in days, and
  // nobody wants the same "invoice overdue" banner every thirty minutes.
  // CRON_SECRET is required (the endpoint fails closed without it), so if the
  // variable is missing we say so once at boot instead of failing silently every
  // morning at nine.
  const runAutomations = () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return; // already reported at boot, below
    fetch(`http://127.0.0.1:${port}/api/automations-run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
      .then((r) => r.json())
      .then((d) => { if (d?.ran) console.log(`automations: ${JSON.stringify(d.ran).slice(0, 200)}`); })
      .catch((e) => console.error('automation sweep failed:', e.message));
  };

  if (!process.env.CRON_SECRET) {
    console.warn('automations: CRON_SECRET is not set, so the daily sweep will not run. Set it to switch the Automation suite on.');
  } else {
    // 09:00 Lagos, then every 24h. Computed from the current Lagos time rather
    // than the server's, so a box in another timezone still fires in the morning
    // for the customer.
    const nowLagos = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
    const next = new Date(nowLagos);
    next.setHours(9, 0, 0, 0);
    if (next <= nowLagos) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - nowLagos.getTime();
    setTimeout(() => { runAutomations(); setInterval(runAutomations, 24 * 60 * 60 * 1000); }, delay);
    console.log(`automations: first sweep in ${Math.round(delay / 60000)} min, then daily at 09:00 Lagos`);
  }
}
