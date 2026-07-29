# Payments go-live — setup & runbook

Everything the code needs is already built and deployed. This is the checklist
that switches it from "manual WhatsApp confirmation" to fully self-serve
card/bank/USSD payments with automated renewals and reminders.

---

## 1. Run the new migrations (Supabase SQL Editor, in this order)

| # | File | What it does |
|---|------|--------------|
| 1 | `supabase/billing_best_tier.sql` | Honest best-tier renewals (rate_card snapshot + best_plan_kobo) |
| 2 | `supabase/notification_outbox.sql` | Idempotent notification log (never double-email) |
| 3 | `supabase/billing_refunds.sql` | Refund status + reason columns |
| 4 | `supabase/org_events.sql` | The org event spine (billing events seed it) |

Each is idempotent — safe to re-run.

## 2. Create the Paystack account (1–3 days for approval — start first)

1. Sign up at paystack.com with the Collarone business email.
2. Compliance → **Registered Business**: CAC number + certificate, TIN,
   a director's BVN, business address. (Starter Business = BVN + ID only,
   but lower limits.)
3. Add the settlement bank account (where payouts land).
4. Settings → API Keys & Webhooks:
   - Copy the **test secret key** now (`sk_test_…`) — everything can be tested with it.
   - The **live key** (`sk_live_…`) appears once compliance approves.
   - Set **Webhook URL**: `https://collarone.app/api/paystack-webhook`
   - Set **Callback URL**: `https://collarone.app/pay/thanks`

## 3. Resend (email reminders)

1. resend.com → Domains → add `collarone.app`, add the SPF/DKIM DNS records
   at the registrar, wait for verified/green.
2. The send-only API key goes on the box (below). Reminders send from
   `notify@collarone.app` (override with `EMAIL_FROM`).

## 4. Environment variables

**On the box** (`/opt/collarone/app/.env`, then `systemctl restart collarone-api`):

```
PLATFORM_PAYSTACK_SECRET=sk_test_…       # swap to sk_live_… at go-live
RESEND_API_KEY=re_…
# optional:
EMAIL_FROM=notify@collarone.app
PAYWALL_ENFORCE=true                     # ONLY when ready to enforce (see below)
```

**On Vercel** (fallback deployment — Settings → Environment Variables): the
same `PLATFORM_PAYSTACK_SECRET` + `RESEND_API_KEY`, plus `CRON_SECRET` (any
random string) so the daily crons write.

Until a key is set, its feature reports "not switched on" and the manual
WhatsApp flow keeps working — nothing breaks in the meantime.

## 5. Test-mode playbook (before swapping to live keys)

1. Sign up a throwaway org at `/signup` → the payment step shows
   **Pay online now** (because the secret key is set).
2. Pay with Paystack's test card `4084 0840 8408 4081`, any future expiry,
   CVV `408`, PIN `0000`, OTP `123456`.
3. Confirm: redirected to `/pay/thanks` → "Payment confirmed", the org
   activates itself, Platform Control shows the transaction confirmed with
   `via: paystack_self_serve` (or `paystack_webhook`) in the audit log.
4. Renewal: log in as that org's admin → Billing → **Renew 1 month** → the
   amount shown is the best-tier price → pay with the test card → period
   extends by a month.
5. Refund record: Platform Control → Transactions → Refund on the confirmed
   row (money moves back via the Paystack dashboard — the app records it).
6. Delete the throwaway org from Platform Control when done.

## 6. Turning on enforcement (`PAYWALL_ENFORCE=true`)

Off by default so no org is ever auto-suspended unwatched. When on, the
ladder runs: renewal date passes → `past_due` (5-day grace, full access) →
`read_only` → `suspended` (day 30). Each rung emails the owner + shows an
in-app banner, exactly once per billing period (the outbox dedupes).
Independent of the flag, owners get a "renewal coming up" email ~7 days
before their period ends, with the honest best-tier amount.

Before flipping it on, sanity-check every org's `current_period_end` in
Platform Control (Billing state) so nobody starts a ladder you didn't expect.

## 7. Go-live

1. Swap `PLATFORM_PAYSTACK_SECRET` to the live key (box + Vercel), restart.
2. Re-run one real ₦100-scale payment yourself end-to-end, refund it in the
   Paystack dashboard, record the refund in Platform Control.
3. Rotate the Resend key if it ever appeared in chat/notes.

## Rollback

- Unset `PLATFORM_PAYSTACK_SECRET` → the UI cleanly falls back to the manual
  WhatsApp confirmation flow (same as today).
- Set `PAYWALL_ENFORCE=false` (or unset) → the ladder stops advancing; any
  org already moved can be restored in Platform Control → set billing state
  → Active.
- Migrations are additive; no rollback needed for them.
