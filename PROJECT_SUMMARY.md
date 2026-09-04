# Collarone — project summary

Handoff doc for a fresh Claude session on another account. Point Claude at this file (or
paste it in) at the start of a new conversation so it doesn't have to rediscover any of
this. Last updated 2026-08-07 — but treat this as ORIENTATION, not current state: the
session-log and roadmap sections are a July snapshot and the repo moves fast. `git log`
is the truth for what exists. Landed since the July snapshot, among ~230 commits: tenant
subdomains live at `<slug>.collarone.app` (Cloudflare DNS/TLS), merchant Paystack
self-serve connect with live key verification, the attendance universal punch lane
(devices tab, `/api/punch`, `/docs/connect-device`), client-error-aware status page with
auto-recorded incidents, and the repo was disconnected from Vercel entirely.

**Contents**
1. [Quick start](#1-quick-start)
2. [The product](#2-the-product)
3. [The codebase](#3-the-codebase)
4. [Security & multi-tenancy](#4-security--multi-tenancy)
5. [House conventions](#5-house-conventions)
6. [Known outstanding issues](#6-known-outstanding-issues)
7. [Appendix: recent session log](#7-appendix-recent-session-log)
8. [Appendix: seeding a throwaway test org](#8-appendix-seeding-a-throwaway-test-org)

---

## 1. Quick start

- Repo: `~/Desktop/org-ops-erp` · GitHub: `https://github.com/micheal-p/collarone`
- Live app: `https://collarone.app` — served by nginx on the self-hosted VPS. Code ships
  via `deploy/deploy.sh` (rsync to `/opt/collarone/app`, then
  `systemctl restart collarone-api`); the GitHub repo is the source of truth but the VPS
  is NOT deployed from GitHub. The old `originerp-client-ni2e.vercel.app` Vercel
  deployment is legacy.
- No local `.env` exists in this checkout. To run locally:
  ```
  cd client && npm install && cp .env.example .env
  # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from a real Supabase project,
  # or set VITE_DEMO_MODE=true to explore the UI with mock data, no Supabase needed
  npm run dev
  ```
- First two files to read: **`client/src/config/suites.js`** (the master suite registry)
  and **`client/src/api/supabaseApi.js`** (the entire "backend," as one big router
  function). Between the two you can see almost everything the product does and how.

---

## 2. The product

**Collarone** — "the business platform for Nigerian companies: HR, payroll, CRM, finance
and more, all under one login." A company signs up, gets its own workspace, and turns on
whichever of 15 suites it needs. Staff accounts inside an org are admin-provisioned, not
self-signup. A separate Platform Admin role (Collarone's own team) manages
organizations/billing/status with no visibility into any tenant's business data.

> Started life as "Org-Ops Cloud ERP" for a company called Origin Tech Group, on a
> Node/Express/MongoDB stack — that was scrapped. The current app is a full rewrite on
> React + Supabase, still living in the same repo (the folder is still named
> `org-ops-erp` on disk; the product is called Collarone).

### The 15 suites (+ one free pinned tool)

Each suite is a folder under `client/src/suites/<name>/<Name>App.jsx` (folder names are
camelCase where multi-word — trade documents live in `suites/tradeDocs/`, not
`trade-docs/`) with a `supabase/<name>.sql` BASE schema — but several suites have
follow-on migration files their features depend on (`hr` also needs `lifecycle.sql`,
`careers.sql`, `hr_performance_compliance.sql`; `attendance` also needs
`attendance_shifts.sql`, `attendance_payroll.sql`, `attendance_phase1.sql`,
`attendance_punch_core.sql`). Provisioning from the base file alone gives a half-working
suite; grep `supabase/` for the suite name. Icons/tint colors are in `SUITE_META` inside
`suites.js`. `client/src/config/suites.js` is the authoritative registry — trust it over
this table.

| Tier | Suites |
|---|---|
| **Core** (6) | HR & Staff (`hr`) · Leave Management (`leave`) · Task & Report (`tasks`) · Visitor Management (`visitors`) · Payroll & Benefits (`payroll`) · Customers/CRM (`crm`) |
| **Extended** (9) | Time & Attendance (`attendance`) · Buying/Procurement (`procurement`) · Inventory & Assets (`inventory`) · Finance (`finance`) · Projects (`projects`) · Documents (`documents`) · Invoicing & Trade Docs (`trade-docs`) · Automation (`automation`) · Compliance Calendar (`compliance`) |

Former standalone suites were **merged**: `benefits` → Payroll & Benefits, `it-assets` →
Inventory & Assets — those keys no longer exist; don't seed or price against them.
**Team Chat** (`chat`) is a free `PINNED_TOOL`, deliberately OUTSIDE `SUITES`: anything
in `SUITES` becomes billable and changes renewal pricing, and
`test/pinned_tools_not_priced.mjs` fails the build if chat ever lands there.

Non-obvious depth worth knowing before you touch these:

- **HR** isn't just a directory. It has a full applicant-tracking system — job
  requisitions → candidates → applications (stage/rating/match-score) → interviews →
  offers → hire — plus a **public, unauthenticated job board** at `/careers/:orgSlug` and
  `/careers/:orgSlug/:id`. Backing tables: `job_requisitions`, `candidates`,
  `applications`, `interviews`, exposed publicly via a `public_job_postings` view. Also
  has Onboarding (probation tracking + generated checklists) and Offboarding tabs.
- **Projects**' kanban board reads from a *separate* `project_tasks` table — not the
  suite-level `tasks` table, and not `milestones`. Easy to get wrong when seeding test data.
- **Trade Documents** shares one `DocPreviewBody` component between the real print view
  and the live "preview while editing your letterhead" panel, both rendering from the
  same `TEMPLATE_CSS`/`SAMPLE_DOCS` — added 2026-07-16/17.
- **Automation** ships 6 real once-a-day checks today (low-stock alert, overdue-invoice
  reminder, new-lead auto-task, overdue-task alert, pending-leave reminder,
  stock-booking-expiry), run by the `automations-run.js` cron. Its UI also shows a
  clearly-labeled, non-toggleable "Roadmap" section for 4 not-yet-built ideas (AI call
  assistant, call transcripts/logs, AI email replies, custom automation builder) — each
  card states its real dependency (e.g. "needs a business phone line + call provider")
  instead of faking functionality.

---

## 3. The codebase

```
org-ops-erp/
├── client/            React (Vite) SPA — marketing site, suite launcher, admin center
│   ├── src/suites/    one folder per operational suite
│   ├── src/pages/     marketing/auth/platform-admin/careers pages
│   ├── src/api/       supabaseApi.js (real backend) + demo.js (mock, for VITE_DEMO_MODE)
│   ├── src/config/    suites.js — the master suite registry
│   └── api/           serverless-style API handlers (Vercel signature) — the only place
│                       holding the service-role key; in production they are served by
│                       server/index.js on the VPS, not by Vercel
├── supabase/          ~100 SQL migration files, one per suite/feature, run manually in order
├── server/            LIVE — server/index.js is the self-hosted API router that mounts
│                       client/api/*.js on the VPS (systemd service `collarone-api`).
│                       The old Express/Mongo code it replaced is gone; do NOT treat this
│                       folder as dead weight
├── deploy/            deploy.sh — how code actually ships to the VPS (GitHub Actions
│                       runs it on push to main; auto-reroll on runner-IP bans)
├── test/              static + live-DB guard tests (demo route parity, RLS probes,
│                       payroll golden, pricing/pinned-tool guards) — CI runs these
├── ops/hostinger/     self-hosting docs (Supabase self-hosted instead of cloud)
├── docs/              Microsoft SSO setup notes
└── legal/, scratchpad/  gitignored (signed agreements + prod-poking scripts — must never be pushed)
```

**Stack:** React 18 + Vite 6. No TypeScript. Plain CSS + inline styles — no Tailwind, no
CSS framework. Framer Motion for the marketing site's animation. Dependencies are
deliberately minimal — the full client list: `react`, `react-dom`, `react-router-dom`,
`@supabase/supabase-js`, `framer-motion`, `@vercel/analytics`, plus `pdfkit` and
`qrcode` (server-side invoice-PDF generation in `client/api/_lib/invoicePdf.js` — do not
hand-roll PDFs or QR codes, it exists). Check `client/package.json` before assuming.

**Backend is mostly SQL.** Supabase (Postgres + Auth + Storage) holds the overwhelming
majority of business logic as `SECURITY DEFINER` SQL functions/RPCs, not application
code — e.g. payroll runs statutory deductions in SQL, checkout re-reads prices
server-side. The client mostly does `supabase.from(...).select()` or calls an RPC.

**Where routes live:**
- `client/src/api/supabaseApi.js` — the de facto backend router. A single large function
  pattern-matches `METHOD /path` strings (React calls `apiGet('/projects/:id/tasks')`
  etc.) and translates each into a `supabase.from(...)` call. Start here to find what
  table backs a given UI feature.
- `client/src/api/demo.js` — parallel mock implementation for `VITE_DEMO_MODE=true`.
- `client/api/*.js` — API handlers in the Vercel `(req, res)` signature, the only code
  with the Supabase service-role key: org signup (`signup.js`), the daily automation cron
  (`automations-run.js`), payments/webhooks, a health check, analytics tracking. In
  production they run on the VPS behind nginx via `server/index.js` (systemd unit
  `collarone-api`), not on Vercel. Everything else talks to Supabase directly from the
  browser under RLS.

---

## 4. Security & multi-tenancy

- Every business table carries an `org_id` column. Row-Level Security is the real
  enforcement layer, gated almost everywhere by two SQL helpers: `same_org()` and
  `is_platform_admin()`.
- `enforce_phase1_suite_scope()` is a trigger whitelist controlling which suites a
  non-founding org can be granted. It now covers every current suite key (see
  `MULTI_TENANT_SAFE_SUITES` in `client/src/config/suites.js`), so any org can be granted
  any suite — this used to be narrower; check `supabase/*.sql` history if you need the
  old scope.
- `profiles.suites` is a JSONB array of `{ key, role }` — the actual UI gate, cross-checked
  server-side by RLS so a frontend bug can't leak access to an unpaid suite.
- Auth is Supabase Auth (`auth.users`). Seeding a user programmatically needs a
  **GoTrue-complete** row — bare `id`/`email` inserts aren't enough. Required:
  `instance_id`, `aud`, `role`, `encrypted_password` (via `crypt(pw, gen_salt('bf'))`),
  `email_confirmed_at`, empty-string token columns, plus a matching `auth.identities` row.
  Full working recipe in §8.

---

## 5. House conventions

Learned this session, not written down anywhere else in the repo:

- **No emojis anywhere in the UI** — inline SVGs only, via a local `I = {...}` icon
  object repeated per file (`I.chat`, `I.close`, etc.).
- **No TypeScript, no CSS framework.** Don't introduce either.
- Brand tokens (from `client/src/pages/Landing.css`): ink `#0A0E1A`, accent/"bolt" orange
  `#FF5B1F`, paper cream `#F4F1EA`. The dark "premium card" look (`.cl-pc`,
  `.cl-founder-card`) is a radial-gradient recipe worth reusing elsewhere.
- Contact forms default to Formspree/Web3Forms, not self-hosted email — M365 greylists
  new senders (a general opinion the user holds, not specific to this project).
- **Never add a `Co-Authored-By: Claude` git trailer.** Enforced both by user preference
  and by `"includeCoAuthoredBy": false` in `~/.claude/settings.json`.
- Only commit when explicitly asked. Never force-push without explicit confirmation for
  that specific push (one did happen this session, but only after an `AskUserQuestion`
  confirming that exact, described history rewrite).

---

## 6. Known outstanding issues

- ~~`collarone.app` parking page~~ **RESOLVED**: the domain now serves the live app from
  the self-hosted VPS (nginx + `collarone-api`), deployed via `deploy/deploy.sh`.
- ~~`supabase/platform_contact.sql` may not yet be run against production~~ **RESOLVED
  2026-09-04**: checked directly against the live database. `platform_contact_messages`
  and `public_submit_contact_message()` both exist, so `/contact` and the Platform Admin
  inbox have been working all along. The `kind` / demo-request columns were added on the
  same day by `supabase/demo_requests.sql`.
- Departments RLS gap remains an accepted older decision. Paystack and subdomains are
  NOT deferred anymore — both are fully built and live (merchant self-serve Paystack
  connect with encrypted keys + live verification; tenant sites at
  `<slug>.collarone.app` behind Cloudflare). What's pending there is paperwork, not
  code: Collarone's own Paystack business account approval, and Resend domain
  verification for email.
- Trade Documents' letterhead live-preview modal has a minor visual overflow — the
  invoice amount column gets clipped by about a digit at default modal width. Cosmetic,
  not yet fixed.

---

## 7. Appendix: recent session log

Work done 2026-07-16/17, roughly chronological, all pushed to `origin/main` unless noted:

1. **Landing page overhaul** — lightbox gallery for product screenshots; "why it feels
   different" section rebuilt as a connected timeline; pricing cards redone with a
   checkmark-row style and a working CSS-only hover tilt (previously clobbered by a
   Framer Motion `whileHover` inline style); About section rebuilt with a pull-quote and
   a dark founder-stats card; smarter tabbed FAQ; real `/contact` page +
   `platform_contact_messages` table + a Platform Admin inbox panel to reply from any channel.
2. **Trade Documents** — added a live letterhead preview: edit settings on the left, see
   a real sample invoice update instantly on the right, before saving.
3. **Automation suite** — redesigned with real suite icons/tints per card, added the
   "Roadmap" section described in §2.
4. **Hero rotating headline** — wording replaced per user-supplied phrases; fixed two
   real bugs along the way: a layout-jump from `AnimatePresence` collapsing the wrapper
   between words (fixed with a fixed `height`), and a mobile text-overflow bug from one
   new phrase being too long (fixed by shortening + a mobile font-size clamp).
5. **Git history rewrite** (destructive, done with explicit user confirmation) — rewrote
   author/committer identity across 97 commits to remove a stray
   `norgroupltd123@gmail.com` identity, then force-pushed. Verified via GitHub's REST
   API, not just the UI — the Contributors sidebar widget lags an async stats-recompute
   job by up to a day after any history rewrite.
6. **README + root `package.json` rewritten** to describe the real Collarone/Supabase
   stack instead of the stale Org-Ops/MongoDB description.
7. **Team-facing product PDF** — `~/Desktop/Collarone-Product-Overview.pdf`, 34 pages,
   built for the founding team (Dominion, John): one section per suite with real
   screenshots, a "why the business needs this" callout, and a "take it further" roadmap
   box per suite, plus a dedicated automation-roadmap page and a dedicated HR
   recruiting/careers page. Built via the seed → screenshot → purge → assemble → print
   pattern in §8.

---

## 8. Appendix: seeding a throwaway test org

The pattern used for every screenshot this session. Worth preserving — getting it right
took several iterations.

1. Get the Supabase Postgres connection string (pooler URL, of the form
   `postgresql://postgres.<ref>:<pw>@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`).
   **Never pass this as a literal Bash argument** — write it to a local scratch file and
   read it via `DB_URL="$(cat file)"` command substitution instead.
2. Insert an `organizations` row, then a GoTrue-complete `auth.users` row + matching
   `auth.identities` row + `profiles` row (role `super_admin`, `suites` JSON granting
   every suite key at `manager` role) for at least one admin user.
3. Watch for Postgres parameter-type-inference errors when a placeholder like `$1`
   appears both bare and cast (e.g. inside `jsonb_build_object`) in the same query — cast
   consistently, or use separate placeholders per usage.
4. Watch for real check constraints, not assumed enum values — e.g. `it_assets.status` is
   `in_use`/`spare`/`repair`/`retired` (not `assigned`), `project_members.role` is
   `lead`/`member` (not `owner`). Query `pg_constraint` before guessing.
5. Log in via Playwright against **https://collarone.app** (the repo is disconnected
   from Vercel; the old vercel.app URL is a frozen redirect). Localhost works too once
   you create `client/.env` per §1. Login is a two-step form: fill email → submit → wait for the
   password field to appear → fill password → submit. Make sure any `waitForURL` check
   actually tests the pathname, not just "contains a slash" (a naive regex will match the
   `//` in `https://` and resolve instantly, before the real navigation happens).
6. To purge afterward: delete from every `public.*` **base table** (not view) that has an
   `org_id` column, using multi-pass deletion with savepoints (FK ordering between suite
   tables is not alphabetical), excluding `profiles`/`departments` until their dependents
   are gone, then delete `auth.identities` → `auth.users` → `departments` →
   `organizations` last. Always finish with a full sweep across every `org_id` table to
   confirm zero rows remain.
7. Delete the scratch credential file when done.
