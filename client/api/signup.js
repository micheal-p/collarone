// Vercel serverless function — the public self-serve signup entry point.
// Unauthenticated by design (this IS account creation), but every write goes
// through the SERVICE ROLE key server-side, never the browser. Mirrors the
// privileged-op pattern in admin.js.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const json = (res, status, obj) => res.status(status).json(obj);

// Errors a person can act on. Supabase can surface a raw '{}' or a JSON blob
// as an error message on transient auth-service hiccups — a real visitor saw
// exactly '{}' mid-signup. Nothing shaped like data ever reaches the screen
// again, and every failed signup is RECORDED (client_errors → Platform
// Control's app-errors inbox) so a lost prospect leaves a trace we can act on.
const HUMAN_FALLBACK = 'Something went wrong on our side — please try again in a minute, or WhatsApp 0814 812 8551 and we will set you up personally.';
const friendly = (msg) => {
  const s = typeof msg === 'string' ? msg.trim() : '';
  return (!s || s === '{}' || s.startsWith('{') || s.startsWith('[')) ? HUMAN_FALLBACK : s;
};
const recordSignupError = async (admin, stage, msg, ctx = {}) => {
  try {
    await admin.from('client_errors').insert({
      message: `signup failed [${stage}]: ${String(msg || 'unknown').slice(0, 300)}`,
      stack: JSON.stringify(ctx).slice(0, 2000) || null,   // email/slug so we can rescue the person; never the password
      path: '/signup',
    });
  } catch { /* recording must never break signup itself */ }
};

// Server-side pricing FALLBACK, in kobo. Signup is the single WRITE point of
// the locked rate — it snapshots the org's rate at creation so future charges
// read the stored value. The live published prices come from platform_pricing
// (editable in Platform Control); these constants only cover a fetch failure.
const PLAN = {
  startup:    { baseKobo: 1500000, seatKobo: 200000, included: 3, extraKobo: 800000 },
  standard:   { baseKobo: 2500000, seatKobo: 200000, included: 5, extraKobo: 600000 },
  enterprise: { baseKobo: 4500000, seatKobo: 200000, included: 8, extraKobo: 400000 },
};

// Published prices from the DB, falling back to the constants above.
// Find an auth user by email (admin API has no email filter; paginate).
async function findUserByEmail(admin, email) {
  const target = String(email).toLowerCase();
  for (let page = 1; page <= 25; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users || [];
    const hit = users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
}

async function livePlan(admin, planTier) {
  const fallback = PLAN[planTier] || PLAN.startup;
  try {
    const [{ data: row }, { data: settings }] = await Promise.all([
      admin.from('platform_pricing').select('*').eq('plan_key', planTier).maybeSingle(),
      admin.from('platform_billing_settings').select('per_staff_kobo').maybeSingle(),
    ]);
    if (!row) return fallback;
    return {
      baseKobo: Number(row.base_fee_kobo), seatKobo: Number(settings?.per_staff_kobo ?? fallback.seatKobo),
      included: Number(row.included_suites), extraKobo: Number(row.extra_suite_fee_kobo),
    };
  } catch { return fallback; }
}

// Snapshot the FULL rate card (all priced tiers + per-seat + annual discount)
// at sign-up so renewals always charge best-tier at the rates the customer
// signed up under — a later price rise never re-prices them. Enterprise is
// excluded (custom quote). Null → renewals fall back to current_published_rate_card().
async function liveRateCard(admin) {
  try {
    const [{ data: rows }, { data: settings }] = await Promise.all([
      admin.from('platform_pricing').select('plan_key, base_fee_kobo, included_suites, extra_suite_fee_kobo, sort_order').neq('plan_key', 'enterprise').order('sort_order'),
      admin.from('platform_billing_settings').select('per_staff_kobo, annual_discount').maybeSingle(),
    ]);
    const tiers = (rows || []).map((r) => ({
      key: r.plan_key, baseKobo: Number(r.base_fee_kobo),
      included: Number(r.included_suites), extraKobo: Number(r.extra_suite_fee_kobo),
    }));
    if (!tiers.length) return null;
    return { perSeatKobo: Number(settings?.per_staff_kobo ?? 200000), annualDiscount: Number(settings?.annual_discount ?? 0.15), tiers };
  } catch { return null; }
}
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The suite catalog, mirrored from client/src/config/suites.js — this file is a
// serverless function and can't import from the app bundle. The price and the
// access gate both hang off this list, so a made-up key must never survive:
// anything not recognised is dropped rather than trusted.
const SUITE_KEYS = [
  'hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm', 'attendance', 'procurement',
  'inventory', 'finance', 'projects', 'documents', 'trade-docs', 'automation', 'compliance',
];
// Hard dependencies: picking one of these pulls in its foundation, and the
// customer pays for that foundation too. Mirrors requiredFoundations().
const REQUIRES = { leave: ['hr'], payroll: ['hr'], attendance: ['hr'] };

function cleanSuites(picked) {
  const out = [];
  const add = (k) => {
    if (!SUITE_KEYS.includes(k) || out.includes(k)) return;
    for (const dep of REQUIRES[k] || []) add(dep);
    out.push(k);
  };
  for (const k of Array.isArray(picked) ? picked : []) add(String(k));
  return out;
}

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
      return json(res, 200, { valid: true, percentOff: promo.percent_off, trialDays: promo.trial_days || null, grantCredits: promo.grant_credits || 0 });
    }

    if (action === 'create') {
      const {
        planTier, orgName, orgSlug, themeColor = '#FF5B1F', logoUrl = '', websiteType = 'none', country = 'NG', externalWebsiteUrl = '',
        ownerName, email, password, promoCode = '', suites: pickedSuites = [],
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
      let userId;
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { name: ownerName.trim() },
      });
      if (cErr) {
        if (!/registered|exists/i.test(cErr.message)) {
          await recordSignupError(admin, 'auth-create', cErr.message, { email: cleanEmail, slug, orgName: orgName?.trim() });
          return json(res, 400, { message: friendly(cErr.message) });
        }
        // Email exists in auth. A genuine account has a profile — look it up by
        // email first (cheap, no user scan): if a profile owns it OR the lookup
        // errors, refuse rather than risk touching a real account.
        const { data: existingProfile, error: profLookupErr } = await admin.from('profiles').select('id').eq('email', cleanEmail).maybeSingle();
        if (profLookupErr || existingProfile) return json(res, 409, { message: 'That email is already registered — please log in instead.' });
        // No profile → possibly an unused job-board POSTER stub squatting the email.
        const existing = await findUserByEmail(admin, cleanEmail);
        if (!existing || existing.user_metadata?.poster !== true) {
          return json(res, 409, { message: 'That email is already registered — please log in instead.' });
        }
        // SECURITY: adopting the stub resets its password, so require proof the
        // caller actually owns this poster account — a valid session for THIS
        // user. Without it, anyone who knew a poster's email could take the
        // account over. The upgrade CTA sends the logged-in poster's token.
        const authToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const { data: tokUser } = authToken ? await admin.auth.getUser(authToken) : { data: { user: null } };
        if (!tokUser?.user || tokUser.user.id !== existing.id) {
          return json(res, 409, { message: 'That email already has a job-poster account. Please log in with it first, then pick your suites.' });
        }
        // Ownership proven — adopt in place; keep their posts linked to them.
        const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, { password, user_metadata: { ...(existing.user_metadata || {}), name: ownerName.trim() } });
        if (updErr) return json(res, 400, { message: 'Could not create your account — please try again.' });
        userId = existing.id;
      } else {
        userId = created.user.id;
      }

      // Don't rely on the on_auth_user_created trigger reading this request's
      // metadata reliably at insert time for admin-created users — write the
      // organization and profile explicitly instead, same pattern as admin.js.
      const [plan, rateCard] = await Promise.all([livePlan(admin, planTier), liveRateCard(admin)]);
      const { data: org, error: orgErr } = await admin.from('organizations').insert({
        name: orgName.trim(), slug, plan_tier: planTier, status: 'pending_payment',
        theme_color: themeColor, logo_url: logoUrl, website_type: websiteType, country, created_by: userId,
        external_website_url: (typeof externalWebsiteUrl === 'string' && /^https?:\/\/.{3,200}$/i.test(externalWebsiteUrl.trim())) ? externalWebsiteUrl.trim() : '',
        // Lock the rate at signup — read back for every future charge. The
        // single-tier fields stay for back-compat; rate_card is the full
        // snapshot best-tier renewals price against.
        base_fee_kobo: plan.baseKobo, per_seat_kobo: plan.seatKobo,
        included_suites: plan.included, extra_suite_fee_kobo: plan.extraKobo,
        rate_locked_at: new Date().toISOString(),
        // What they actually bought. The cart has always sent this and the
        // server has always dropped it, which is why every org billed for zero
        // suites while its owner could open all of them (see org_suites.sql).
        suites: cleanSuites(pickedSuites),
      }).select('id').single();
      if (orgErr || !org) {
        await admin.auth.admin.deleteUser(userId);
        if (orgErr?.code !== '23505') await recordSignupError(admin, 'org-insert', orgErr?.message, { email: cleanEmail, slug, orgName: orgName?.trim() });
        return json(res, orgErr?.code === '23505' ? 409 : 500, { message: orgErr?.code === '23505' ? 'That company handle is already taken.' : 'Could not set up your organization. Please try again.' });
      }

      // Snapshot the locked rate card as a best-effort follow-up so signup works
      // even if the billing_best_tier.sql migration hasn't been applied yet
      // (renewals fall back to current_published_rate_card() when it's null).
      if (rateCard) await admin.from('organizations').update({ rate_card: rateCard }).eq('id', org.id).then(() => {}, () => {});

      const { error: profErr } = await admin.from('profiles').upsert({
        id: userId, email: cleanEmail, name: ownerName.trim(), role: 'super_admin',
        org_id: org.id, suites: [], status: 'active', must_change_password: false,
      }, { onConflict: 'id' });
      if (profErr) {
        await admin.auth.admin.deleteUser(userId);
        await admin.from('organizations').delete().eq('id', org.id);
        await recordSignupError(admin, 'profile-upsert', profErr.message, { email: cleanEmail, slug, orgName: orgName?.trim() });
        return json(res, 500, { message: 'Could not set up your account. Please try again.' });
      }

      // Promo codes are the owner's setup: a % off the activation fee, an
      // optional bundle of free seat credits, and an optional trial window
      // ("free for 3 days / 1 month"). A 100%-off code activates the org
      // immediately — permanently if no trial_days, otherwise until
      // trial_ends_at, which client/api/health.js enforces by suspending.
      const promo = await findValidPromo(admin, promoCode);
      const baseKobo = plan.baseKobo;
      const amountKobo = promo ? Math.round(baseKobo * (100 - promo.percent_off) / 100) : baseKobo;
      const isFree = amountKobo <= 0;
      const trialDays = promo?.trial_days || null;
      const reference = `CO-${slug.slice(0, 12).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const { error: txErr } = await admin.from('billing_transactions').insert({
        org_id: org.id, type: 'activation_fee', amount_kobo: amountKobo, reference,
        method: 'manual_transfer', status: isFree ? 'confirmed' : 'pending', promo_code: promo?.code || null,
      });
      if (txErr) return json(res, 500, { message: 'Account created, but we could not generate a payment reference. Contact us on WhatsApp with your company name.' });

      if (promo) {
        await admin.from('promo_codes').update({ uses: promo.uses + 1 }).eq('id', promo.id);
        if (promo.grant_credits > 0) {
          await admin.from('org_credit_ledger').insert({
            org_id: org.id, delta: promo.grant_credits, reason: 'promo_grant', created_by: userId,
          });
        }
      }
      if (isFree) {
        await admin.from('organizations').update({
          status: 'active',
          trial_ends_at: trialDays ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString() : null,
        }).eq('id', org.id);
      }

      return json(res, 201, {
        orgId: org.id, reference, amountKobo, email: cleanEmail,
        promoApplied: promo ? { code: promo.code, percentOff: promo.percent_off, baseKobo, trialDays, grantCredits: promo.grant_credits || 0 } : null,
        activated: isFree,
      });
    }

    return json(res, 400, { message: `Unknown action: ${action}` });
  } catch (e) {
    try {
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
      await recordSignupError(admin, 'unhandled', e.message, { action });
    } catch { /* never block the response */ }
    return json(res, 500, { message: friendly(e.message) });
  }
}
