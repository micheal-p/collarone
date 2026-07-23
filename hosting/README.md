# Collarone self-host package — ON THE SHELF, NOT IN USE

**Status: dormant.** Vercel is the live platform (collarone.vercel.app) and
stays that way until the operator explicitly decides to move. Nothing in this
folder runs in production today.

This package exists so that WHEN that decision comes, the migration is a
checklist, not a project. It has been smoke-tested locally end-to-end
(all 10 API functions, SPA fallback, asset caching).

## What's here
- `server.mjs` — one Node/Express service: serves `client/dist`, mounts every
  `client/api/*` function at `/api/<name>` unchanged, and replaces Vercel Cron
  (health every 5 min, automations daily 09:30).
- `.env.example` — every secret the server needs. Copy to `.env`, never commit.
- `nginx.conf.example` — front door: TLS, proxy, wildcard `*.collarone.app`.
- `ecosystem.config.cjs` — pm2 (auto-restart, zero-downtime reloads).
- `deploy.sh` — build → rsync → reload, one command.

## The day we move (checklist)
1. Server: install nginx, node, pm2; create `/opt/collarone`.
2. Copy `nginx.conf.example` into place; `certbot` for collarone.app + wildcard.
3. `hosting/.env` filled in from `.env.example` (Supabase service key, cron
   secret, Paystack, Resend, OpenAI, PAYWALL_ENFORCE).
4. `SERVER=user@host ./hosting/deploy.sh`
5. Test on the server's IP (hosts-file trick) — signup, an order, /api/health.
6. Only THEN flip collarone.app DNS. Vercel keeps running as fallback until
   confident, then wind it down.
