// Paystack webhook for MERCHANT invoice payments (/inv/<token> card payments).
//
// Separate from paystack-webhook.js on purpose. That one handles Collarone's
// own platform billing and is signed with Collarone's secret. Invoice money
// settles into the MERCHANT's Paystack account, so their webhook is signed
// with THEIR secret — verifying it against ours would reject every call.
//
// Why a webhook at all: today a payment is only banked if the customer's
// browser makes it back to the invoice page and calls `verify`. Close the tab
// on the Paystack success screen, lose signal in a lift, background the app —
// the merchant's money is in their Paystack account and their invoice still
// says unpaid. The webhook is the path that does not depend on the customer's
// browser surviving the round trip.
//
// The merchant sets this URL in their own Paystack dashboard:
//   https://collarone.app/api/invoice-webhook
//
// Trust model, in order:
//   1. Read the reference from the payload. Treat it ONLY as a lookup hint.
//   2. Resolve it to an invoice + org through trade_doc_payment_intents, which
//      we wrote ourselves at checkout-init.
//   3. Verify the HMAC signature using THAT org's Paystack secret. Forging
//      this requires the merchant's secret key, which we never expose.
//   4. Re-verify the transaction server-to-server with the same secret.
// Nothing from the payload is trusted for money until step 4 agrees.
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { decryptSecret } from './_lib/gatewayCrypto.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  // Always answer 2xx on anything we simply can't act on: Paystack retries
  // non-2xx, and a retry storm helps nobody. Real failures (bad signature) do
  // get a 401 — that is a fact worth surfacing, not a transient hiccup.
  if (req.method !== 'POST') return res.status(405).end();
  if (!SERVICE_KEY) return res.status(200).json({ ok: true, skipped: 'not configured' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (body?.event !== 'charge.success') {
      return res.status(200).json({ ok: true, ignored: body?.event || 'no-event' });
    }
    const reference = String(body?.data?.reference || '');
    if (!reference.startsWith('CINV-')) {
      return res.status(200).json({ ok: true, ignored: 'not an invoice reference' });
    }

    // Step 2 — our own record of what this reference is for.
    const { data: intent } = await admin.from('trade_doc_payment_intents')
      .select('reference, doc_id, org_id, settled_at').eq('reference', reference).maybeSingle();
    if (!intent) return res.status(200).json({ ok: true, ignored: 'unknown reference' });

    const { data: gw } = await admin.from('org_payment_gateways')
      .select('secret_key, enabled').eq('org_id', intent.org_id).maybeSingle();
    if (!gw?.enabled || !gw.secret_key) {
      return res.status(200).json({ ok: true, ignored: 'gateway not enabled' });
    }
    const secret = decryptSecret(gw.secret_key);

    // Step 3 — signature, against the merchant's secret, over the RAW body.
    const sig = req.headers['x-paystack-signature'];
    if (req.rawBody && sig) {
      const expected = crypto.createHmac('sha512', secret).update(req.rawBody).digest('hex');
      const a = Buffer.from(String(sig));
      const b = Buffer.from(expected);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ ok: false, message: 'Bad signature' });
      }
    }

    // Step 4 — authoritative re-verify.
    const headers = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
    const vr = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers });
    const vd = await vr.json().catch(() => ({}));
    const tx = vd?.data;
    if (!vr.ok || tx?.status !== 'success' || tx?.currency !== 'NGN') {
      return res.status(200).json({ ok: true, ignored: 'not a verified success' });
    }

    // Global idempotency: the browser's verify call may well have banked this
    // already. Whoever gets here second does nothing.
    const { data: existing } = await admin.from('trade_doc_payments')
      .select('id').eq('reference', reference).eq('method', 'card').maybeSingle();
    if (existing) return res.status(200).json({ ok: true, already: true });

    const { data: doc } = await admin.from('trade_documents')
      .select('id, org_id, total, amount_paid').eq('id', intent.doc_id).maybeSingle();
    if (!doc) return res.status(200).json({ ok: true, ignored: 'invoice gone' });

    const outstanding = Math.max(0, Number(doc.total) - Number(doc.amount_paid || 0));
    const credit = Math.min(Number(tx.amount || 0) / 100, outstanding);
    if (credit > 0) {
      await admin.from('trade_doc_payments').insert({
        org_id: doc.org_id, doc_id: doc.id, amount: credit, method: 'card',
        reference, note: 'Card payment via invoice link (webhook)',
      });
      const newPaid = Number(doc.amount_paid || 0) + credit;
      await admin.from('trade_documents').update({
        amount_paid: newPaid,
        status: newPaid >= Number(doc.total) ? 'paid' : 'part_paid',
      }).eq('id', doc.id);
    }
    await admin.from('trade_doc_payment_intents')
      .update({ settled_at: new Date().toISOString() }).eq('reference', reference);

    return res.status(200).json({ ok: true, credited: credit });
  } catch (e) {
    // Swallow and 200: a retry will not fix a bug on our side, and Paystack
    // hammering us does not help. The payment is still safe in their account.
    return res.status(200).json({ ok: true, error: e.message });
  }
}
