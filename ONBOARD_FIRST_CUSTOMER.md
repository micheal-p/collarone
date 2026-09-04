# Onboard your first paying customer — run this in a week

Goal: **one real business, using Collarone for real work, paying you real money.**
Not a demo. Not "they'll try it." Money changes hands and they come back Monday.

---

## Step 0 — Before you talk to anyone (do today, ~1 hour)

These unblock everything. All free.

- [ ] **Resend key** — sign up at resend.com, verify `collarone.app` as a sending domain (add the SPF/DKIM DNS records it gives you). Put `RESEND_API_KEY` in the box's `.env`. → email works.
- [ ] **Your own Paystack** — get your `PLATFORM_PAYSTACK_SECRET` (Collarone's account, for subscription money). Put it in `.env`. Point the dashboard webhook → `https://collarone.app/api/paystack-webhook`. → you can collect subscription payments.
- [ ] **GATEWAY_ENC_KEY** — John generates it on the box (in the WhatsApp message).
- [ ] `systemctl restart collarone-api` after the env vars land (the box runs the API as a systemd service — there is no pm2 here).

Until Step 0 is done, "we take payments" and "we send email" are just words.

---

## Step 1 — Pick the RIGHT first customer

Not the biggest. The **easiest to make successful**. Ideal:

- A business you already know / can sit with in person or on a call.
- 5–30 staff (big enough to feel the pain, small enough to onboard in an hour).
- Has one loud, obvious pain Collarone kills: **running payroll by hand**, or **chasing invoices on WhatsApp**. Lead with that ONE thing.

Avoid: a stranger, a 200-person company, anyone who wants five custom features first.

---

## Step 2 — The onboarding session (you drive, white-glove)

Do it *with* them, screen-share or in person. You click, they watch. ~45 min.

1. [ ] Create their workspace (signup, or from Platform Control).
2. [ ] Turn on **only** the suites they need for their one pain — usually HR + Payroll, or CRM + Invoicing. Don't show all 15; it overwhelms.
3. [ ] Add their real staff (or 3–5 real ones to start). Real names, real salaries.
4. [ ] **Do one real thing, end to end, live:**
   - Payroll pain → run one real payroll, show the payslips, email one.
   - Invoice pain → create a real invoice, send the pay-link, have them pay ₦100 with a real card so they SEE money land in their Paystack.
5. [ ] Connect **their** Paystack (Settings → they paste their keys). Show them the money settles to *their* bank, not yours.

The moment they see their own real output (a payslip, a paid invoice), you've won.

---

## Step 3 — Get paid (same session, don't defer)

- [ ] Quote a **founder price** — a fair monthly number, locked forever. "You're my first customer, this rate never goes up on you."
- [ ] Take the first payment **there and then** via their signup/activation. If they say "later," you don't have a customer yet — find out what's really blocking.

Charging is the test. A free pilot teaches you nothing about whether this is a business.

---

## Step 4 — The week after (this is where you learn)

- [ ] Message them Day 2 and Day 5: "What have you actually used? What annoyed you?"
- [ ] Write down **every** stumble, confusion, and missing thing. That list — not your imagination — is the real product roadmap.
- [ ] Fix the top 1–2 things fast and tell them you did. That turns a customer into a referral.

---

## The only metric this week

**Did one business pay and use it for real work?**
Yes → you have a startup. Repeat with #2.
No → nothing else you build matters yet. Find out why and fix that.
