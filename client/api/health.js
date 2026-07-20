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

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const THROTTLE_MS = 5 * 60 * 1000;

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
          .select('id, name');
        for (const org of expired || []) {
          await admin.from('org_notices').insert({
            org_id: org.id, kind: 'payment_reminder',
            message: `Your free trial has ended. Complete your activation payment to keep using Collarone — WhatsApp us on 0814 812 8551.`,
          });
        }

        // Renewal dunning ladder (active -> past_due -> read_only -> suspended).
        // Only runs when the operator has explicitly switched enforcement on —
        // off by default so no live org is ever auto-suspended unwatched.
        if (process.env.PAYWALL_ENFORCE === 'true') {
          const { data: moved } = await admin.rpc('advance_billing_lifecycle');
          const MSG = {
            past_due: 'Your subscription renewal is due. Renew from Billing to avoid your workspace going read-only.',
            read_only: 'Your subscription is overdue — your workspace is now read-only. Renew from Billing to make changes again.',
            suspended: 'Your workspace has been suspended for an overdue payment. Renew to restore access — WhatsApp 0814 812 8551.',
          };
          for (const row of moved || []) {
            if (MSG[row.to_status]) await admin.from('org_notices').insert({ org_id: row.id, kind: 'payment_reminder', message: MSG[row.to_status] });
          }
        }
      }
    } catch {
      // never let logging history block reporting live status
    }
  }

  return res.status(200).json({ status, apiOk, dbOk, responseMs, checkedAt: new Date().toISOString() });
}
