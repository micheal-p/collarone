# Org-Ops Cloud ERP

Modular, multi-tenant ERP suite platform for **Origin Tech Group** — a Microsoft-365-style
app launcher where staff sign in and enter only the suites a System Admin has granted them.

> Per the PRD/FRD: React (Vite) front-end · Node/Express API · MongoDB (multi-tenant via
> `tenantId` discriminator) · JWT auth · granular RBAC · admin-provisioned accounts.

## Architecture

```
org-ops-erp/
├── server/        Node + Express + Mongoose API (auth, RBAC, tenant scoping, provisioning)
└── client/        React + Vite SPA (suite launcher, login, admin center, suite shells)
```

### Suites
**MVP core:** HR & Staff · Leave · Task & Report · Visitor Management
**Extended:** IT Assets · Procurement · Inventory · Finance · Projects · Documents

### Access model
- **No self-signup.** The System Admin creates every staff account.
- Each user gets a **system role** (`super_admin` / `manager` / `staff`) and a list of
  **granted suites**, each with a per-suite role (`manager` / `member`).
- A user can only open a suite they were granted. The launcher greys out the rest, and the
  API enforces it on every request (`requireSuite`).

## Local setup

```bash
# 1. Install deps (root installs both workspaces)
npm install

# 2. Start MongoDB locally
brew services start mongodb-community@8.0     # or: mongod --config /usr/local/etc/mongod.conf

# 3. Configure env
cp server/.env.example server/.env            # defaults work for local

# 4. Seed the tenant + System Admin account
npm run seed

# 5. Run API + web together
npm run dev
```

- API: http://localhost:4000
- Web: http://localhost:5173

### Default System Admin (from seed)
```
admin@origingroupng.com  /  ChangeMe!2026
```
Change this immediately after first login.

## Deployment — Vercel (frontend) + Render (backend)

The frontend is a static Vite SPA (Vercel); the backend is a long-running Express server
(Render) connected to Mongo Atlas. Vercel proxies `/api/*` to Render so the auth refresh
cookie stays same-origin (avoids cross-site cookie blocking on Safari/iOS).

### Backend → Render
1. **New → Blueprint**, connect this repo (Render reads `render.yaml`). Or create a Web Service
   manually with: Root Dir `server`, Build `npm install --no-workspaces`, Start `npm start`.
2. Set these env vars (secrets) in the Render dashboard:
   `MONGO_URI` (Atlas, incl. `/org_ops_erp`), `JWT_SECRET`, `JWT_REFRESH_SECRET`,
   `CLIENT_ORIGIN` (your Vercel URL).
3. In **Atlas → Network Access**, allow `0.0.0.0/0` (Render free tier has no static outbound IP).
4. Note the service URL, e.g. `https://originerp-api.onrender.com`.

### Frontend → Vercel
1. Project **Settings → Root Directory = `client`** (framework auto-detects as Vite).
2. Edit `client/vercel.json` → set the `/api` rewrite destination to your Render URL.
3. Deploy. The SPA calls `/api/...` on the Vercel domain → Vercel proxies to Render.

> Atlas is already seeded (tenant + System Admin), so no seeding step is needed on Render.
> Only the **server's** host needs Atlas allowlisting — end users never touch Atlas directly.
