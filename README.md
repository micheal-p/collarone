# Collarone

The business platform for Nigerian companies — HR, leave, tasks, visitor management,
payroll, CRM, finance, projects, documents, trade paperwork and automation, all under one
login, priced and billed in naira. A company signs up, gets its own workspace, and turns on
whichever suites it needs — no self-hosting, no per-module install.

Public site: [collarone.app](https://collarone.app) · Status: [/status](https://collarone.app/status)

## Architecture

```
org-ops-erp/
├── client/            React (Vite) SPA — marketing site, suite launcher, admin center,
│   ├── src/suites/    every operational suite (hr, leave, tasks, crm, payroll, …)
│   ├── src/pages/     marketing/auth/platform-admin pages
│   └── api/           Vercel serverless functions holding the Supabase service-role key
└── supabase/          Postgres schema, RLS policies and SECURITY DEFINER functions,
                        run as SQL migration files (one per suite/feature)
```

- **Frontend:** React + Vite, plain CSS/inline styles (no TypeScript, no CSS framework),
  Framer Motion for the marketing site's motion.
- **Backend:** Supabase — Postgres, Auth, Storage. Almost all business logic lives in
  Postgres itself (`supabase/*.sql`) as `SECURITY DEFINER` RPCs, not in application code —
  e.g. checkout re-reads prices server-side, payroll runs statutory deductions in SQL.
- **Multi-tenancy:** every business table carries an `org_id`; Row-Level Security
  (`same_org()`, `is_platform_admin()` helpers) enforces isolation at the database layer,
  so a frontend bug can't leak one company's data into another's.
- **Serverless functions** (`client/api/*.js`) hold the one secret the browser can't safely
  have — the Supabase service-role key — used for things like org signup and the daily
  automation cron. Everything else talks to Supabase directly from the browser under RLS.

## Suites

**Core:** HR & Staff · Leave · Tasks & Report · Visitor Management · Payroll · CRM
**Extended:** Attendance · Benefits · IT Assets · Procurement · Inventory · Finance ·
Projects · Documents · Trade Documents (invoicing/GRN/SRP) · Automation

Each org picks the suites it wants at sign-up and can add more later — access is enforced
both in the UI and at the database layer (`profiles.suites` + a per-suite RLS check), so a
suite a company hasn't paid for genuinely can't be reached, not just hidden.

## Access model

- **Self-serve org sign-up** — a company creates its own workspace and becomes its own
  administrator.
- Within an org, **staff accounts are admin-provisioned** — no public self-signup for
  employees. An admin creates each account and grants specific suites.
- A separate **Platform Admin** role (Collarone's own team) manages organizations,
  billing confirmation, promo codes and platform-wide status — with no visibility into any
  tenant's actual business data.

## Local setup

```bash
cd client
npm install
cp .env.example .env      # Supabase URL + anon key for your own Supabase project
npm run dev                # http://localhost:5173
```

Running against a real backend needs a Supabase project with the schema in `supabase/`
applied — run the `.sql` files in that folder in order (each one documents its own
dependencies at the top). See `ops/hostinger/README.md` for self-hosting Supabase instead
of using Supabase Cloud.

## Deployment

Vercel only — the React SPA and the serverless functions in `client/api/` deploy together
from this repo. Supabase (cloud or self-hosted) is configured entirely through environment
variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`) — no code changes needed to point at a different Supabase instance.
