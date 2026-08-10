// Vercel serverless function — privileged admin operations that require the
// Supabase SERVICE ROLE key. Runs server-side only; the key never reaches the
// browser. Set SUPABASE_SERVICE_KEY (and optionally SUPABASE_URL) in Vercel env.
import { createClient } from '@supabase/supabase-js';
import { emitOrgEvent } from './_lib/events.js';

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

  // Guard for any action that acts on an arbitrary `id`: the target must be a
  // real user IN THE CALLER'S OWN ORG (and never a platform admin). Without it
  // a tenant super_admin could reset/disable users in other orgs. Returns true
  // (having already sent the error response) when the target is invalid.
  const rejectForeignTarget = async (id) => {
    if (!id) { json(res, 400, { message: 'User id is required.' }); return true; }
    const { data: target } = await admin.from('profiles').select('id, org_id').eq('id', id).maybeSingle();
    if (!target || target.org_id !== caller.org_id) { json(res, 404, { message: 'User not found in your organization.' }); return true; }
    const { data: isPlat } = await admin.from('platform_admins').select('user_id').eq('user_id', id).maybeSingle();
    if (isPlat) { json(res, 403, { message: 'Not permitted.' }); return true; }
    return false;
  };

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

      // ---- hire automation: the suites act like brothers, not silos --------
      // All best-effort — a hiccup here never fails the account creation.
      try {
        // 1) Leave: seed this year's balances for every tracked leave type
        //    (entitled=null → "use the type's default_days"), so the new
        //    person can request leave on day one without HR doing setup.
        const year = new Date().getFullYear();
        const { data: ltypes } = await admin.from('leave_types')
          .select('id').eq('org_id', caller.org_id).eq('active', true).eq('tracked', true);
        if (ltypes?.length) {
          await admin.from('leave_balances').upsert(
            ltypes.map((t) => ({ user_id: profile.id, leave_type_id: t.id, year, org_id: caller.org_id })),
            { onConflict: 'user_id,leave_type_id,year', ignoreDuplicates: true },
          );
        }
        // 2) Tasks: one onboarding task for the admin who hired them, listing
        //    the setup only a human can decide (salary, bank, assets, benefits).
        await admin.from('tasks').insert({
          org_id: caller.org_id, created_by: user.id, assigned_to: user.id,
          title: `Onboard ${name.trim()}`,
          description: `Finish setting up ${name.trim()}${jobTitle ? ` (${jobTitle})` : ''}:\n• Salary structure & bank details (Payroll)\n• Assign any equipment (IT Assets)\n• Enrol benefits (HMO / pension)\n• Share their login and first-day info`,
          priority: 'high',
          due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        });
        // 3) The event spine: visible in every teammate's notification bell.
        await emitOrgEvent(admin, caller.org_id, 'hr.hired', { name: name.trim(), jobTitle: jobTitle || '' }, user.id);
      } catch { /* automation is a bonus on top of a successful hire */ }

      const payrollDropped = (suites || []).some((s) => s.key === 'payroll') && !grantedSuites.some((s) => s.key === 'payroll');
      return json(res, 201, payrollDropped ? { ...profile, warning: 'Payroll can only be enabled from a Nigerian IP address — it was left out for this account.' } : profile);
    }

    // Bulk staff import — the "our staff list is in Excel" path. Takes rows
    // already parsed/mapped client-side, creates each account with a generated
    // temp password (returned ONCE for the admin to distribute; never stored
    // in plaintext anywhere), and reports per-row success/failure so a bad
    // row never sinks the rest. Same seat-credit economics as single create.
    if (action === 'bulk-create') {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return json(res, 400, { message: 'No rows to import.' });
      if (rows.length > 200) return json(res, 400, { message: 'Import at most 200 staff at a time.' });

      // Credits: check the FULL batch upfront so the admin isn't left with a
      // half-imported team and a surprise.
      if (caller.org_id !== FOUNDING_ORG_ID) {
        const { data: bal } = await admin.from('org_credit_balance').select('balance').eq('org_id', caller.org_id).maybeSingle();
        if (!bal || bal.balance < rows.length) {
          return json(res, 402, { message: `This import needs ${rows.length} seat credits — you have ${bal?.balance || 0}. Buy credits first.` });
        }
      }

      const { randomBytes } = await import('node:crypto');
      const tempPassword = () => randomBytes(9).toString('base64url').replace(/[-_]/g, 'x'); // 12 chars, no confusing symbols

      // Access in bulk follows the A+B decision (2026-07-30): a safe-floor
      // baseline + per-DEPARTMENT templates, and money/PII suites (HR,
      // Payroll, Finance, Benefits, Documents, Buying, Invoicing) can NEVER
      // be granted in bulk — those stay deliberate, person-by-person grants.
      // Bulk also can't mint admins and forces each suite's base role, so a
      // careless import can't hand 50 people manager-level anything.
      // Mirror of BULK_SAFE_SUITES in client/src/config/suites.js.
      const BULK_SAFE = new Set(['leave', 'tasks', 'visitors', 'attendance', 'projects', 'crm', 'inventory', 'it-assets']);
      const baseRoleOf = (key) => (key === 'visitors' ? 'staff' : 'member');
      const sanitizeBulk = (list) => {
        const seenKeys = new Set();
        return (Array.isArray(list) ? list : [])
          .filter((s) => s && BULK_SAFE.has(s.key) && !seenKeys.has(s.key) && seenKeys.add(s.key))
          .map((s) => ({ key: s.key, role: baseRoleOf(s.key) }));
      };
      const batchRole = ['staff', 'manager'].includes(body.role) ? body.role : 'staff';
      const baseline = sanitizeBulk(body.suites);
      // Department templates: match each row's department to the org's own
      // departments (owner-edited only — departments_admin_write is
      // super_admin-gated) and add that department's template suites.
      const { data: deptRows } = await admin.from('departments')
        .select('id, name, access_suites').eq('org_id', caller.org_id);
      const templateByName = new Map((deptRows || []).map((d) => [String(d.name).trim().toLowerCase(), sanitizeBulk(d.access_suites)]));
      // Resolve the CSV's department text to a real department_id. Without this
      // every imported staff member carries a name string and no id, which is
      // the fragile path: renaming a department then silently cuts them out of
      // their own chat room and access templates.
      const deptIdByName = new Map((deptRows || []).map((d) => [String(d.name).trim().toLowerCase(), d.id]));
      const deptIdForRow = (r) => deptIdByName.get(String(r.department || '').trim().toLowerCase()) ?? null;
      const suitesForRow = (r) => {
        const tpl = templateByName.get(String(r.department || '').trim().toLowerCase()) || [];
        const merged = [...baseline];
        for (const s of tpl) if (!merged.some((m) => m.key === s.key)) merged.push(s);
        return merged;
      };

      const results = [];
      const createdIds = [];
      for (const r of rows) {
        const name = String(r.name || '').trim();
        const email = String(r.email || '').trim().toLowerCase();
        if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          results.push({ name, email, error: !name ? 'Missing name' : 'Invalid email' });
          continue;
        }
        const password = tempPassword();
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { name },
        });
        if (cErr) {
          results.push({ name, email, error: /registered|exists/i.test(cErr.message) ? 'Already registered' : cErr.message });
          continue;
        }
        const { data: profile, error: pErr } = await admin.from('profiles').upsert({
          id: created.user.id, email, name, job_title: String(r.jobTitle || '').trim(),
          department: String(r.department || '').trim(), department_id: deptIdForRow(r), org_id: caller.org_id,
          role: batchRole, suites: suitesForRow(r), status: 'active', must_change_password: true,
        }, { onConflict: 'id' }).select().single();
        if (pErr) {
          await admin.auth.admin.deleteUser(created.user.id);
          results.push({ name, email, error: pErr.message });
          continue;
        }
        if (caller.org_id !== FOUNDING_ORG_ID) {
          await admin.from('org_credit_ledger').insert({
            org_id: caller.org_id, delta: -1, reason: 'staff_created', related_profile_id: profile.id, created_by: user.id,
          });
        }
        createdIds.push(profile.id);
        results.push({ name, email, tempPassword: password, user: profile });
      }

      // Hire automation for the whole batch: leave balances per person, ONE
      // summary onboarding task (not N), one feed event (not N bell pings).
      try {
        const okIds = createdIds;
        if (okIds.length) {
          const year = new Date().getFullYear();
          const { data: ltypes } = await admin.from('leave_types')
            .select('id').eq('org_id', caller.org_id).eq('active', true).eq('tracked', true);
          if (ltypes?.length) {
            const balanceRows = okIds.flatMap((uid) =>
              ltypes.map((t) => ({ user_id: uid, leave_type_id: t.id, year, org_id: caller.org_id })));
            await admin.from('leave_balances').upsert(balanceRows, { onConflict: 'user_id,leave_type_id,year', ignoreDuplicates: true });
          }
          await admin.from('tasks').insert({
            org_id: caller.org_id, created_by: user.id, assigned_to: user.id,
            title: `Onboard ${okIds.length} imported staff`,
            description: `You imported ${okIds.length} staff. For each: set salary & bank details (Payroll), assign equipment (IT Assets), enrol benefits, and share their temporary password securely.`,
            priority: 'high', due_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
          });
          await emitOrgEvent(admin, caller.org_id, 'hr.bulk_imported', { count: okIds.length }, user.id);
        }
      } catch { /* automation is a bonus */ }

      return json(res, 200, { results, created: createdIds.length, failed: results.length - createdIds.length });
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
      } else if (tx.type === 'renewal') {
        // reactivates + extends current_period_end by tx.months (never shortens)
        await admin.rpc('apply_confirmed_renewal', { p_tx_id: tx.id });
      }
      await logAudit('confirm_payment', tx.org_id, { transactionId, type: tx.type, amountKobo: tx.amount_kobo });
      await emitOrgEvent(admin, tx.org_id, 'payment.confirmed',
        { type: tx.type, amountKobo: tx.amount_kobo, reference: tx.reference, via: 'manual_confirm' }, user.id);
      return json(res, 200, { ok: true });
    }

    // Record a refund against a confirmed transaction. The money itself moves
    // in the Paystack dashboard / by bank transfer — this records it, claws
    // back credit-pack credits via a negative ledger entry, and audits it.
    // Deliberately does NOT touch org access: suspending stays a separate,
    // explicit action so a refund can never accidentally lock a workspace.
    if (action === 'refund-transaction') {
      await requirePlatformAdmin();
      const { transactionId, reason } = body;
      if (!reason?.trim()) return json(res, 400, { message: 'A refund reason is required.' });
      const { data: tx } = await admin.from('billing_transactions').select('*').eq('id', String(transactionId || '')).maybeSingle();
      if (!tx) return json(res, 404, { message: 'Transaction not found.' });
      if (tx.status !== 'confirmed') return json(res, 400, { message: `Only confirmed payments can be refunded (this one is ${tx.status}).` });

      const { error: updErr } = await admin.from('billing_transactions')
        .update({ status: 'refunded', refunded_at: new Date().toISOString(), refunded_by: user.id, refund_reason: reason.trim() })
        .eq('id', tx.id).eq('status', 'confirmed');
      if (updErr) return json(res, 400, { message: updErr.message });

      if (tx.type === 'credit_purchase' && tx.credits_granted > 0) {
        await admin.from('org_credit_ledger').insert({
          org_id: tx.org_id, delta: -tx.credits_granted, reason: 'refund_clawback',
          related_transaction_id: tx.id, created_by: user.id,
        });
      }
      await logAudit('refund_transaction', tx.org_id, { transactionId: tx.id, type: tx.type, amountKobo: tx.amount_kobo, reason: reason.trim() });
      await emitOrgEvent(admin, tx.org_id, 'payment.refunded',
        { type: tx.type, amountKobo: tx.amount_kobo, reference: tx.reference }, user.id);
      return json(res, 200, { ok: true });
    }

    if (action === 'delete-org') {
      await requirePlatformAdmin();

      const { orgId } = body;
      if (!orgId) return json(res, 400, { message: 'orgId is required.' });
      if (orgId === FOUNDING_ORG_ID) return json(res, 400, { message: 'Tenant #1 cannot be deleted.' });

      const { data: org } = await admin.from('organizations').select('name, slug').eq('id', orgId).maybeSingle();
      const { data: members } = await admin.from('profiles').select('id').eq('org_id', orgId);
      // The purge is a database function that walks EVERY public table with an
      // org_id column in FK-safe passes — a hand-list here rotted the moment
      // per-org seeded tables (paye_bands etc.) joined the schema, which is
      // how deleting an org started failing.
      const { data: rowsPurged, error: purgeErr } = await admin.rpc('platform_delete_org', { p_org: orgId });
      if (purgeErr) return json(res, 400, { message: purgeErr.message });
      // Auth accounts go through GoTrue's own API, never raw SQL — a raw
      // delete once left a dangling identity that poisoned signups.
      for (const m of members || []) {
        await admin.auth.admin.deleteUser(m.id).catch(() => {});
      }
      await logAudit('delete_org', null, { orgId, name: org?.name, slug: org?.slug, memberCount: members?.length || 0, rowsPurged });
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

      const { orgId, reason } = body;
      if (!orgId) return json(res, 400, { message: 'orgId is required.' });
      if (!reason || !String(reason).trim()) return json(res, 400, { message: 'A reason is required to enter a tenant workspace.' });
      const { data: org } = await admin.from('organizations').select('name, slug').eq('id', orgId).maybeSingle();
      if (!org) return json(res, 404, { message: 'Organization not found.' });

      // Never support-session into your OWN workspace.
      //
      // A support session is deliberately crippled: it carries a read-only
      // claim and every tenant table refuses its writes at the database level.
      // Pointed at the organisation the admin actually belongs to, that locks
      // them out of their own account — which is what happened. An invoice
      // would not delete, and the reason was invisible, because everything
      // looked normal apart from the writes silently failing.
      //
      // The button for this is hidden in the UI, but hiding a button is not a
      // rule. This is the rule.
      const { data: me } = await admin.from('profiles').select('org_id').eq('id', user.id).maybeSingle();
      if (me?.org_id && me.org_id === orgId) {
        return json(res, 400, {
          message: 'This is your own workspace — open it normally instead. Support mode is read-only and is only for looking at another organization.',
        });
      }

      // Never mint a tenant session. The support session keeps the admin's OWN
      // identity and carries a short-lived, read-only claim (see
      // custom_access_token_hook + my_org_id + the block_support_writes trigger).
      // Retire any still-open grant first so exactly one is ever live.
      await admin.from('support_grants').update({ consumed_at: new Date().toISOString() })
        .eq('admin_id', user.id).is('consumed_at', null);
      const { error: grantErr } = await admin.from('support_grants')
        .insert({ admin_id: user.id, tenant_id: orgId, reason: String(reason).trim() });
      if (grantErr) return json(res, 400, { message: grantErr.message });

      await logAudit('guest_mode', orgId, { reason: String(reason).trim() });
      return json(res, 200, { ok: true, orgId, orgName: org.name || 'this organization' });
    }

    if (action === 'end-guest') {
      await requirePlatformAdmin();
      await admin.from('support_grants').update({ consumed_at: new Date().toISOString() })
        .eq('admin_id', user.id).is('consumed_at', null);
      return json(res, 200, { ok: true });
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
      if (await rejectForeignTarget(id)) return;

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
      if (await rejectForeignTarget(id)) return;
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json(res, 400, { message: error.message });
      await admin.from('profiles').update({ must_change_password: true }).eq('id', id);
      return json(res, 200, { ok: true });
    }

    if (action === 'set-status') {
      const { id, status } = body;
      if (!['active', 'disabled'].includes(status)) return json(res, 400, { message: 'Invalid status.' });
      if (id === user.id) return json(res, 400, { message: 'You cannot change your own account status.' });
      if (await rejectForeignTarget(id)) return;
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
