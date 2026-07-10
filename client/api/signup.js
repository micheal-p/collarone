// Vercel serverless function — the public self-serve signup entry point.
// Unauthenticated by design (this IS account creation), but every write goes
// through the SERVICE ROLE key server-side, never the browser. Mirrors the
// privileged-op pattern in admin.js.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const json = (res, status, obj) => res.status(status).json(obj);

const PLAN_BASE_FEE_KOBO = { starter: 1000000, growth: 1800000, scale: 3000000 }; // NGN 10k / 18k / 30k
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  if (!SERVICE_KEY) return json(res, 500, { message: 'Server not configured: SUPABASE_SERVICE_KEY missing.' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { action } = body;

  try {
    if (action === 'check-slug') {
      const slug = (body.slug || '').trim().toLowerCase();
      if (!SLUG_RE.test(slug)) return json(res, 200, { available: false, reason: 'Use 3–40 lowercase letters, numbers or hyphens.' });
      const { data, error } = await admin.from('organizations').select('id').eq('slug', slug).maybeSingle();
      if (error) return json(res, 400, { message: error.message });
      return json(res, 200, { available: !data });
    }

    if (action === 'create') {
      const {
        planTier, orgName, orgSlug, themeColor = '#FF5B1F', logoUrl = '', websiteType = 'none',
        ownerName, email, password,
      } = body;

      if (!['starter', 'growth', 'scale'].includes(planTier)) return json(res, 400, { message: 'Choose a plan.' });
      if (!orgName?.trim()) return json(res, 400, { message: 'Company name is required.' });
      const slug = (orgSlug || '').trim().toLowerCase();
      if (!SLUG_RE.test(slug)) return json(res, 400, { message: 'Company handle must be 3–40 lowercase letters, numbers or hyphens.' });
      if (!ownerName?.trim()) return json(res, 400, { message: 'Your name is required.' });
      if (!EMAIL_RE.test(email || '')) return json(res, 400, { message: 'Enter a valid work email.' });
      if (!password || password.length < 8) return json(res, 400, { message: 'Password must be at least 8 characters.' });

      const { data: existingSlug } = await admin.from('organizations').select('id').eq('slug', slug).maybeSingle();
      if (existingSlug) return json(res, 409, { message: 'That company handle is already taken.' });

      const cleanEmail = email.toLowerCase().trim();
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: {
          signup_type: 'org_owner',
          name: ownerName.trim(),
          org_name: orgName.trim(),
          org_slug: slug,
          plan_tier: planTier,
          theme_color: themeColor,
          logo_url: logoUrl,
          website_type: websiteType,
        },
      });
      if (cErr) return json(res, /registered|exists/i.test(cErr.message) ? 409 : 400, { message: cErr.message });

      const { data: org, error: orgErr } = await admin.from('organizations').select('id').eq('created_by', created.user.id).maybeSingle();
      if (orgErr || !org) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json(res, 500, { message: 'Could not set up your organization. Please try again.' });
      }

      const amountKobo = PLAN_BASE_FEE_KOBO[planTier];
      const reference = `CO-${slug.slice(0, 12).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const { error: txErr } = await admin.from('billing_transactions').insert({
        org_id: org.id, type: 'activation_fee', amount_kobo: amountKobo, reference, method: 'manual_transfer', status: 'pending',
      });
      if (txErr) return json(res, 500, { message: 'Account created, but we could not generate a payment reference. Contact us on WhatsApp with your company name.' });

      return json(res, 201, { orgId: org.id, reference, amountKobo, email: cleanEmail });
    }

    return json(res, 400, { message: `Unknown action: ${action}` });
  } catch (e) {
    return json(res, 500, { message: e.message || 'Signup failed.' });
  }
}
