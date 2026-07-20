// Vercel serverless function — privileged admin operations that require the
// Supabase SERVICE ROLE key. Runs server-side only; the key never reaches the
// browser. Set SUPABASE_SERVICE_KEY (and optionally SUPABASE_URL) in Vercel env.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const json = (res, status, obj) => res.status(status).json(obj);

const FOUNDING_ORG_ID = '00000000-0000-0000-0000-000000000001';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  if (!SERVICE_KEY) return json(res, 500, { message: 'Server not configured: SUPABASE_SERVICE_KEY missing.' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  // --- authenticate the caller and require System Admin ---
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(res, 401, { message: 'Authentication required.' });
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json(res, 401, { message: 'Invalid session.' });

  const { data: caller } = await admin.from('profiles').select('role, org_id').eq('id', user.id).single();
  if (!caller || caller.role !== 'super_admin') return json(res, 403, { message: 'System Admin access required.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { action } = body;

  const requirePlatformAdmin = async () => {
    const { data } = await admin.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (!data) { const e = new Error('Platform admin access required.'); e.status = 403; throw e; }
  };
  const logAudit = (auditAction, targetOrgId, details = {}) =>
    admin.from('platform_admin_audit_log').insert({ actor_id: user.id, action: auditAction, target_org_id: targetOrgId, details });

  try {
    if (action === 'create') {
      const { name, email, password, role = 'staff', jobTitle = '', department = '', departmentId = null, suites = [] } = body;
      if (!name || !email || !password) return json(res, 400, { message: 'Name, email and password are required.' });
      if (password.length < 8) return json(res, 400, { message: 'Temporary password must be at least 8 characters.' });
      const cleanEmail = email.toLowerCase().trim();

      // Non-founding orgs are seat-credit gated — one credit is consumed per new
      // staff account, so an org doesn't pay per-hire on top of its plan fee.
      if (caller.org_id !== FOUNDING_ORG_ID) {
        const { data: bal } = await admin.from('org_credit_balance').select('balance').eq('org_id', caller.org_id).maybeSingle();
        if (!bal || bal.balance <= 0) return json(res, 402, { message: 'No seat credits remaining — buy more credits before adding staff.' });
      }

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: cleanEmail, password, email_confirm: true, user_metadata: { name },
      });
      if (cErr) return json(res, /registered|exists/i.test(cErr.message) ? 409 : 400, { message: cErr.message });

      // Same Nigeria-only payroll gate as grant-suites, checked against the
      // creating admin's real IP (see the grant-suites action below).
      const ipCountry = (req.headers['x-vercel-ip-country'] || '').toUpperCase();
      let grantedSuites = role === 'super_admin' ? [] : (Array.isArray(suites) ? suites : []);
      if (ipCountry && ipCountry !== 'NG') grantedSuites = grantedSuites.filter((s) => s.key !== 'payroll');

      const row = {
        id: created.user.id, email: cleanEmail, name: name.trim(), job_title: jobTitle, department,
        department_id: departmentId || null, org_id: caller.org_id,
        role, suites: grantedSuites,
        status: 'active', must_change_password: true,
      };
      // Upsert: a DB trigger may have already created a default profile on user insert.
      const { data: profile, error: pErr } = await admin.from('profiles').upsert(row, { onConflict: 'id' }).select().single();
      if (pErr) { await admin.auth.admin.deleteUser(created.user.id); return json(res, 400, { message: pErr.message }); }

      if (caller.org_id !== FOUNDING_ORG_ID) {
        await admin.from('org_credit_ledger').insert({
          org_id: caller.org_id, delta: -1, reason: 'staff_created', related_profile_id: profile.id, created_by: user.id,
        });
      }
      const payrollDropped = (suites || []).some((s) => s.key === 'payroll') && !grantedSuites.some((s) => s.key === 'payroll');
      return json(res, 201, payrollDropped ? { ...profile, warning: 'Payroll can only be enabled from a Nigerian IP address — it was left out for this account.' } : profile);
    }

    if (action === 'purchase-credits') {
      const credits = Number(body.credits);
      if (!Number.isInteger(credits) || credits < 1) return json(res, 400, { message: 'Choose how many credits to buy.' });
      // Read the rate locked at signup — never recompute from a live constant
      // (which drifted on the tier rename and mispriced every org).
      const { data: org } = await admin.from('organizations').select('per_seat_kobo').eq('id', caller.org_id).single();
      const seatKobo = org?.per_seat_kobo ?? 200000;
      const amountKobo = seatKobo * credits;
      const reference = `CR-${caller.org_id.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      const { data: tx, error } = await admin.from('billing_transactions').insert({
        org_id: caller.org_id, type: 'credit_purchase', amount_kobo: amountKobo, reference,
        method: 'manual_transfer', status: 'pending', credits_granted: credits,
      }).select().single();
      if (error) return json(res, 400, { message: error.message });
      return json(res, 201, tx);
    }

    if (action === 'confirm-org-payment') {
      await requirePlatformAdmin();

      const { transactionId } = body;
      const { data: tx, error: txErr } = await admin.from('billing_transactions').select('*').eq('id', transactionId).single();
      if (txErr || !tx) return json(res, 404, { message: 'Transaction not found.' });
      if (tx.status !== 'pending') return json(res, 400, { message: `Transaction is already ${tx.status}.` });

      const { error: updErr } = await admin.from('billing_transactions')
        .update({ status: 'confirmed', confirmed_by: user.id, confirmed_at: new Date().toISOString() })
        .eq('id', transactionId);
      if (updErr) return json(res, 400, { message: updErr.message });

      if (tx.type === 'activation_fee') {
        await admin.from('organizations').update({ status: 'active' }).eq('id', tx.org_id);
      } else if (tx.type === 'credit_purchase') {
        await admin.from('org_credit_ledger').insert({
          org_id: tx.org_id, delta: tx.credits_granted, reason: 'purchase', related_transaction_id: tx.id, created_by: user.id,
        });
      }
      await logAudit('confirm_payment', tx.org_id, { transactionId, type: tx.type, amountKobo: tx.amount_kobo });
      return json(res, 200, { ok: true });
    }

    if (action === 'delete-org') {
      await requirePlatformAdmin();

      const { orgId } = body;
      if (!orgId) return json(res, 400, { message: 'orgId is required.' });
      if (orgId === FOUNDING_ORG_ID) return json(res, 400, { message: 'Tenant #1 cannot be deleted.' });

      const { data: org } = await admin.from('organizations').select('name, slug').eq('id', orgId).maybeSingle();
      const { data: members } = await admin.from('profiles').select('id').eq('org_id', orgId);
      for (const m of members || []) {
        await admin.auth.admin.deleteUser(m.id); // cascades to delete the profile row
      }
      await admin.from('org_credit_ledger').delete().eq('org_id', orgId);
      await admin.from('billing_transactions').delete().eq('org_id', orgId);
      const { error: delErr } = await admin.from('organizations').delete().eq('id', orgId);
      if (delErr) return json(res, 400, { message: delErr.message });
      await logAudit('delete_org', null, { orgId, name: org?.name, slug: org?.slug, memberCount: members?.length || 0 });
      return json(res, 200, { ok: true });
    }

    // 'guest-mode' — explicitly re-requested by the user after the earlier
    // "test suites" count-only check: they want to actually click through a
    // real org's UI to unit-test it, not see row counts. Real login as that
    // org's own super_admin, heavily audited, with a persistent "guest mode"
    // banner for the whole session (see AppLayout.jsx). Returns the magic
    // link's hashed token for the browser to redeem via verifyOtp() — NOT a
    // redirect link, because redirect URLs must be pre-allowlisted in the
    // Supabase auth config and an unlisted one silently bounces to the site
    // root without logging in (which is exactly how this "wasn't working").
    if (action === 'guest-mode') {
      await requirePlatformAdmin();

      const { orgId } = body;
      if (!orgId) return json(res, 400, { message: 'orgId is required.' });
      const { data: org } = await admin.from('organizations').select('name, slug').eq('id', orgId).maybeSingle();
      const { data: target } = await admin.from('profiles').select('id, email, name')
        .eq('org_id', orgId).eq('role', 'super_admin').limit(1).maybeSingle();
      if (!target) return json(res, 404, { message: 'This organization has no admin account to guest into.' });

      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: target.email });
      if (linkErr) return json(res, 400, { message: linkErr.message });

      await logAudit('guest_mode', orgId, { targetProfileId: target.id, targetEmail: target.email });
      return json(res, 200, { tokenHash: link.properties.hashed_token, name: target.name, email: target.email, orgName: org?.name || 'this organization' });
    }

    // Per-merchant Paystack gateway — the merchant's OWN keys, so card
    // payments settle directly to their bank (Collarone never touches the
    // money). Keys live in org_payment_gateways, which has RLS enabled with
    // no policies: only this service role can read or write them, and they
    // are never echoed back or logged — the get mode returns a masked state.
    if (action === 'payment-gateway') {
      await requirePlatformAdmin();
      const { orgId, mode } = body;
      if (!orgId) return json(res, 400, { message: 'orgId is required.' });

      if (mode === 'get') {
        const { data: gw } = await admin.from('org_payment_gateways').select('enabled, public_key, secret_key, updated_at').eq('org_id', orgId).maybeSingle();
        return json(res, 200, {
          enabled: Boolean(gw?.enabled),
          hasKeys: Boolean(gw?.secret_key),
          publicKeyMasked: gw?.public_key ? `${gw.public_key.slice(0, 12)}…` : '',
          updatedAt: gw?.updated_at || null,
        });
      }

      const { publicKey, secretKey, enabled } = body;
      // Re-enabling with keys already on file is legitimate (the modal says
      // "paste new keys only to replace them") — only demand keys when none
      // are stored.
      if (enabled && (!publicKey || !secretKey)) {
        const { data: existing } = await admin.from('org_payment_gateways').select('secret_key').eq('org_id', orgId).maybeSingle();
        if (!existing?.secret_key) return json(res, 400, { message: 'Both Paystack keys are required to enable card payments.' });
      }
      const patch = { org_id: orgId, enabled: Boolean(enabled), enabled_by: user.id, updated_at: new Date().toISOString() };
      if (publicKey) patch.public_key = String(publicKey).trim();
      if (secretKey) patch.secret_key = String(secretKey).trim();
      const { error: gwErr } = await admin.from('org_payment_gateways').upsert(patch, { onConflict: 'org_id' });
      if (gwErr) return json(res, 400, { message: gwErr.message });
      await logAudit('payment_gateway', orgId, { enabled: Boolean(enabled) });
      return json(res, 200, { ok: true, enabled: Boolean(enabled) });
    }

    // Payroll runs Nigerian PAYE/pension/NHF only — it isn't built for any
    // other country's statutory regime. Gating on the org's self-reported
    // `country` field isn't enough (that's just a form field at signup), so
    // this checks the real IP of whoever is granting it, via Vercel's edge
    // geolocation header — the same signal used for page-view geography.
    // This runs through the service role (not the browser's direct RLS
    // update) specifically so it has a request to read that header from.
    if (action === 'grant-suites') {
      const { id, suites } = body;
      if (!id || !Array.isArray(suites)) return json(res, 400, { message: 'id and suites are required.' });

      const { data: target } = await admin.from('profiles').select('id, org_id').eq('id', id).maybeSingle();
      if (!target || target.org_id !== caller.org_id) return json(res, 404, { message: 'User not found in your organization.' });

      const wantsPayroll = suites.some((s) => s.key === 'payroll');
      const ipCountry = (req.headers['x-vercel-ip-country'] || '').toUpperCase();
      const finalSuites = (wantsPayroll && ipCountry && ipCountry !== 'NG')
        ? suites.filter((s) => s.key !== 'payroll')
        : suites;

      const { data: profile, error } = await admin.from('profiles').update({ suites: finalSuites }).eq('id', id).select().single();
      if (error) return json(res, 400, { message: error.message });
      if (wantsPayroll && finalSuites.length !== suites.length) {
        return json(res, 200, { ...profile, warning: 'Payroll can only be enabled from a Nigerian IP address — it was left out of this grant.' });
      }
      return json(res, 200, profile);
    }

    if (action === 'reset-password') {
      const { id, password } = body;
      if (!password || password.length < 8) return json(res, 400, { message: 'Temporary password must be at least 8 characters.' });
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json(res, 400, { message: error.message });
      await admin.from('profiles').update({ must_change_password: true }).eq('id', id);
      return json(res, 200, { ok: true });
    }

    if (action === 'set-status') {
      const { id, status } = body;
      if (!['active', 'disabled'].includes(status)) return json(res, 400, { message: 'Invalid status.' });
      if (id === user.id) return json(res, 400, { message: 'You cannot change your own account status.' });
      // Ban at the auth layer so the change takes effect immediately.
      await admin.auth.admin.updateUserById(id, { ban_duration: status === 'disabled' ? '876000h' : 'none' });
      const { data: profile, error } = await admin.from('profiles').update({ status }).eq('id', id).select().single();
      if (error) return json(res, 400, { message: error.message });
      return json(res, 200, profile);
    }

    // Manually move an org along the billing lifecycle, or extend its renewal.
    // Always available to a platform admin regardless of the PAYWALL_ENFORCE
    // auto-advance flag — this is how the first dunning cycles are run by hand.
    if (action === 'set-billing-state') {
      await requirePlatformAdmin();
      const { orgId, status, periodEndDays } = body;
      if (orgId === FOUNDING_ORG_ID) return json(res, 400, { message: 'The founding org is not billed.' });
      const patch = {};
      if (status !== undefined) {
        if (!['active', 'past_due', 'read_only', 'suspended', 'cancelled'].includes(status)) return json(res, 400, { message: 'Invalid billing status.' });
        patch.status = status;
        // Restoring to active clears the grace clock and starts a fresh period.
        if (status === 'active') { patch.grace_until = null; if (periodEndDays === undefined) patch.current_period_end = new Date(Date.now() + 30 * 86400000).toISOString(); }
        if (status === 'past_due') patch.grace_until = new Date(Date.now() + 7 * 86400000).toISOString();
      }
      if (periodEndDays !== undefined) {
        const days = Number(periodEndDays);
        if (!Number.isFinite(days)) return json(res, 400, { message: 'Invalid renewal length.' });
        patch.current_period_end = new Date(Date.now() + days * 86400000).toISOString();
      }
      if (!Object.keys(patch).length) return json(res, 400, { message: 'Nothing to change.' });
      const { data, error } = await admin.from('organizations').update(patch).eq('id', orgId).select('id, status, current_period_end, grace_until').single();
      if (error) return json(res, 400, { message: error.message });
      await logAudit('set_billing_state', orgId, patch);
      return json(res, 200, data);
    }

    return json(res, 400, { message: `Unknown action: ${action}` });
  } catch (e) {
    return json(res, e.status || 500, { message: e.message || 'Admin operation failed.' });
  }
}
