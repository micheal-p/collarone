// Vercel serverless function — the public self-serve signup entry point.
// Unauthenticated by design (this IS account creation), but every write goes
// through the SERVICE ROLE key server-side, never the browser. Mirrors the
// privileged-op pattern in admin.js.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const json = (res, status, obj) => res.status(status).json(obj);

const PLAN_BASE_FEE_KOBO = { startup: 1500000, standard: 2500000, enterprise: 4500000 }; // NGN 15k / 25k / 45k
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function findValidPromo(admin, rawCode) {
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) return null;
  const { data: promo } = await admin.from('promo_codes').select('*').eq('code', code).eq('active', true).maybeSingle();
  if (!promo) return null;
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) return null;
  if (promo.max_uses != null && promo.uses >= promo.max_uses) return null;
  return promo;
}

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

    // Validate (but don't redeem) a promo code — used live in the signup form.
    // Redemption only happens inside 'create', after the account really exists.
    if (action === 'check-promo') {
      const promo = await findValidPromo(admin, body.code);
      if (!promo) return json(res, 200, { valid: false, reason: 'That code is invalid or has expired.' });
      return json(res, 200, { valid: true, percentOff: promo.percent_off });
    }

    if (action === 'create') {
      const {
        planTier, orgName, orgSlug, themeColor = '#FF5B1F', logoUrl = '', websiteType = 'none', country = 'NG',
        ownerName, email, password, promoCode = '',
      } = body;

      if (!['startup', 'standard', 'enterprise'].includes(planTier)) return json(res, 400, { message: 'Choose a plan.' });
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
        user_metadata: { name: ownerName.trim() },
      });
      if (cErr) return json(res, /registered|exists/i.test(cErr.message) ? 409 : 400, { message: cErr.message });

      // Don't rely on the on_auth_user_created trigger reading this request's
      // metadata reliably at insert time for admin-created users — write the
      // organization and profile explicitly instead, same pattern as admin.js.
      const { data: org, error: orgErr } = await admin.from('organizations').insert({
        name: orgName.trim(), slug, plan_tier: planTier, status: 'pending_payment',
        theme_color: themeColor, logo_url: logoUrl, website_type: websiteType, country, created_by: created.user.id,
      }).select('id').single();
      if (orgErr || !org) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json(res, orgErr?.code === '23505' ? 409 : 500, { message: orgErr?.code === '23505' ? 'That company handle is already taken.' : 'Could not set up your organization. Please try again.' });
      }

      const { error: profErr } = await admin.from('profiles').upsert({
        id: created.user.id, email: cleanEmail, name: ownerName.trim(), role: 'super_admin',
        org_id: org.id, suites: [], status: 'active', must_change_password: false,
      }, { onConflict: 'id' });
      if (profErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        await admin.from('organizations').delete().eq('id', org.id);
        return json(res, 500, { message: 'Could not set up your account. Please try again.' });
      }

      // Promo codes knock a percentage off the activation fee. A 100%-off
      // code activates the organization immediately — no transfer to wait on.
      const promo = await findValidPromo(admin, promoCode);
      const baseKobo = PLAN_BASE_FEE_KOBO[planTier];
      const amountKobo = promo ? Math.round(baseKobo * (100 - promo.percent_off) / 100) : baseKobo;
      const isFree = amountKobo <= 0;
      const reference = `CO-${slug.slice(0, 12).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const { error: txErr } = await admin.from('billing_transactions').insert({
        org_id: org.id, type: 'activation_fee', amount_kobo: amountKobo, reference,
        method: 'manual_transfer', status: isFree ? 'confirmed' : 'pending', promo_code: promo?.code || null,
      });
      if (txErr) return json(res, 500, { message: 'Account created, but we could not generate a payment reference. Contact us on WhatsApp with your company name.' });

      if (promo) await admin.from('promo_codes').update({ uses: promo.uses + 1 }).eq('id', promo.id);
      if (isFree) await admin.from('organizations').update({ status: 'active' }).eq('id', org.id);

      return json(res, 201, {
        orgId: org.id, reference, amountKobo, email: cleanEmail,
        promoApplied: promo ? { code: promo.code, percentOff: promo.percent_off, baseKobo } : null,
        activated: isFree,
      });
    }

    return json(res, 400, { message: `Unknown action: ${action}` });
  } catch (e) {
    return json(res, 500, { message: e.message || 'Signup failed.' });
  }
}
