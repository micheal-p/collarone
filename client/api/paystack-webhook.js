// Paystack webhook for COLLARONE's OWN account (subscription revenue) — the
// automation that makes signup self-serve: a customer pays, this fires, the
// workspace activates itself. No more "WhatsApp us your reference".
//
// Security model: we do NOT trust the webhook payload. On any charge.success
// we take only the reference and RE-VERIFY it server-to-server against
// Paystack with our secret key (authoritative). A forged POST names a
// reference that either isn't a real successful charge on our account (verify
// fails → no-op) or is one we already applied (idempotent). This sidesteps
// the raw-body HMAC-signature pitfalls across our two runtimes (Vercel +
// self-hosted Express) while being strictly safer than trusting the body.
//
// Env: PLATFORM_PAYSTACK_SECRET, SUPABASE_SERVICE_KEY. Until the secret is
// set the endpoint 200s and does nothing, so configuring the Paystack
// dashboard webhook early is harmless.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PAYSTACK_SECRET = process.env.PLATFORM_PAYSTACK_SECRET;

export default async function handler(req, res) {
  // Always 200 quickly: Paystack retries on non-2xx, and we never want a
  // transient DB hiccup to make it hammer us. Effects are idempotent.
  if (req.method !== 'POST') return res.status(405).end();
  if (!PAYSTACK_SECRET || !SERVICE_KEY) return res.status(200).json({ ok: true, skipped: 'not configured' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (body?.event !== 'charge.success') return res.status(200).json({ ok: true, ignored: body?.event || 'no-event' });

    const psRef = String(body?.data?.reference || '');
    const billingRef = String(body?.data?.metadata?.billing_reference || '');
    if (!psRef && !billingRef) return res.status(200).json({ ok: true, ignored: 'no reference' });

    const headers = { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' };
    // authoritative re-verify against Paystack
    const vr = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(psRef)}`, { headers });
    const vd = await vr.json().catch(() => ({}));
    const p = vd?.data;
    if (!vr.ok || p?.status !== 'success' || p?.currency !== 'NGN') {
      return res.status(200).json({ ok: true, ignored: 'not a verified success' });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // find our billing transaction: prefer the metadata we set at init, then
    // the stored paystack_ref
    let tx = null;
    if (billingRef) {
      ({ data: tx } = await admin.from('billing_transactions').select('*').eq('reference', billingRef).maybeSingle());
    }
    if (!tx && psRef) {
      ({ data: tx } = await admin.from('billing_transactions').select('*').eq('paystack_ref', psRef).maybeSingle());
    }
    if (!tx) return res.status(200).json({ ok: true, ignored: 'no matching transaction' });
    if (tx.status === 'confirmed') return res.status(200).json({ ok: true, already: true });
    if (Number(p.amount) < Number(tx.amount_kobo)) return res.status(200).json({ ok: true, ignored: 'amount short' });

    // Same effects as the manual confirm + the redirect-verify path.
    await admin.from('billing_transactions')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', tx.id).eq('status', 'pending');

    if (tx.type === 'activation_fee') {
      await admin.from('organizations').update({ status: 'active' }).eq('id', tx.org_id);
    } else if (tx.type === 'credit_purchase') {
      const { data: existing } = await admin.from('org_credit_ledger').select('id').eq('related_transaction_id', tx.id).maybeSingle();
      if (!existing) {
        await admin.from('org_credit_ledger').insert({
          org_id: tx.org_id, delta: tx.credits_granted, reason: 'purchase', related_transaction_id: tx.id, created_by: tx.created_by,
        });
      }
    } else if (tx.type === 'renewal') {
      await admin.rpc('apply_confirmed_renewal', { p_tx_id: tx.id });
    }

    await admin.from('platform_admin_audit_log').insert({
      actor_id: tx.created_by, action: 'confirm_payment', target_org_id: tx.org_id,
      details: { transactionId: tx.id, type: tx.type, amountKobo: tx.amount_kobo, via: 'paystack_webhook' },
    }).then(() => {}, () => {});

    // notify the org their payment landed (in-app; harmless if it fails)
    await admin.from('org_notices').insert({
      org_id: tx.org_id, kind: 'payment_confirmed',
      message: 'Payment received — your workspace is active. Thank you!',
    }).then(() => {}, () => {});

    return res.status(200).json({ ok: true, applied: tx.type });
  } catch (e) {
    // 200 so Paystack doesn't retry-storm; the redirect-verify path is the backstop
    return res.status(200).json({ ok: true, error: e.message });
  }
}
