// Vercel serverless function — self-serve payment of Collarone's own fees
// (activation fee / seat-credit packs) through COLLARONE'S Paystack account.
// This is Collarone collecting its own subscription revenue — normal merchant
// use, completely separate from org_payment_gateways (which are merchants'
// own accounts for their store sales).
//
// Requires PLATFORM_PAYSTACK_SECRET in Vercel env. Until it's set, 'status'
// reports disabled and the UI keeps the manual WhatsApp-confirmation flow.
//
//   POST { action: 'status' }                          → { enabled }
//   POST { action: 'init', reference, email }          → { authorizationUrl }
//   POST { action: 'verify', reference }               → { paid, type }
//     verify confirms with Paystack (amount checked against the pending
//     billing_transactions row), then applies the SAME effects as the manual
//     admin confirm: tx → confirmed, activation → org active, credit pack →
//     ledger credit. Safe to call repeatedly.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PAYSTACK_SECRET = process.env.PLATFORM_PAYSTACK_SECRET;

const json = (res, status, obj) => res.status(status).json(obj);

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { action } = body;

  if (action === 'status') return json(res, 200, { enabled: Boolean(PAYSTACK_SECRET) });
  if (!PAYSTACK_SECRET) return json(res, 400, { message: 'Online payment is not switched on yet — use the WhatsApp confirmation flow.' });
  if (!SERVICE_KEY) return json(res, 500, { message: 'Server not configured.' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const headers = { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' };
  const reference = String(body.reference || '').trim();
  if (!reference) return json(res, 400, { message: 'Missing payment reference.' });

  const { data: tx } = await admin.from('billing_transactions').select('*').eq('reference', reference).maybeSingle();
  if (!tx) return json(res, 404, { message: 'No payment with that reference.' });

  if (action === 'init') {
    if (tx.status !== 'pending') return json(res, 400, { message: `This payment is already ${tx.status}.` });
    const email = String(body.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { message: 'A valid email is required for card payment.' });
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const r = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST', headers,
      body: JSON.stringify({
        email,
        amount: tx.amount_kobo,
        currency: 'NGN',
        reference: `CLB-${reference}-${Date.now().toString(36).toUpperCase()}`,
        callback_url: `${proto}://${host}/pay/thanks?reference=${encodeURIComponent(reference)}`,
        metadata: { billing_reference: reference, org_id: tx.org_id, type: tx.type },
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d?.data?.authorization_url) return json(res, 502, { message: d?.message || 'Could not start the payment — try again or use the WhatsApp flow.' });
    await admin.from('billing_transactions').update({ paystack_ref: d.data.reference }).eq('id', tx.id).then(() => {}, () => {});
    return json(res, 200, { authorizationUrl: d.data.authorization_url });
  }

  if (action === 'verify') {
    if (tx.status === 'confirmed') return json(res, 200, { paid: true, type: tx.type });
    const psRef = tx.paystack_ref;
    if (!psRef) return json(res, 200, { paid: false });
    const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(psRef)}`, { headers });
    const d = await r.json().catch(() => ({}));
    const p = d?.data;
    const paid = r.ok && p?.status === 'success' && p?.currency === 'NGN' && Number(p?.amount) >= Number(tx.amount_kobo);
    if (!paid) return json(res, 200, { paid: false });

    // Same effects as the platform admin's manual confirm.
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
    }
    await admin.from('platform_admin_audit_log').insert({
      actor_id: tx.created_by, action: 'confirm_payment', target_org_id: tx.org_id,
      details: { transactionId: tx.id, type: tx.type, amountKobo: tx.amount_kobo, via: 'paystack_self_serve' },
    }).then(() => {}, () => {});
    return json(res, 200, { paid: true, type: tx.type });
  }

  return json(res, 400, { message: 'Unknown action.' });
}
