// Vercel serverless function — Paystack card payment for a shared invoice
// (/inv/<token>). Mirrors site-pay.js: every merchant uses THEIR OWN Paystack
// account (org_payment_gateways, service-role only), so the money settles
// straight into the merchant's bank. Collarone never holds or routes funds.
//
//   POST { action: 'init',   token, email }
//     → { authorizationUrl } — creates a Paystack transaction for the
//       OUTSTANDING BALANCE (total - amount_paid, read from the DB, never the
//       client) and returns the hosted checkout URL.
//   POST { action: 'verify', token, reference }
//     → { paid } — confirms with Paystack, then records the payment through
//       the same ledger staff use (trade_doc_payments + amount_paid/status),
//       idempotent per reference so re-verifying can't double-credit.
//
// Public and unauthenticated by design (the customer has no account); both
// actions act only on the single invoice tied to the share token.
import { createClient } from '@supabase/supabase-js';
import { decryptSecret } from './_lib/gatewayCrypto.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const json = (res, status, obj) => res.status(status).json(obj);

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  if (!SERVICE_KEY) return json(res, 500, { message: 'Server not configured: SUPABASE_SERVICE_KEY missing.' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { action, token } = body;

  try {
    const { data: doc } = await admin.from('trade_documents')
      .select('id, org_id, doc_no, doc_type, status, total, amount_paid, party_email, share_token')
      .eq('share_token', String(token || '')).eq('doc_type', 'invoice').maybeSingle();
    if (!doc || !['issued', 'part_paid', 'paid'].includes(doc.status)) return json(res, 404, { message: 'Invoice not found.' });

    const { data: gw } = await admin.from('org_payment_gateways')
      .select('secret_key, enabled').eq('org_id', doc.org_id).maybeSingle();
    if (!gw?.enabled || !gw.secret_key) return json(res, 400, { message: 'This business does not take card payments yet.' });
    const headers = { Authorization: `Bearer ${decryptSecret(gw.secret_key)}`, 'Content-Type': 'application/json' };

    const outstanding = Math.max(0, Number(doc.total) - Number(doc.amount_paid || 0));

    if (action === 'init') {
      if (outstanding <= 0) return json(res, 400, { message: 'This invoice is already fully paid.' });
      const email = String(body.email || doc.party_email || '').trim();
      if (!email) return json(res, 400, { message: 'An email address is needed for card payment.' });

      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const reference = `CINV-${doc.doc_no}-${Date.now().toString(36).toUpperCase()}`;
      const r = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST', headers,
        body: JSON.stringify({
          email,
          amount: Math.round(outstanding * 100), // kobo
          currency: 'NGN',
          reference,
          callback_url: `${proto}://${host}/inv/${doc.share_token}?payref=${encodeURIComponent(reference)}`,
          metadata: { invoice_no: doc.doc_no },
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.data?.authorization_url) {
        return json(res, 502, { message: d?.message || 'Could not start the card payment — try a transfer instead.' });
      }
      return json(res, 200, { authorizationUrl: d.data.authorization_url });
    }

    if (action === 'verify') {
      const reference = String(body.reference || '');
      if (!reference) return json(res, 400, { message: 'Missing payment reference.' });

      // idempotent: if this reference is already recorded, report success
      const { data: existing } = await admin.from('trade_doc_payments')
        .select('id').eq('doc_id', doc.id).eq('reference', reference).eq('method', 'card').maybeSingle();
      if (existing) return json(res, 200, { paid: true });

      const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers });
      const d = await r.json().catch(() => ({}));
      const tx = d?.data;
      const paidAmountNaira = Number(tx?.amount || 0) / 100;
      const ok = r.ok && tx?.status === 'success' && tx?.currency === 'NGN' && paidAmountNaira > 0;
      if (!ok) return json(res, 200, { paid: false });

      const credit = Math.min(paidAmountNaira, outstanding);
      if (credit > 0) {
        await admin.from('trade_doc_payments').insert({
          org_id: doc.org_id, doc_id: doc.id, amount: credit, method: 'card',
          reference, note: 'Card payment via invoice link',
        });
        const newPaid = Number(doc.amount_paid || 0) + credit;
        await admin.from('trade_documents').update({
          amount_paid: newPaid,
          status: newPaid >= Number(doc.total) ? 'paid' : 'part_paid',
        }).eq('id', doc.id);
      }
      return json(res, 200, { paid: true });
    }

    return json(res, 400, { message: 'Unknown action.' });
  } catch (e) {
    return json(res, 500, { message: e.message || 'Payment service error.' });
  }
}
