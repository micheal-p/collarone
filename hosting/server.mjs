// ============================================================================
// Collarone self-hosted server — the Vercel exit, in one process.
//
//   * Serves the built client (client/dist) with the same SPA fallback the
//     vercel.json rewrite provided.
//   * Mounts every function in client/api/* at /api/<name> — the handlers are
//     plain (req, res) functions and run unchanged under Express.
//   * Replaces Vercel Cron with an in-process scheduler:
//       - /api/health every 5 minutes (the handler self-throttles history
//         writes, so calling often is safe and gives the status page real
//         5-minute resolution instead of Vercel's once-a-day ceiling)
//       - /api/automations-run daily at 09:30 (Bearer CRON_SECRET, same gate
//         Vercel used)
//
// Run behind nginx (see nginx.conf.example) under pm2 (ecosystem.config.cjs).
// Config comes from hosting/.env — copy .env.example and fill it in.
// ============================================================================
import express from 'express';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.join(HERE, '..', 'client');
const DIST = path.join(CLIENT, 'dist');
const API_DIR = path.join(CLIENT, 'api');

// ---- tiny .env loader (no extra dependency) --------------------------------
const envFile = path.join(HERE, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT || 3001);
const app = express();
app.set('trust proxy', true); // behind nginx: x-forwarded-* are trustworthy
app.use(express.json({ limit: '4mb' }));
app.use(express.text({ type: 'text/plain', limit: '1mb' }));

// ---- API: every file in client/api becomes /api/<name> ---------------------
const handlers = new Map(); // lazy-loaded once, then cached
const apiNames = readdirSync(API_DIR).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, ''));

app.all('/api/:name', async (req, res) => {
  const { name } = req.params;
  if (!apiNames.includes(name)) return res.status(404).json({ message: 'Not found' });
  try {
    if (!handlers.has(name)) {
      const mod = await import(path.join(API_DIR, `${name}.js`));
      handlers.set(name, mod.default);
    }
    return await handlers.get(name)(req, res);
  } catch (e) {
    console.error(`[api/${name}]`, e);
    if (!res.headersSent) res.status(500).json({ message: 'Server error.' });
  }
});

// ---- static client + SPA fallback (mirror of the vercel.json rewrite) ------
app.use(express.static(DIST, { index: false, maxAge: '1h', setHeaders: (res, p) => {
  // hashed bundles are immutable; index.html must always revalidate
  if (/assets\//.test(p)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
} }));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/assets/')) return res.status(404).end();
  res.sendFile(path.join(DIST, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } });
});

app.listen(PORT, () => console.log(`Collarone server on :${PORT} — ${apiNames.length} api functions, dist=${existsSync(DIST) ? 'ok' : 'MISSING (run npm run build in client/)'}`));

// ---- scheduler: what Vercel Cron used to do ---------------------------------
const hit = async (p, headers = {}) => {
  try { await fetch(`http://127.0.0.1:${PORT}${p}`, { headers }); }
  catch (e) { console.error(`[cron ${p}]`, e.message); }
};

// status heartbeat — every 5 minutes (handler self-throttles history writes)
setInterval(() => hit('/api/health'), 5 * 60 * 1000);
hit('/api/health'); // one on boot so the status page is warm immediately

// daily automations at 09:30 Africa/Lagos (server assumed UTC+1; adjust if not)
let lastAutomationsDay = '';
setInterval(() => {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  if (now.getHours() === 9 && now.getMinutes() >= 30 && lastAutomationsDay !== day) {
    lastAutomationsDay = day;
    hit('/api/automations-run', process.env.CRON_SECRET ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {});
  }
}, 60 * 1000);
