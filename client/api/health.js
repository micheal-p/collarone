// Vercel serverless function — real health check, not a fabricated status.
// GET is safe to call anytime: the /status page, the Platform Admin
// dashboard, and Vercel's own once-a-day cron (vercel.json) all hit this.
//
// A once-a-day cron alone is too sparse to ever build a useful 90-day
// history or catch a same-day outage, and Vercel Cron only runs that
// infrequently on this plan — so every call to this endpoint opportunistically
// logs a row too, throttled to at most one every 5 minutes so normal traffic
// (not a script hammering this URL) is what drives the write rate.
import { createClient } from '@supabase/supabase-js';
import { sendBillingNotice } from './_lib/billingNotify.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const THROTTLE_MS = 5 * 60 * 1000;

// Dunning copy per lifecycle transition — one source for banner + email so the
// two channels never tell a customer different stories.
const DUNNING = {
  past_due: {
    subject: 'Your Collarone renewal is due',
    heading: 'Renewal due',
    body: `<p style="font-size:14px;line-height:1.6">Your Collarone subscription has reached its renewal date. Renew from your Billing page to keep full access — after the grace window your workspace goes read-only.</p>`,
    banner: 'Your subscription renewal is due. Renew from Billing to avoid your workspace going read-only.',
  },
  read_only: {
    subject: 'Your Collarone workspace is now read-only',
    heading: 'Workspace read-only',
    body: `<p style="font-size:14px;line-height:1.6">Your renewal is overdue, so your workspace has switched to read-only — your data is safe and visible, but changes are paused until you renew.</p>`,
    banner: 'Your subscription is overdue — your workspace is now read-only. Renew from Billing to make changes again.',
  },
  suspended: {
    subject: 'Your Collarone workspace has been suspended',
    heading: 'Workspace suspended',
    body: `<p style="font-size:14px;line-height:1.6">Your workspace has been suspended for an overdue renewal. Renewing restores everything exactly as you left it. Need help? WhatsApp us on 0814&nbsp;812&nbsp;8551.</p>`,
    banner: 'Your workspace has been suspended for an overdue payment. Renew to restore access — WhatsApp 0814 812 8551.',
  },
};

export default async function handler(req, res) {
  const startedAt = Date.now();
  let dbOk = false;
  const admin = SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) : null;

  try {
    if (admin) {
      const { error } = await admin.from('organizations').select('id').limit(1);
      dbOk = !error;
    }
  } catch {
    dbOk = false;
  }

  const responseMs = Date.now() - startedAt;
  const apiOk = true; // this function executed, so the API itself is up
  const status = apiOk && dbOk ? 'operational' : dbOk ? 'degraded' : 'down';

  if (admin) {
    try {
      const { data: last } = await admin.from('status_checks').select('checked_at').order('checked_at', { ascending: false }).limit(1).maybeSingle();
      const dueForCheck = !last || Date.now() - new Date(last.checked_at).getTime() > THROTTLE_MS;
      if (dueForCheck) {
        await admin.from('status_checks').insert({ api_ok: apiOk, db_ok: dbOk, response_ms: responseMs });
        // Piggyback on the same throttle: promo-trial expiry. An org whose
        // trial window has lapsed gets suspended (blocks login with the
        // pay-to-continue message) and a payment-reminder banner queued for
        // when they do pay and come back.
        const { data: expired } = await admin.from('organizations')
          .update({ status: 'suspended' })
          .lt('trial_ends_at', new Date().toISOString())
          .eq('status', 'active')
          .select('id, name, trial_ends_at');
        for (const org of expired || []) {
          // banner + email in one call; dedupe key makes it once per trial
          await sendBillingNotice(admin, {
            orgId: org.id, kind: 'trial_expired',
            dedupeKey: `${org.id}:trial_expired:${org.trial_ends_at}`,
            subject: 'Your Collarone free trial has ended',
            heading: 'Trial ended',
            bodyHtml: `<p style="font-size:14px;line-height:1.6">The free trial for <strong>${String(org.name || 'your workspace').replace(/</g, '&lt;')}</strong> has ended. Complete your activation payment to pick up right where you left off — everything is saved. Questions? WhatsApp us on 0814&nbsp;812&nbsp;8551.</p>`,
            bannerMessage: 'Your free trial has ended. Complete your activation payment to keep using Collarone — WhatsApp us on 0814 812 8551.',
          });
        }

        // Proactive renewal reminder — 7 days before the period ends, email the
        // owner the honest best-tier amount for what they actually run. Runs
        // regardless of PAYWALL_ENFORCE (reminding is always safe; enforcing
        // isn't). Dedupe key = org + period, so one nudge per billing period.
        const FOUNDING = '00000000-0000-0000-0000-000000000001';
        const { data: dueSoon } = await admin.from('organizations')
          .select('id, name, current_period_end, rate_card')
          .eq('status', 'active')
          .gt('current_period_end', new Date().toISOString())
          .lt('current_period_end', new Date(Date.now() + 7 * 86400000).toISOString())
          .neq('id', FOUNDING).limit(50);
        for (const org of dueSoon || []) {
          // live seat + suite counts, same definitions request_renewal uses
          const { data: members } = await admin.from('profiles')
            .select('role, status, suites').eq('org_id', org.id);
          const seats = (members || []).filter((m) => m.status === 'active' && m.role !== 'super_admin').length;
          const suiteKeys = new Set();
          for (const m of members || []) for (const s of (Array.isArray(m.suites) ? m.suites : [])) if (s?.key) suiteKeys.add(s.key);
          let rc = org.rate_card;
          if (!rc) ({ data: rc } = await admin.rpc('current_published_rate_card'));
          const { data: amountKobo } = rc
            ? await admin.rpc('best_plan_kobo', { p_rate_card: rc, p_seats: seats, p_suites: suiteKeys.size, p_months: 1 })
            : { data: null };
          const dueDate = new Date(org.current_period_end);
          const dateStr = dueDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
          const amountStr = amountKobo ? `₦${(Number(amountKobo) / 100).toLocaleString('en-NG')}` : null;
          await sendBillingNotice(admin, {
            orgId: org.id, kind: 'renewal_due',
            dedupeKey: `${org.id}:renewal_due:${org.current_period_end}`,
            subject: `Your Collarone renewal is coming up${amountStr ? ` — ${amountStr}/month` : ''}`,
            heading: 'Renewal coming up',
            bodyHtml: `<p style="font-size:14px;line-height:1.6">Your Collarone subscription renews on <strong>${dateStr}</strong>${amountStr ? ` — about <strong>${amountStr}/month</strong> for ${suiteKeys.size} suite${suiteKeys.size === 1 ? '' : 's'} and ${seats} staff (always the cheapest plan for what you run)` : ''}. Renew from your Billing page — monthly, or 12 months at 15% off.</p>`,
            bannerMessage: `Your subscription renews on ${dateStr}. Renew from Billing — monthly, or 12 months at 15% off.`,
          });
        }

        // Renewal dunning ladder (active -> past_due -> read_only -> suspended).
        // Only runs when the operator has explicitly switched enforcement on —
        // off by default so no live org is ever auto-suspended unwatched.
        if (process.env.PAYWALL_ENFORCE === 'true') {
          const { data: moved } = await admin.rpc('advance_billing_lifecycle');
          if (moved?.length) {
            // period end per org → the dedupe key, so each billing period can
            // notify once per rung even across repeated cron fires
            const { data: orgRows } = await admin.from('organizations')
              .select('id, current_period_end').in('id', moved.map((m) => m.id));
            const periodOf = Object.fromEntries((orgRows || []).map((o) => [o.id, o.current_period_end || 'na']));
            for (const row of moved) {
              const copy = DUNNING[row.to_status];
              if (!copy) continue;
              await sendBillingNotice(admin, {
                orgId: row.id, kind: row.to_status,
                dedupeKey: `${row.id}:${row.to_status}:${periodOf[row.id]}`,
                subject: copy.subject, heading: copy.heading,
                bodyHtml: copy.body, bannerMessage: copy.banner,
              });
            }
          }
        }
      }
    } catch {
      // never let logging history block reporting live status
    }
  }

  return res.status(200).json({ status, apiOk, dbOk, responseMs, build: '2026-07-24a', checkedAt: new Date().toISOString() });
}
