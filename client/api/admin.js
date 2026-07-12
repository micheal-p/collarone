// Vercel serverless function — privileged admin operations that require the
// Supabase SERVICE ROLE key. Runs server-side only; the key never reaches the
// browser. Set SUPABASE_SERVICE_KEY (and optionally SUPABASE_URL) in Vercel env.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const json = (res, status, obj) => res.status(status).json(obj);

const FOUNDING_ORG_ID = '00000000-0000-0000-0000-000000000001';
const PLAN_SEAT_KOBO = { starter: 100000, growth: 150000, scale: 200000 }; // NGN 1,000 / 1,500 / 2,000

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

      const row = {
        id: created.user.id, email: cleanEmail, name: name.trim(), job_title: jobTitle, department,
        department_id: departmentId || null, org_id: caller.org_id,
        role, suites: role === 'super_admin' ? [] : (Array.isArray(suites) ? suites : []),
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
      return json(res, 201, profile);
    }

    if (action === 'purchase-credits') {
      const credits = Number(body.credits);
      if (!Number.isInteger(credits) || credits < 1) return json(res, 400, { message: 'Choose how many credits to buy.' });
      const { data: org } = await admin.from('organizations').select('plan_tier').eq('id', caller.org_id).single();
      const seatKobo = PLAN_SEAT_KOBO[org?.plan_tier] || PLAN_SEAT_KOBO.starter;
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

    // 'impersonate' (real magic-link login as a customer's own admin) removed
    // deliberately — platform admin must never see a customer's internal
    // business data. Replaced by platform_admin_test_suite() (count-only
    // suite health check, see supabase/platform_suite_test.sql), called
    // directly from the client via Supabase RPC, not through this function.

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

    return json(res, 400, { message: `Unknown action: ${action}` });
  } catch (e) {
    return json(res, e.status || 500, { message: e.message || 'Admin operation failed.' });
  }
}
