# Collarone tests

Two safety-net suites that run against the real Postgres (Supabase) database.
Both read the connection string from `DATABASE_URL` — **no secret is committed.**

```bash
# from the repo root
DATABASE_URL='postgres://…' npm run test:rls        # cross-tenant isolation
DATABASE_URL='postgres://…' npm run test:payroll    # payroll math golden values
DATABASE_URL='postgres://…' npm run test            # both
```

Use the Supabase **session pooler** connection string (Project → Settings →
Database → Connection string → Session pooler). Never paste the string on the
command line in shared history — prefer an env var or a `.env` you don't commit.

## `test:rls` — cross-tenant RLS probe (`rls_probe.mjs`)

Proves org A can never read org B's data. It spins up two disposable orgs +
users, seeds one row per suite in each, then runs queries under the Postgres
`authenticated` role with `request.jwt.claims.sub` set to each user — the exact
context the real API (PostgREST) uses, so the live RLS policies apply. It
asserts each user sees only their own org's row, and that a `SECURITY DEFINER`
RPC (`loan_balance`) refuses another org's id. Everything is torn down at the
end (all org-scoped rows, the profiles, the auth users, the orgs).

Both test users are `super_admin`, which is the important part: it catches the
recurring bug where a policy is written `is_super_admin() OR …` instead of
`same_org(org_id) AND …` — that mistake would let any workspace admin read every
tenant, and this probe fails loudly if it ever reappears. **When a new suite
ships a new table, add one line to the `SEED` map in `rls_probe.mjs`.**

## `test:payroll` — payroll math golden tests (`payroll_golden.mjs`)

Fixed inputs → exact expected outputs for the most sensitive code in the app:
the 2026 Nigeria Tax Act PAYE bands, the statutory deduction rates
(pension/NHF/NSITF), and a full sample payslip. A future edit that silently
shifts a band or a rate breaks these immediately.
