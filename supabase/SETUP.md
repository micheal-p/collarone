# Supabase + Vercel setup

The app now runs on **Supabase** (Auth + Postgres + RLS) with a small **Vercel
serverless function** (`client/api/admin.js`) for admin-only operations that need
the service key. No Render, no Express.

## 1. Create the database schema
Supabase Dashboard → **SQL Editor** → New query → paste **`supabase/schema.sql`** → **Run**.
Creates the `profiles` table, RLS policies, and helper functions.

## 2. Auth settings
Supabase Dashboard → **Authentication**:
- **Providers → Email**: enabled.
- **Settings → "Allow new users to sign up": OFF** (admin provisions accounts; the
  service-key function still creates users regardless of this toggle).

## 3. Vercel environment variables
Vercel project → **Settings → Environment Variables** (then redeploy):
- `SUPABASE_SERVICE_KEY` = your **service / secret** key (server-side only — powers
  `/api/admin`). **Use the rotated key**, not the one shared in chat.
- Optional overrides (defaults are baked into the build):
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`.

> Frontend root directory in Vercel stays **`client`**. The `api/` function is detected
> automatically under it.

## 4. Seed the first System Admin
After step 1, the database is empty. Ping me ("schema is live") and I'll create
`admin@origingroupng.com` via the service key, or run your own seed. That account then
provisions everyone else from the **Admin Center**.

## 5. Rotate the leaked key
Supabase → Settings → API → roll the **service** key, and update `SUPABASE_SERVICE_KEY`
in Vercel.

---

### Local development
`client/.env` (gitignored) can hold:
```
VITE_SUPABASE_URL=https://dxekronjsvnwmnbanlqh.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```
`npm run dev` runs the SPA against Supabase. The `/api/admin` function only runs on
Vercel (or via `vercel dev`), so creating/resetting users is tested on the deployed site.
Set `VITE_DEMO_MODE=true` to use the offline localStorage mock instead.
