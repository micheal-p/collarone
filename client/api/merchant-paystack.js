// Merchant self-serve Paystack connect. An org's own admin pastes THEIR OWN
// Paystack keys here so their store checkout and their invoice pay-now links
// collect card payments straight into THEIR OWN bank — Collarone never holds
// the money. Replaces the old "contact your system admin" gate.
//
// The secret key is validated (a live call to Paystack) then stored
// server-side only: org_payment_gateways has RLS with zero policies, so the
// secret is never readable from any browser. Only the `enabled` flag and the
// public key ride out to the client (needed for inline checkout).
//
//   POST { action: 'status' }                         (Bearer) → { enabled, publicKey }
//   POST { action: 'connect', publicKey, secretKey }  (Bearer, super_admin) → { ok }
//   POST { action: 'disconnect' }                     (Bearer, super_admin) → { ok }
import { createClient } from '@supabase/supabase-js';
import { encryptSecret } from './_lib/gatewayCrypto.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const json = (res, s, o) => res.status(s).json(o);

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  if (!SERVICE_KEY) return json(res, 500, { message: 'Server not configured.' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { action } = body;

  // authenticate
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(res, 401, { message: 'Authentication required.' });
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json(res, 401, { message: 'Invalid session.' });
  const { data: caller } = await admin.from('profiles').select('org_id, role').eq('id', user.id).single();
  if (!caller) return json(res, 403, { message: 'No profile.' });

  try {
    if (action === 'status') {
      const { data: gw } = await admin.from('org_payment_gateways').select('enabled, public_key').eq('org_id', caller.org_id).maybeSingle();
      return json(res, 200, { enabled: Boolean(gw?.enabled), publicKey: gw?.public_key || '' });
    }

    // writes require the org's own admin
    if (caller.role !== 'super_admin') return json(res, 403, { message: 'Only your workspace admin can change payment settings.' });

    if (action === 'disconnect') {
      await admin.from('org_payment_gateways').update({ enabled: false, updated_at: new Date().toISOString() }).eq('org_id', caller.org_id);
      return json(res, 200, { ok: true });
    }

    if (action === 'connect') {
      const publicKey = String(body.publicKey || '').trim();
      const secretKey = String(body.secretKey || '').trim();
      if (!/^pk_(test|live)_[A-Za-z0-9]+$/.test(publicKey)) return json(res, 400, { message: 'That public key doesn’t look right — it should start with pk_live_ or pk_test_.' });
      if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(secretKey)) return json(res, 400, { message: 'That secret key doesn’t look right — it should start with sk_live_ or sk_test_.' });

      // validate the secret is real by hitting Paystack (balance endpoint)
      const vr = await fetch('https://api.paystack.co/balance', { headers: { Authorization: `Bearer ${secretKey}` } });
      if (vr.status === 401) return json(res, 400, { message: 'Paystack rejected that secret key. Copy it again from your Paystack dashboard → Settings → API Keys.' });
      if (!vr.ok) return json(res, 502, { message: 'Could not reach Paystack to verify the key — try again in a moment.' });

      await admin.from('org_payment_gateways').upsert({
        org_id: caller.org_id, provider: 'paystack', public_key: publicKey, secret_key: encryptSecret(secretKey),
        enabled: true, enabled_by: user.id, updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id' });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { message: 'Unknown action.' });
  } catch (e) {
    return json(res, 500, { message: e.message || 'Payment settings error.' });
  }
}
