// The one path for AUTOMATED billing notifications (dunning, renewal-due,
// trial-expiry). Channel-agnostic by design:
//
//   banner   → org_notices (already read by the dashboard)      — always on
//   email    → Resend, to the org's account owner               — when RESEND_API_KEY set
//   whatsapp → reserved slot; no-ops until the WhatsApp Cloud   — flag WHATSAPP_NOTIFY
//              API integration lands (deliberate: designed-in now, built later)
//
// Idempotency: every notice claims a notification_outbox row keyed by
// dedupe_key BEFORE any send. A duplicate claim (same key) means this exact
// notice already went out — skip everything. So however often the cron fires,
// a customer hears about one billing event exactly once.
//
// Never throws — billing reminders must never break the caller (health checks,
// webhooks). Returns { skipped } or { sent, emailed, error? }.
import { emailEnabled, sendResend, wrap, esc, FROM_ADDR } from './email.js';
import { emitOrgEvent } from './events.js';

export async function sendBillingNotice(admin, {
  orgId, kind, dedupeKey,
  subject, heading, bodyHtml,     // email content (bodyHtml is trusted template HTML)
  bannerMessage,                  // in-app banner text (plain)
  ctaPath = '/workspace', baseUrl = 'https://collarone.app',
}) {
  try {
    // 1) Claim — the idempotency gate. ignoreDuplicates returns no row when
    //    this dedupe_key was already claimed by an earlier run.
    const { data: claimed, error: claimErr } = await admin.from('notification_outbox')
      .upsert(
        { org_id: orgId, kind, dedupe_key: dedupeKey, channels: ['banner', 'email'] },
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      ).select('id');
    if (claimErr) {
      // Outbox unavailable (migration not run yet) → keep parity with the old
      // behavior: banner still goes out (transitions fire once, so it's safe),
      // but no email — email needs the dedupe guarantee.
      if (bannerMessage) {
        await admin.from('org_notices').insert({ org_id: orgId, kind: 'payment_reminder', message: bannerMessage })
          .then(() => {}, () => {});
      }
      return { skipped: true, error: claimErr.message };
    }
    const row = claimed?.[0];
    if (!row) return { skipped: true, already: true };

    // 2) In-app banner (kind matches the existing dashboard reader)
    if (bannerMessage) {
      await admin.from('org_notices').insert({ org_id: orgId, kind: 'payment_reminder', message: bannerMessage })
        .then(() => {}, () => {});
    }

    // 3) Email the account owner
    let emailed = false; let error;
    let ownerEmail = null;
    if (emailEnabled() && subject) {
      const { data: owner } = await admin.from('profiles')
        .select('email, name').eq('org_id', orgId).eq('role', 'super_admin').limit(1).maybeSingle();
      if (owner?.email) {
        ownerEmail = owner.email;
        try {
          await sendResend({
            to: owner.email,
            from: `Collarone <${FROM_ADDR}>`,
            subject,
            html: wrap(heading || subject, `
              <p style="font-size:14px;line-height:1.6">Hi ${esc(owner.name || 'there')},</p>
              ${bodyHtml}
              <p style="margin:18px 0"><a href="${baseUrl}${ctaPath}" style="background:#FF5B1F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:100px;font-weight:700;font-size:14px">Go to Billing</a></p>`),
          });
          emailed = true;
        } catch (e) { error = e.message; }
      }
    }

    // 4) WhatsApp — reserved. When the Cloud API integration exists, this is
    //    the only place a send gets added; every caller inherits it for free.
    // if (process.env.WHATSAPP_NOTIFY === 'true') await sendWhatsApp(...)

    // 5) The notice IS a billing event — record it on the org's event spine
    //    (same dedupe as the notice itself, since we only reach here on a
    //    fresh claim). Feeds the activity feed / notification centre.
    await emitOrgEvent(admin, orgId, `billing.${kind}`, { dedupeKey, emailed });

    // 6) Record the outcome on the claim
    const status = error ? 'partial' : (emailed ? 'sent' : 'partial');
    await admin.from('notification_outbox')
      .update({ status, email_to: ownerEmail, subject: subject || null, error: error || null, sent_at: new Date().toISOString() })
      .eq('id', row.id).then(() => {}, () => {});

    return { sent: true, emailed, error };
  } catch (e) {
    return { skipped: true, error: e?.message };
  }
}
