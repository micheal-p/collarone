// Vercel serverless function — Paystack card checkout for built stores.
//
// The money model, non-negotiable: every merchant uses THEIR OWN Paystack
// account (keys stored server-side by the platform admin, never readable
// from the browser), so card payments settle directly into the merchant's
// bank. Collarone never holds or routes funds — same instruction-only
// principle as payroll.
//
//   POST { action: 'init',   orgSlug, orderId }
//     → { authorizationUrl } — creates a Paystack transaction for the order
//       total (read from the DB, never the client) and returns the hosted
//       checkout URL. The callback returns to /site/<slug>?payref=<ref>.
//   POST { action: 'verify', orgSlug, reference }
//     → { paid, orderNo, total } — confirms with Paystack (amount + currency
//       checked against the order) and stamps the order confirmed/paid.
//
// Public and unauthenticated by design (shoppers have no account); both
// actions only ever act on the single order tied to the reference/id.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const json = (res, status, obj) => res.status(status).json(obj);

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  if (!SERVICE_KEY) return json(res, 500, { message: 'Server not configured: SUPABASE_SERVICE_KEY missing.' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { action, orgSlug } = body;

  try {
    const { data: org } = await admin.from('organizations').select('id, slug').eq('slug', String(orgSlug || '')).maybeSingle();
    if (!org) return json(res, 404, { message: 'Unknown store.' });
    const { data: gw } = await admin.from('org_payment_gateways').select('secret_key, enabled').eq('org_id', org.id).maybeSingle();
    if (!gw?.enabled || !gw.secret_key) return json(res, 400, { message: 'This store does not take card payments.' });
    const headers = { Authorization: `Bearer ${gw.secret_key}`, 'Content-Type': 'application/json' };

    if (action === 'init') {
      const { data: order } = await admin.from('site_orders')
        .select('id, org_id, order_no, email, total_naira, payment_method, paid_at')
        .eq('id', String(body.orderId || '')).eq('org_id', org.id).maybeSingle();
      if (!order) return json(res, 404, { message: 'Order not found.' });
      if (order.payment_method !== 'card') return json(res, 400, { message: 'This order is not a card order.' });
      if (order.paid_at) return json(res, 400, { message: 'This order is already paid.' });
      if (!order.email) return json(res, 400, { message: 'The order has no email for card payment.' });

      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const reference = `CLO-${order.order_no}-${Date.now().toString(36).toUpperCase()}`;
      const r = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST', headers,
        body: JSON.stringify({
          email: order.email,
          amount: Math.round(Number(order.total_naira) * 100), // kobo
          currency: 'NGN',
          reference,
          callback_url: `${proto}://${host}/site/${org.slug}?payref=${encodeURIComponent(reference)}`,
          metadata: { order_no: order.order_no, org_slug: org.slug },
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.data?.authorization_url) {
        return json(res, 502, { message: d?.message || 'Could not start the card payment — try another method.' });
      }
      await admin.from('site_orders').update({ paystack_ref: reference }).eq('id', order.id);
      return json(res, 200, { authorizationUrl: d.data.authorization_url });
    }

    if (action === 'verify') {
      const reference = String(body.reference || '');
      if (!reference) return json(res, 400, { message: 'Missing payment reference.' });
      const { data: order } = await admin.from('site_orders')
        .select('id, order_no, total_naira, status, paid_at')
        .eq('paystack_ref', reference).eq('org_id', org.id).maybeSingle();
      if (!order) return json(res, 404, { message: 'No order matches this payment.' });
      if (order.paid_at) return json(res, 200, { paid: true, orderNo: order.order_no, total: Number(order.total_naira) });

      const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers });
      const d = await r.json().catch(() => ({}));
      const tx = d?.data;
      const paid = r.ok && tx?.status === 'success' && tx?.currency === 'NGN'
        && Number(tx?.amount) >= Math.round(Number(order.total_naira) * 100);
      if (!paid) return json(res, 200, { paid: false, orderNo: order.order_no, total: Number(order.total_naira) });

      await admin.from('site_orders').update({ paid_at: new Date().toISOString(), status: order.status === 'new' ? 'confirmed' : order.status }).eq('id', order.id);
      return json(res, 200, { paid: true, orderNo: order.order_no, total: Number(order.total_naira) });
    }

    return json(res, 400, { message: 'Unknown action.' });
  } catch (e) {
    return json(res, 500, { message: e.message || 'Payment service error.' });
  }
}
