// ---------------------------------------------------------------------------
// Real backend on Supabase. Implements the same endpoint contract the pages
// already call (apiGet('/me/suites'), apiPost('/users', ...), etc.) so nothing
// in the UI has to change. Auth + reads/edits go straight to Supabase under
// RLS; privileged ops (create user, reset password, enable/disable) go to the
// Vercel /api/admin function which holds the service key.
// ---------------------------------------------------------------------------
import { supabase } from '../lib/supabaseClient.js';
import { SUITES, MULTI_TENANT_SAFE_SUITES, suiteAllowedForCountry } from '../config/suites.js';

const fail = (status, message) => { const e = new Error(message); e.status = status; e.code = 'supabase'; throw e; };

// profiles row (snake_case) → the shape the UI expects (camelCase).
const toPublic = (p) => ({
  id: p.id,
  email: p.email,
  name: p.name,
  jobTitle: p.job_title || '',
  department: p.department || '',
  departmentId: p.department_id || null,
  role: p.role,
  suites: Array.isArray(p.suites) ? p.suites.map((s) => ({ key: s.key, role: s.role })) : [],
  status: p.status,
  mustChangePassword: p.must_change_password,
  lastLoginAt: p.last_login_at,
  phone: p.phone || '',
  whatsapp: p.whatsapp || '',
  avatarUrl: p.avatar_url || '',
  dateOfBirth: p.date_of_birth || '',
  address: p.address || '',
  emergencyContactName: p.emergency_contact_name || '',
  emergencyContactPhone: p.emergency_contact_phone || '',
  startDate: p.start_date || '',
  employmentType: p.employment_type || 'full_time',
  managerId: p.manager_id || null,
  probationEndDate: p.probation_end_date || '',
  confirmedAt: p.confirmed_at || null,
  stateOfResidence: p.state_of_residence || '',
});

async function myProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail(401, 'Authentication required.');
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error || !data) fail(401, 'No profile found for this account.');
  return data;
}

async function myOrg(orgId) {
  const { data, error } = await supabase.from('organizations')
    .select('id, name, slug, plan_tier, theme_color, logo_url, status, suites_enabled, website_type, external_website_url, country').eq('id', orgId).single();
  if (error || !data) fail(401, 'No organization found for this account.');
  return data;
}

const toPublicOrg = (o) => ({
  id: o.id, name: o.name, slug: o.slug, planTier: o.plan_tier, themeColor: o.theme_color, logoUrl: o.logo_url,
  status: o.status, suitesEnabled: o.suites_enabled, websiteType: o.website_type, externalWebsiteUrl: o.external_website_url || '',
  country: o.country || 'NG',
});

// RLS on platform_admins is `using (is_platform_admin())` — a non-admin's
// query just comes back empty (not an error), so this is safe to call for
// every user, not just real platform admins.
async function amIPlatformAdmin() {
  const { data } = await supabase.from('platform_admins').select('user_id').limit(1);
  return Boolean(data && data.length);
}

// HR-suite tables carry their own org_id (not derivable server-side on
// insert), so every write into them needs the caller's org_id attached.
async function myOrgId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail(401, 'Authentication required.');
  const { data, error } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  if (error || !data) fail(401, 'No profile found for this account.');
  return data.org_id;
}

// The real gate is server-side: enforce_phase1_suite_scope() (organizations.sql
// / hr_multitenancy.sql) strips any suite key not yet safe for multi-tenant use
// from a non-founding org's `suites` array on every write. This mirrors that
// whitelist client-side only to keep a super_admin's "all suites" view honest
// about what's actually usable — it is not itself a security boundary.
function tiles(profile, org) {
  const isFoundingOrg = org?.id === '00000000-0000-0000-0000-000000000001';
  return SUITES.map((s) => {
    const grant = (profile.suites || []).find((g) => g.key === s.key);
    const safeForOrg = (isFoundingOrg || MULTI_TENANT_SAFE_SUITES.includes(s.key)) && suiteAllowedForCountry(s.key, org?.country);
    const granted = (profile.role === 'super_admin' ? safeForOrg : Boolean(grant) && suiteAllowedForCountry(s.key, org?.country));
    return { ...s, granted, suiteRole: profile.role === 'super_admin' ? 'manager' : grant?.role || null, openable: granted && s.status === 'live' };
  });
}

// Call the privileged Vercel function with the caller's Supabase JWT.
async function callAdmin(action, payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) fail(401, 'Authentication required.');
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { fail(res.status, 'Admin service unavailable. Deploy the /api/admin function and set SUPABASE_SERVICE_KEY.'); }
  if (!res.ok) fail(res.status, data?.message || 'Admin request failed.');
  return data;
}

export async function supabaseApi(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const body = opts.body || {};
  const seg = path.split('?')[0].split('/').filter(Boolean);
  const head = `${method} /${seg[0] || ''}`;

  // ---- auth ----
  if (head === 'POST /auth' && seg[1] === 'login') {
    const { data, error } = await supabase.auth.signInWithPassword({ email: (body.email || '').trim(), password: body.password || '' });
    if (error) fail(401, /invalid/i.test(error.message) ? 'Incorrect email or password.' : error.message);
    const profile = await myProfile();
    if (profile.status !== 'active') { await supabase.auth.signOut(); fail(403, 'Your account has been disabled.'); }
    const org = await myOrg(profile.org_id);
    if (org.status !== 'active') {
      await supabase.auth.signOut();
      fail(403, org.status === 'suspended'
        ? 'Your free trial has ended (or a payment is overdue). Complete your activation payment to continue — WhatsApp us on 0814 812 8551.'
        : "Your organization's account is pending activation. We'll email you once your payment is confirmed.");
    }
    await supabase.rpc('touch_last_login');
    const isPlatformAdmin = await amIPlatformAdmin();
    return { accessToken: data.session.access_token, user: { ...toPublic(profile), org: toPublicOrg(org), isPlatformAdmin } };
  }
  if (head === 'POST /auth' && seg[1] === 'refresh') {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) fail(401, 'No active session.');
    const profile = await myProfile();
    if (profile.status !== 'active') { await supabase.auth.signOut(); fail(401, 'Account is inactive.'); }
    const org = await myOrg(profile.org_id);
    if (org.status !== 'active') { await supabase.auth.signOut(); fail(401, "Organization is pending activation."); }
    const isPlatformAdmin = await amIPlatformAdmin();
    return { accessToken: session.access_token, user: { ...toPublic(profile), org: toPublicOrg(org), isPlatformAdmin } };
  }
  if (head === 'POST /auth' && seg[1] === 'logout') { await supabase.auth.signOut(); return { ok: true }; }
  if (head === 'POST /auth' && seg[1] === 'forgot-password') {
    const email = String(body.email || '').toLowerCase().trim();
    // Always report success regardless of whether the address has an account —
    // revealing which emails exist is an enumeration leak. resetPasswordForEmail
    // is itself a silent no-op for unknown addresses. The link lands on our
    // public /reset-password route (must be whitelisted in Supabase Auth →
    // URL Configuration, or Supabase falls back to the Site URL).
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      try { await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }); } catch { /* never surface */ }
    }
    return { ok: true };
  }
  if (head === 'POST /auth' && seg[1] === 'change-password') {
    if (!body.newPassword || body.newPassword.length < 8) fail(400, 'New password must be at least 8 characters.');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) fail(401, 'Authentication required.');
    // Verify the current password before rotating it. Supabase has no
    // "check password" primitive, so re-authenticate: signInWithPassword just
    // refreshes the session for the same user on success (harmless) and errors
    // on a wrong password without touching the existing session.
    if (!body.currentPassword) fail(400, 'Enter your current password.');
    const { error: reauthErr } = await supabase.auth.signInWithPassword({ email: user.email, password: body.currentPassword });
    if (reauthErr) fail(400, 'Your current password is incorrect.');
    const { error } = await supabase.auth.updateUser({ password: body.newPassword });
    if (error) fail(400, error.message);
    await supabase.rpc('mark_password_changed');
    return { ok: true };
  }

  // ---- me / catalog ----
  if (head === 'GET /me' && !seg[1]) {
    const profile = await myProfile();
    const org = await myOrg(profile.org_id);
    const isPlatformAdmin = await amIPlatformAdmin();
    return { user: { ...toPublic(profile), org: toPublicOrg(org), isPlatformAdmin } };
  }
  if (head === 'PATCH /me' && !seg[1]) {
    const { phone, whatsapp, avatarUrl, dateOfBirth, address, emergencyContactName, emergencyContactPhone } = body;
    if (!phone || !phone.trim()) fail(400, 'Phone number is required.');
    const { error } = await supabase.rpc('update_my_profile', {
      p_phone:      phone.trim(),
      p_whatsapp:   (whatsapp || '').trim(),
      p_avatar_url: (avatarUrl || '').trim(),
      p_date_of_birth: dateOfBirth || null,
      p_address: address ?? null,
      p_ec_name: emergencyContactName ?? null,
      p_ec_phone: emergencyContactPhone ?? null,
    });
    if (error) fail(500, error.message);
    const profile2 = await myProfile();
    const org2 = await myOrg(profile2.org_id);
    const isPlatformAdmin2 = await amIPlatformAdmin();
    return { user: { ...toPublic(profile2), org: toPublicOrg(org2), isPlatformAdmin: isPlatformAdmin2 } };
  }
  if (head === 'GET /me' && seg[1] === 'suites') {
    const p = await myProfile();
    const org = await myOrg(p.org_id);
    return { suites: tiles(p, toPublicOrg(org)), isSystemAdmin: p.role === 'super_admin' };
  }
  if (head === 'GET /catalog') return { suites: SUITES };

  // ---- org notices (payment reminders etc — RLS scopes reads to own org) ----
  if (head === 'GET /me' && seg[1] === 'notices') {
    const { data, error } = await supabase.from('org_notices').select('*').is('dismissed_at', null).order('created_at', { ascending: false }).limit(3);
    if (error) fail(400, error.message);
    return { notices: data };
  }
  if (method === 'POST' && seg[0] === 'notices' && seg[2] === 'dismiss') {
    const { error } = await supabase.from('org_notices').update({ dismissed_at: new Date().toISOString() }).eq('id', seg[1]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  // ---- billing (org-scoped by RLS) ----
  if (head === 'GET /billing' && seg[1] === 'transactions') {
    const { data, error } = await supabase.from('billing_transactions').select('*').order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { transactions: data };
  }
  if (head === 'GET /billing' && seg[1] === 'balance') {
    const { data, error } = await supabase.from('org_credit_balance').select('balance').maybeSingle();
    if (error) fail(400, error.message);
    return { balance: data?.balance || 0 };
  }
  if (head === 'POST /billing' && seg[1] === 'purchase-credits') {
    return callAdmin('purchase-credits', { credits: body.credits });
  }

  // ---- platform admin (cross-org — RLS allows this only for is_platform_admin()) ----
  if (head === 'GET /platform' && seg[1] === 'organizations') {
    const { data, error } = await supabase.from('organizations').select('*').order('created_at', { ascending: false });
    if (error) fail(error.code === '42501' ? 403 : 400, error.message);
    return { organizations: data };
  }
  if (head === 'GET /platform' && seg[1] === 'profiles') {
    const { data, error } = await supabase.from('profiles').select('id, org_id, name, email, role, created_at, last_login_at').order('created_at', { ascending: false });
    if (error) fail(error.code === '42501' ? 403 : 400, error.message);
    return { profiles: data };
  }
  if (head === 'GET /platform' && seg[1] === 'transactions') {
    const { data, error } = await supabase.from('billing_transactions').select('*').order('created_at', { ascending: false });
    if (error) fail(error.code === '42501' ? 403 : 400, error.message);
    return { transactions: data };
  }
  if (head === 'POST /platform' && seg[1] === 'confirm-payment') {
    return callAdmin('confirm-org-payment', { transactionId: body.transactionId });
  }
  if (head === 'POST /platform' && seg[1] === 'delete-org') {
    return callAdmin('delete-org', { orgId: body.orgId });
  }
  if (head === 'POST /platform' && seg[1] === 'guest-mode') {
    return callAdmin('guest-mode', { orgId: body.orgId });
  }
  if (head === 'POST /platform' && seg[1] === 'payment-gateway') {
    return callAdmin('payment-gateway', { orgId: body.orgId, mode: body.mode, publicKey: body.publicKey, secretKey: body.secretKey, enabled: body.enabled });
  }
  if (head === 'POST /platform' && seg[1] === 'test-suite') {
    const { data, error } = await supabase.rpc('platform_admin_test_suite', { p_org_id: body.orgId, p_suite_key: body.suiteKey });
    if (error) fail(400, error.message);
    return { result: data };
  }
  if (head === 'GET /platform' && seg[1] === 'audit-log') {
    const { data, error } = await supabase.from('platform_admin_audit_log').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) fail(error.code === '42501' ? 403 : 400, error.message);
    return { entries: data };
  }
  if (head === 'GET /platform' && seg[1] === 'page-views') {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase.from('page_views').select('path, country, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(20000);
    if (error) fail(error.code === '42501' ? 403 : 400, error.message);
    return { pageViews: data };
  }
  // Promo codes + payment reminders — plain RLS writes: the promo_codes and
  // org_notices policies only admit is_platform_admin(), so no service-role
  // hop is needed for platform-admin CRUD here.
  if (head === 'GET /platform' && seg[1] === 'promo-codes') {
    const { data, error } = await supabase.from('promo_codes').select('*').order('created_at', { ascending: false });
    if (error) fail(error.code === '42501' ? 403 : 400, error.message);
    return { promoCodes: data };
  }
  if (head === 'POST /platform' && seg[1] === 'promo-codes') {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('promo_codes').insert({
      code: (body.code || '').trim().toUpperCase(),
      percent_off: body.percentOff,
      expires_at: body.expiresAt || null,
      max_uses: body.maxUses || null,
      trial_days: body.trialDays || null,
      grant_credits: body.grantCredits || 0,
      created_by: user?.id,
    }).select().single();
    if (error) fail(error.code === '23505' ? 409 : 400, error.code === '23505' ? 'That code already exists.' : error.message);
    return { promoCode: data };
  }
  if (method === 'PATCH' && seg[0] === 'platform' && seg[1] === 'promo-codes' && seg[2]) {
    const { data, error } = await supabase.from('promo_codes').update({ active: body.active }).eq('id', seg[2]).select().single();
    if (error) fail(400, error.message);
    return { promoCode: data };
  }
  if (head === 'GET /platform' && seg[1] === 'client-errors') {
    const { data, error } = await supabase.from('client_errors').select('*').order('occurred_at', { ascending: false }).limit(200);
    if (error) fail(error.code === '42501' ? 403 : 400, error.message);
    return { errors: data };
  }
  if (head === 'GET /platform' && seg[1] === 'contact-messages') {
    const { data, error } = await supabase.from('platform_contact_messages').select('*').order('created_at', { ascending: false }).limit(300);
    if (error) fail(error.code === '42501' ? 403 : 400, error.message);
    return { messages: data };
  }
  if (head === 'POST /platform' && seg[1] === 'contact-messages' && seg[3] === 'reply') {
    const { data, error } = await supabase.from('platform_contact_messages').update({ status: 'replied', replied_at: new Date().toISOString() }).eq('id', seg[2]).select().single();
    if (error) fail(400, error.message);
    return { message: data };
  }
  if (head === 'GET /platform' && seg[1] === 'sites') {
    const { data, error } = await supabase.from('org_sites').select('org_id, site_name, theme_key, published');
    if (error) fail(error.code === '42501' ? 403 : 400, error.message);
    return { sites: data };
  }
  if (head === 'GET /platform' && seg[1] === 'site-themes') {
    const { data, error } = await supabase.from('site_themes').select('*').order('sort_order');
    if (error) fail(400, error.message);
    return { themes: data };
  }
  if (head === 'GET /platform' && seg[1] === 'admin-ids') {
    // Which profiles are platform admins — used to keep them out of the
    // "signed-up users" numbers ("platform admin is not part of the users").
    const { data, error } = await supabase.from('platform_admins').select('user_id');
    if (error) fail(error.code === '42501' ? 403 : 400, error.message);
    return { adminIds: (data || []).map((r) => r.user_id) };
  }
  if (head === 'POST /platform' && seg[1] === 'remind-payment') {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('org_notices').insert({
      org_id: body.orgId, kind: 'payment_reminder', message: body.message, created_by: user?.id,
    });
    if (error) fail(400, error.message);
    return { ok: true };
  }

  // ---- public storefront checkout (anon) ----
  if (head === 'POST /site' && seg[1] === 'order') {
    const { data, error } = await supabase.rpc('public_place_order', {
      p_org_slug: body.orgSlug, p_name: body.name, p_phone: body.phone, p_email: body.email || '',
      p_address: body.address || '', p_note: body.note || '', p_method: body.method, p_items: body.items,
    });
    if (error) fail(400, error.message);
    return data;
  }

  // ---- status: public health-check history (unauthenticated, anon role) ----
  if (head === 'GET /status' && seg[1] === 'checks') {
    const { data, error } = await supabase.from('status_checks').select('*').order('checked_at', { ascending: false }).limit(500);
    if (error) fail(400, error.message);
    return { checks: data };
  }
  if (head === 'GET /status' && seg[1] === 'incidents') {
    const { data, error } = await supabase.from('status_incidents').select('*').order('started_at', { ascending: false }).limit(50);
    if (error) fail(400, error.message);
    return { incidents: data };
  }

  // ---- careers: public job board (unauthenticated, anon role) ----
  if (head === 'GET /careers' && seg[1] === 'org') {
    const { data, error } = await supabase.rpc('public_get_careers_org', { p_slug: seg[2] });
    if (error) fail(400, error.message);
    if (!data) fail(404, 'This company page could not be found.');
    return { org: data };
  }
  if (head === 'GET /careers' && seg[1] === 'postings' && seg.length === 3) {
    const { data, error } = await supabase.from('public_job_postings').select('*').eq('org_slug', seg[2]).order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { postings: data };
  }
  if (head === 'GET /careers' && seg[1] === 'postings' && seg.length === 4) {
    const { data, error } = await supabase.from('public_job_postings').select('*').eq('org_slug', seg[2]).eq('id', seg[3]).maybeSingle();
    if (error) fail(400, error.message);
    if (!data) fail(404, 'This role could not be found or is no longer accepting applications.');
    return { posting: data };
  }
  if (head === 'POST /careers' && seg[1] === 'apply') {
    const { requisitionId, name, email, phone, portfolioUrl, coverLetter, yearsExperience, expectedSalary, resumePath } = body;
    const { data, error } = await supabase.rpc('public_submit_application', {
      p_requisition_id: requisitionId, p_name: name, p_email: email, p_phone: phone || '',
      p_portfolio_url: portfolioUrl || '', p_cover_letter: coverLetter || '',
      p_years_experience: yearsExperience ?? null, p_expected_salary: expectedSalary ?? null,
      p_resume_path: resumePath || null,
    });
    if (error) fail(400, error.message);
    return { applicationId: data };
  }
  if (head === 'GET /departments') {
    const all = path.includes('all=true');
    let q = supabase.from('departments').select('id, name, code, active').order('name');
    if (!all) q = q.eq('active', true);
    const { data, error } = await q;
    if (error) fail(400, error.message);
    return { departments: data };
  }
  if (head === 'POST /departments') {
    const { name, code } = body;
    if (!name || !code) fail(400, 'Name and code are required.');
    const { data, error } = await supabase.from('departments').insert({ name: name.trim(), code: code.trim().toUpperCase(), org_id: await myOrgId() }).select().single();
    if (error) fail(400, error.code === '23505' ? 'Department code already exists.' : error.message);
    return { department: data };
  }
  if (method === 'PATCH' && seg[0] === 'departments' && seg.length === 2) {
    const patch = {};
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.code !== undefined) patch.code = body.code.trim().toUpperCase();
    const { data, error } = await supabase.from('departments').update(patch).eq('id', seg[1]).select().single();
    if (error) fail(400, error.code === '23505' ? 'Department code already exists.' : error.message);
    return { department: data };
  }
  if (method === 'PATCH' && seg[0] === 'departments' && seg[2] === 'status') {
    const { data, error } = await supabase.from('departments').update({ active: body.active }).eq('id', seg[1]).select().single();
    if (error) fail(400, error.message);
    return { department: data };
  }

  // ---- suite gating ----
  if (method === 'GET' && seg[0] === 'suites' && seg.length === 2) {
    const p = await myProfile();
    const meta = SUITES.find((s) => s.key === seg[1]);
    if (!meta) fail(404, 'Unknown suite.');
    const org = await myOrg(p.org_id);
    if (!suiteAllowedForCountry(seg[1], org.country)) fail(403, 'Payroll is only available to organizations registered in Nigeria.');
    const grant = (p.suites || []).find((g) => g.key === seg[1]);
    if (p.role !== 'super_admin' && !grant) fail(403, 'You have not been granted access to this suite.');
    return { suite: meta, access: { role: p.role === 'super_admin' ? 'manager' : grant?.role || 'member', enteredBy: p.email } };
  }

  // ---- admin: users ----
  if (head === 'GET /users') {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) fail(error.code === '42501' ? 403 : 400, error.message);
    return { users: data.map(toPublic) };
  }
  if (head === 'POST /users') {
    const created = await callAdmin('create', body);
    return { user: toPublic(created), warning: created.warning };
  }

  if (method === 'PATCH' && seg[0] === 'users' && seg.length === 2) {
    const patch = {};
    ['name', 'role'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
    if (body.jobTitle !== undefined) patch.job_title = body.jobTitle;
    if (body.department !== undefined) patch.department = body.department;
    if (body.departmentId !== undefined) patch.department_id = body.departmentId || null;
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', seg[1]).select().single();
    if (error) fail(400, error.message);
    return { user: toPublic(data) };
  }
  if (method === 'PUT' && seg[0] === 'users' && seg[2] === 'suites') {
    // Routed through /api/admin (not a direct RLS update) so a payroll grant
    // can be checked against the granting admin's real IP — see admin.js.
    const result = await callAdmin('grant-suites', { id: seg[1], suites: body.suites || [] });
    return { user: toPublic(result), warning: result.warning };
  }
  if (method === 'PATCH' && seg[0] === 'users' && seg[2] === 'status') {
    return { user: toPublic(await callAdmin('set-status', { id: seg[1], status: body.status })) };
  }
  if (method === 'POST' && seg[0] === 'users' && seg[2] === 'reset-password') {
    await callAdmin('reset-password', { id: seg[1], password: body.password });
    return { ok: true };
  }

  // ---- tasks ----
  const TASK_SELECT = '*, assignee:profiles!assigned_to(id,name,email), creator:profiles!created_by(id,name), dept:departments(id,name)';

  if (head === 'GET /tasks') {
    // GET /tasks/:id/reports
    if (seg.length === 3 && seg[2] === 'reports') {
      const { data, error } = await supabase.from('task_reports')
        .select('*, author:profiles!author_id(id,name,email)')
        .eq('task_id', seg[1]).order('created_at', { ascending: false });
      if (error) fail(400, error.message);
      return { reports: data };
    }
    const { data, error } = await supabase.from('tasks').select(TASK_SELECT).order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { tasks: data };
  }
  if (head === 'POST /tasks') {
    // POST /tasks/:id/reports
    if (seg.length === 3 && seg[2] === 'reports') {
      const { reportBody, attachments } = body;
      if (!reportBody?.trim()) fail(400, 'Report body is required.');
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('task_reports')
        .insert({ task_id: seg[1], author_id: user.id, body: reportBody.trim(), attachments: attachments || [], org_id: await myOrgId() })
        .select('*, author:profiles!author_id(id,name,email)').single();
      if (error) fail(400, error.message);
      return { report: data };
    }
    const { title, description, departmentId, assignedTo, priority, dueDate } = body;
    if (!title) fail(400, 'Title is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const row = { title, description: description || '', created_by: user.id, org_id: await myOrgId() };
    if (departmentId) row.department_id = departmentId;
    if (assignedTo)   row.assigned_to   = assignedTo;
    if (priority)     row.priority      = priority;
    if (dueDate)      row.due_date      = dueDate;
    const { data, error } = await supabase.from('tasks').insert(row).select(TASK_SELECT).single();
    if (error) fail(400, error.message);
    return { task: data };
  }
  if (method === 'PATCH' && seg[0] === 'tasks' && seg.length === 2) {
    const patch = {};
    ['title','description','priority','status'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
    if (body.dueDate      !== undefined) patch.due_date      = body.dueDate      || null;
    if (body.assignedTo   !== undefined) patch.assigned_to   = body.assignedTo   || null;
    if (body.departmentId !== undefined) patch.department_id = body.departmentId || null;
    const { data, error } = await supabase.from('tasks').update(patch).eq('id', seg[1]).select(TASK_SELECT).single();
    if (error) fail(400, error.message);
    return { task: data };
  }
  if (method === 'DELETE' && seg[0] === 'tasks' && seg.length === 2) {
    const { error } = await supabase.from('tasks').delete().eq('id', seg[1]);
    if (error) fail(400, error.message);
    return { ok: true };
  }
  // All task reports across dept (supervisor view)
  if (head === 'GET /taskreports') {
    const { data, error } = await supabase.from('task_reports')
      .select('*, author:profiles!author_id(id,name,email), task:tasks!task_id(id,title)')
      .order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { reports: data };
  }
  if (head === 'GET /taskstats') {
    const { data, error } = await supabase.rpc('get_task_stats');
    if (error) fail(400, error.message);
    return { stats: data };
  }
  if (head === 'GET /staff') {
    const { data, error } = await supabase.from('profiles').select('id, name, email, department_id').eq('status','active').order('name');
    if (error) fail(400, error.message);
    return { staff: data };
  }

  // ---- payroll ----
  if (head === 'GET /payroll' && seg[1] === 'employees') {
    const { data, error } = await supabase.from('profiles')
      .select('id, name, email, status, job_title, state_of_residence, dept:departments(id,name)')
      .eq('status', 'active').neq('role', 'super_admin').order('name');
    if (error) fail(400, error.message);
    return { employees: data.map((p) => ({ id: p.id, name: p.name, email: p.email, jobTitle: p.job_title || '', deptName: p.dept?.name || '', stateOfResidence: p.state_of_residence || '' })) };
  }
  if (method === 'PATCH' && seg[0] === 'payroll' && seg[1] === 'employees' && seg[3] === 'state') {
    const { data, error } = await supabase.rpc('payroll_set_state', { p_employee_id: seg[2], p_state: body.state || null });
    if (error) fail(400, error.message);
    return { user: toPublic(data) };
  }

  if (head === 'GET /payroll' && seg[1] === 'salary' && seg.length === 3) {
    const { data, error } = await supabase.from('salary_structures').select('*').eq('employee_id', seg[2]).order('effective_date', { ascending: false });
    if (error) fail(400, error.message);
    return { history: data };
  }
  // Correct a mis-entered structure (UI restricts this to the latest one so
  // history stays honest).
  if (method === 'PATCH' && seg[0] === 'payroll' && seg[1] === 'salary' && seg.length === 3) {
    const patch = {};
    ['basic','housing','transport'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
    if (body.otherAllowances !== undefined) patch.other_allowances = body.otherAllowances;
    if (body.effectiveDate !== undefined) patch.effective_date = body.effectiveDate;
    const { data, error } = await supabase.from('salary_structures').update(patch).eq('id', seg[2]).select().single();
    if (error) fail(400, error.message);
    return { structure: data };
  }
  if (head === 'POST /payroll' && seg[1] === 'salary') {
    const { employeeId, basic, housing, transport, otherAllowances, effectiveDate } = body;
    if (!employeeId) fail(400, 'employeeId is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('salary_structures').insert({
      employee_id: employeeId, basic: basic || 0, housing: housing || 0, transport: transport || 0,
      other_allowances: otherAllowances || 0, effective_date: effectiveDate || new Date().toISOString().slice(0, 10), created_by: user.id, org_id: await myOrgId(),
    }).select().single();
    if (error) fail(400, error.message);
    return { structure: data };
  }

  if (head === 'GET /payroll' && seg[1] === 'bank' && seg.length === 3) {
    const { data, error } = await supabase.from('bank_accounts').select('*').eq('employee_id', seg[2]).order('is_primary', { ascending: false });
    if (error) fail(400, error.message);
    return { accounts: data };
  }
  if (head === 'POST /payroll' && seg[1] === 'bank') {
    const { employeeId, bankName, bankCode, accountNumber, accountName, isPrimary } = body;
    if (!employeeId || !bankName || !accountNumber || !accountName) fail(400, 'Employee, bank, account number and account name are required.');
    const { data: { user } } = await supabase.auth.getUser();
    if (isPrimary !== false) await supabase.from('bank_accounts').update({ is_primary: false }).eq('employee_id', employeeId);
    const { data, error } = await supabase.from('bank_accounts').insert({
      employee_id: employeeId, bank_name: bankName, bank_code: bankCode || '', account_number: accountNumber,
      account_name: accountName, is_primary: isPrimary !== false, created_by: user.id, org_id: await myOrgId(),
    }).select().single();
    if (error) fail(400, error.message);
    return { account: data };
  }
  if (method === 'DELETE' && seg[0] === 'payroll' && seg[1] === 'bank' && seg.length === 3) {
    const { error } = await supabase.from('bank_accounts').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  if (head === 'GET /payroll' && seg[1] === 'runs' && seg.length === 2) {
    const { data, error } = await supabase.from('payroll_runs').select('*, approvedBy:profiles!approved_by(id,name)').order('period_year', { ascending: false }).order('period_month', { ascending: false });
    if (error) fail(400, error.message);
    return { runs: data };
  }
  if (head === 'POST /payroll' && seg[1] === 'runs' && seg[2] === 'generate') {
    const { month, year } = body;
    if (!month || !year) fail(400, 'Month and year are required.');
    const { data, error } = await supabase.rpc('generate_payroll_run', { p_month: month, p_year: year });
    if (error) fail(400, /unique/i.test(error.message) ? 'A payroll run already exists for that period.' : error.message);
    const { data: run, error: getErr } = await supabase.from('payroll_runs').select('*').eq('id', data).single();
    if (getErr) fail(400, getErr.message);
    return { run };
  }
  if (method === 'DELETE' && seg[0] === 'payroll' && seg[1] === 'runs' && seg.length === 3) {
    const { error } = await supabase.from('payroll_runs').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }
  if (method === 'PATCH' && seg[0] === 'payroll' && seg[1] === 'runs' && seg.length === 3) {
    const { action, reference, notes } = body;
    const { data: { user } } = await supabase.auth.getUser();
    let patch = {};
    if (action === 'approve')       patch = { status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() };
    else if (action === 'release')  patch = { status: 'released', released_at: new Date().toISOString() };
    else if (action === 'disburse') patch = { status: 'disbursed', disbursed_at: new Date().toISOString(), disbursement_reference: reference || '' };
    else if (action === 'reopen')   patch = { status: 'draft' };
    else if (notes !== undefined)   patch = { notes };
    else fail(400, 'Unknown action. Use: approve, release, disburse, reopen.');
    const { data, error } = await supabase.from('payroll_runs').update(patch).eq('id', seg[2]).select('*, approvedBy:profiles!approved_by(id,name)').single();
    if (error) fail(400, error.message);
    return { run: data };
  }

  const PAYROLL_LINE_SELECT = '*, employee:profiles!employee_id(id,name,email,job_title)';
  if (head === 'GET /payroll' && seg[1] === 'runs' && seg[3] === 'lines') {
    const { data, error } = await supabase.from('payroll_lines').select(PAYROLL_LINE_SELECT).eq('run_id', seg[2]).order('name', { foreignTable: 'employee' });
    if (error) fail(400, error.message);
    return { lines: data };
  }
  if (method === 'PATCH' && seg[0] === 'payroll' && seg[1] === 'lines' && seg.length === 3) {
    const patch = {};
    if (body.otherDeductions !== undefined) patch.other_deductions = body.otherDeductions || 0;
    if (body.paymentStatus !== undefined) patch.payment_status = body.paymentStatus;
    if (body.paymentNote !== undefined) patch.payment_note = body.paymentNote;
    if (patch.other_deductions !== undefined) {
      const { data: line } = await supabase.from('payroll_lines').select('gross, pension_employee, nhf, paye').eq('id', seg[2]).single();
      if (line) patch.net = line.gross - line.pension_employee - line.nhf - line.paye - patch.other_deductions;
    }
    const { data, error } = await supabase.from('payroll_lines').update(patch).eq('id', seg[2]).select(PAYROLL_LINE_SELECT).single();
    if (error) fail(400, error.message);
    return { line: data };
  }

  if (head === 'GET /payroll' && seg[1] === 'mypayslips') {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('payroll_lines')
      .select('*, run:payroll_runs!run_id(id,period_month,period_year,released_at)')
      .eq('employee_id', user.id).order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { payslips: data.filter((l) => l.run?.released_at) };
  }

  if (head === 'GET /payroll' && seg[1] === 'rates') {
    const { data: rates, error: rErr } = await supabase.from('deduction_rates').select('*').order('key');
    if (rErr) fail(400, rErr.message);
    const { data: bands, error: bErr } = await supabase.from('paye_bands').select('*').order('sort_order');
    if (bErr) fail(400, bErr.message);
    return { deductionRates: rates, payeBands: bands };
  }
  if (method === 'PATCH' && seg[0] === 'payroll' && seg[1] === 'rates' && seg.length === 3) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('deduction_rates')
      .update({ rate: body.rate, updated_at: new Date().toISOString(), updated_by: user.id })
      .eq('key', seg[2]).select().single();
    if (error) fail(400, error.message);
    return { rate: data };
  }
  if (method === 'PATCH' && seg[0] === 'payroll' && seg[1] === 'paye-bands' && seg.length === 3) {
    const patch = {};
    ['minAnnual','maxAnnual','rate'].forEach((k) => {
      const col = { minAnnual: 'min_annual', maxAnnual: 'max_annual' }[k] || k;
      if (body[k] !== undefined) patch[col] = body[k];
    });
    const { data, error } = await supabase.from('paye_bands').update(patch).eq('id', seg[2]).select().single();
    if (error) fail(400, error.message);
    return { band: data };
  }

  if (head === 'GET /payroll' && seg[1] === 'bankwall') {
    const { data, error } = await supabase.from('payroll_bank_actions')
      .select('*, employee:profiles!employee_id(id,name,email), run:payroll_runs!payroll_run_id(id,period_month,period_year), actionedBy:profiles!actioned_by(id,name)')
      .order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { actions: data };
  }
  if (method === 'PATCH' && seg[0] === 'payroll' && seg[1] === 'bankwall' && seg.length === 3) {
    const { data, error } = await supabase.rpc('mark_bank_action', { p_id: seg[2], p_status: body.status });
    if (error) fail(400, error.message);
    return { action: data };
  }

  // ---- hr (employee directory + org structure) ----
  if (head === 'GET /hr' && seg[1] === 'staff') {
    const { data, error } = await supabase.from('profiles')
      .select('*, dept:departments(id,name), manager:profiles!manager_id(id,name,email,job_title)')
      .neq('role', 'super_admin').order('name');
    if (error) fail(400, error.message);
    return { staff: data.map((p) => ({ ...toPublic(p), deptName: p.dept?.name || p.department || '', manager: p.manager ? { id: p.manager.id, name: p.manager.name, email: p.manager.email } : null })) };
  }
  if (method === 'PATCH' && seg[0] === 'hr' && seg[1] === 'staff' && seg.length === 3) {
    const { jobTitle, departmentId, managerId, startDate, employmentType } = body;
    const { data, error } = await supabase.rpc('hr_update_employee', {
      p_user_id:         seg[2],
      p_job_title:       jobTitle ?? null,
      p_department_id:   departmentId ?? null,
      p_manager_id:      managerId || null,
      p_start_date:      startDate || null,
      p_employment_type: employmentType || null,
    });
    if (error) fail(400, error.message);
    return { user: toPublic(data) };
  }

  // ---- hr: recruitment ----
  const REQ_SELECT = '*, dept:departments(id,name), hiringManager:profiles!hiring_manager_id(id,name,email)';
  const APP_SELECT = '*, candidate:candidates(id,name,email,phone,resume_path,source,notes), hiredProfile:profiles!hired_profile_id(id,name)';
  const INTERVIEW_SELECT = '*, interviewer:profiles!interviewer_id(id,name,email)';

  if (head === 'GET /hr' && seg[1] === 'requisitions' && seg.length === 2) {
    const { data, error } = await supabase.from('job_requisitions').select(REQ_SELECT).order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { requisitions: data };
  }
  if (head === 'POST /hr' && seg[1] === 'requisitions' && seg.length === 2) {
    const { title, departmentId, hiringManagerId, headcount, employmentType, location, description, status, minExperienceYears, salaryMin, salaryMax } = body;
    if (!title?.trim()) fail(400, 'Title is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const orgId = await myOrgId();
    const { data, error } = await supabase.from('job_requisitions').insert({
      title: title.trim(), department_id: departmentId || null, hiring_manager_id: hiringManagerId || null,
      headcount: headcount || 1, employment_type: employmentType || 'full_time', location: location || '',
      description: description || '', status: status || 'draft', created_by: user.id, org_id: orgId,
      min_experience_years: minExperienceYears || null, salary_min: salaryMin || null, salary_max: salaryMax || null,
    }).select(REQ_SELECT).single();
    if (error) fail(400, error.message);
    return { requisition: data };
  }
  if (method === 'PATCH' && seg[0] === 'hr' && seg[1] === 'requisitions' && seg.length === 3) {
    const patch = {};
    ['title','location','description','status','employmentType','headcount'].forEach((k) => {
      const col = { employmentType: 'employment_type' }[k] || k;
      if (body[k] !== undefined) patch[col] = body[k];
    });
    if (body.departmentId !== undefined)      patch.department_id       = body.departmentId || null;
    if (body.hiringManagerId !== undefined)   patch.hiring_manager_id   = body.hiringManagerId || null;
    if (body.minExperienceYears !== undefined) patch.min_experience_years = body.minExperienceYears || null;
    if (body.salaryMin !== undefined)          patch.salary_min           = body.salaryMin || null;
    if (body.salaryMax !== undefined)          patch.salary_max           = body.salaryMax || null;
    const { data, error } = await supabase.from('job_requisitions').update(patch).eq('id', seg[2]).select(REQ_SELECT).single();
    if (error) fail(400, error.message);
    return { requisition: data };
  }
  if (method === 'DELETE' && seg[0] === 'hr' && seg[1] === 'requisitions' && seg.length === 3) {
    const { error } = await supabase.from('job_requisitions').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  if (head === 'GET /hr' && seg[1] === 'requisitions' && seg[3] === 'pipeline') {
    const { data, error } = await supabase.from('applications').select(APP_SELECT).eq('requisition_id', seg[2]).order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { applications: data };
  }
  if (head === 'POST /hr' && seg[1] === 'requisitions' && seg[3] === 'pipeline') {
    const { name, email, phone, source, notes, resumePath } = body;
    if (!name?.trim() || !email?.trim()) fail(400, 'Candidate name and email are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const orgId = await myOrgId();
    const { data: candidate, error: candErr } = await supabase.from('candidates').insert({
      name: name.trim(), email: email.trim(), phone: phone || '', source: source || 'other',
      notes: notes || '', resume_path: resumePath || null, created_by: user.id, org_id: orgId,
    }).select().single();
    if (candErr) fail(400, candErr.message);
    const { data, error } = await supabase.from('applications').insert({
      requisition_id: seg[2], candidate_id: candidate.id, created_by: user.id, org_id: orgId,
    }).select(APP_SELECT).single();
    if (error) fail(400, error.message);
    return { application: data };
  }
  if (method === 'PATCH' && seg[0] === 'hr' && seg[1] === 'candidates' && seg.length === 3) {
    const patch = {};
    ['name','email','phone','source','notes'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
    if (body.resumePath !== undefined) patch.resume_path = body.resumePath || null;
    const { data, error } = await supabase.from('candidates').update(patch).eq('id', seg[2]).select().single();
    if (error) fail(400, error.message);
    return { candidate: data };
  }
  if (method === 'PATCH' && seg[0] === 'hr' && seg[1] === 'applications' && seg.length === 3) {
    const patch = {};
    ['stage','rating','rejectionReason','offerSalary','offerStartDate','offerStatus','offerNote','offerSentAt','hiredProfileId'].forEach((k) => {
      const col = { rejectionReason: 'rejection_reason', offerSalary: 'offer_salary', offerStartDate: 'offer_start_date', offerStatus: 'offer_status', offerNote: 'offer_note', offerSentAt: 'offer_sent_at', hiredProfileId: 'hired_profile_id' }[k] || k;
      if (body[k] !== undefined) patch[col] = body[k] || null;
    });
    const { data, error } = await supabase.from('applications').update(patch).eq('id', seg[2]).select(APP_SELECT).single();
    if (error) fail(400, error.message);
    return { application: data };
  }
  if (method === 'DELETE' && seg[0] === 'hr' && seg[1] === 'applications' && seg.length === 3) {
    const { error } = await supabase.from('applications').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  if (head === 'GET /hr' && seg[1] === 'applications' && seg[3] === 'interviews') {
    const { data, error } = await supabase.from('interviews').select(INTERVIEW_SELECT).eq('application_id', seg[2]).order('scheduled_at', { ascending: false });
    if (error) fail(400, error.message);
    return { interviews: data };
  }
  if (head === 'POST /hr' && seg[1] === 'applications' && seg[3] === 'interviews') {
    const { scheduledAt, interviewerId, mode } = body;
    if (!scheduledAt || !interviewerId) fail(400, 'Scheduled time and interviewer are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('interviews').insert({
      application_id: seg[2], scheduled_at: scheduledAt, interviewer_id: interviewerId, mode: mode || 'video', created_by: user.id, org_id: await myOrgId(),
    }).select(INTERVIEW_SELECT).single();
    if (error) fail(400, error.message);
    return { interview: data };
  }
  if (method === 'PATCH' && seg[0] === 'hr' && seg[1] === 'interviews' && seg.length === 3) {
    const patch = {};
    ['outcome','feedback','mode','scorecard'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
    if (body.scheduledAt !== undefined) patch.scheduled_at = body.scheduledAt;
    const { data, error } = await supabase.from('interviews').update(patch).eq('id', seg[2]).select(INTERVIEW_SELECT).single();
    if (error) fail(400, error.message);
    return { interview: data };
  }
  if (head === 'GET /hr' && seg[1] === 'myinterviews') {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('interviews')
      .select(`${INTERVIEW_SELECT}, application:applications(id,candidate:candidates(id,name), requisition:job_requisitions(id,title))`)
      .eq('interviewer_id', user.id).order('scheduled_at', { ascending: true });
    if (error) fail(400, error.message);
    return { interviews: data };
  }

  // ---- hr: performance & growth ----
  const withEmployeeFilter = (q, path) => {
    const employeeId = (path.match(/employeeId=([^&]*)/) || [])[1];
    return employeeId ? q.eq('employee_id', employeeId) : q;
  };

  if (head === 'GET /hr' && seg[1] === 'goals') {
    let q = supabase.from('goals').select('*, employee:profiles!employee_id(id,name)').order('created_at', { ascending: false });
    const { data, error } = await withEmployeeFilter(q, path);
    if (error) fail(400, error.message);
    return { goals: data };
  }
  if (head === 'POST /hr' && seg[1] === 'goals') {
    const { employeeId, title, description, targetDate } = body;
    if (!employeeId || !title?.trim()) fail(400, 'Employee and title are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('goals').insert({
      employee_id: employeeId, title: title.trim(), description: description || '', target_date: targetDate || null, created_by: user.id, org_id: await myOrgId(),
    }).select('*, employee:profiles!employee_id(id,name)').single();
    if (error) fail(400, error.message);
    return { goal: data };
  }
  if (method === 'PATCH' && seg[0] === 'hr' && seg[1] === 'goals' && seg.length === 3) {
    const patch = {};
    ['title','description','status'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
    if (body.targetDate !== undefined) patch.target_date = body.targetDate || null;
    const { data, error } = await supabase.from('goals').update(patch).eq('id', seg[2]).select('*, employee:profiles!employee_id(id,name)').single();
    if (error) fail(400, error.message);
    return { goal: data };
  }
  if (method === 'DELETE' && seg[0] === 'hr' && seg[1] === 'goals' && seg.length === 3) {
    const { error } = await supabase.from('goals').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  if (head === 'GET /hr' && seg[1] === 'reviews') {
    let q = supabase.from('performance_reviews').select('*, employee:profiles!employee_id(id,name), reviewer:profiles!reviewer_id(id,name)').order('created_at', { ascending: false });
    const { data, error } = await withEmployeeFilter(q, path);
    if (error) fail(400, error.message);
    return { reviews: data };
  }
  if (head === 'POST /hr' && seg[1] === 'reviews') {
    const { employeeId, cycleLabel } = body;
    if (!employeeId || !cycleLabel?.trim()) fail(400, 'Employee and cycle label are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('performance_reviews').insert({
      employee_id: employeeId, reviewer_id: user.id, cycle_label: cycleLabel.trim(), org_id: await myOrgId(),
    }).select('*, employee:profiles!employee_id(id,name), reviewer:profiles!reviewer_id(id,name)').single();
    if (error) fail(400, error.message);
    return { review: data };
  }
  if (method === 'PATCH' && seg[0] === 'hr' && seg[1] === 'reviews' && seg.length === 3) {
    const patch = {};
    ['rating','strengths','improvements','status'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
    const { data, error } = await supabase.from('performance_reviews').update(patch).eq('id', seg[2]).select('*, employee:profiles!employee_id(id,name), reviewer:profiles!reviewer_id(id,name)').single();
    if (error) fail(400, error.message);
    return { review: data };
  }
  if (head === 'POST /hr' && seg[1] === 'reviews' && seg[3] === 'acknowledge') {
    const { error } = await supabase.rpc('acknowledge_review', { p_review_id: seg[2] });
    if (error) fail(400, error.message);
    const { data, error: getErr } = await supabase.from('performance_reviews').select('*, employee:profiles!employee_id(id,name), reviewer:profiles!reviewer_id(id,name)').eq('id', seg[2]).single();
    if (getErr) fail(400, getErr.message);
    return { review: data };
  }

  if (head === 'GET /hr' && seg[1] === 'trainings') {
    let q = supabase.from('trainings').select('*, employee:profiles!employee_id(id,name)').order('completed_date', { ascending: false });
    const { data, error } = await withEmployeeFilter(q, path);
    if (error) fail(400, error.message);
    return { trainings: data };
  }
  if (head === 'POST /hr' && seg[1] === 'trainings') {
    const { employeeId, title, provider, completedDate, certificateExpiry } = body;
    if (!employeeId || !title?.trim()) fail(400, 'Employee and title are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('trainings').insert({
      employee_id: employeeId, title: title.trim(), provider: provider || '', completed_date: completedDate || null,
      certificate_expiry: certificateExpiry || null, created_by: user.id, org_id: await myOrgId(),
    }).select('*, employee:profiles!employee_id(id,name)').single();
    if (error) fail(400, error.message);
    return { training: data };
  }
  if (method === 'DELETE' && seg[0] === 'hr' && seg[1] === 'trainings' && seg.length === 3) {
    const { error } = await supabase.from('trainings').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  // ---- hr: compliance & case management ----
  if (head === 'GET /hr' && seg[1] === 'documents') {
    let q = supabase.from('employee_documents').select('*, employee:profiles!employee_id(id,name)').order('created_at', { ascending: false });
    const { data, error } = await withEmployeeFilter(q, path);
    if (error) fail(400, error.message);
    return { documents: data };
  }
  if (head === 'POST /hr' && seg[1] === 'documents') {
    const { employeeId, title, category, filePath, expiryDate } = body;
    if (!employeeId || !title?.trim() || !filePath) fail(400, 'Employee, title and file are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('employee_documents').insert({
      employee_id: employeeId, title: title.trim(), category: category || 'other', file_path: filePath,
      expiry_date: expiryDate || null, uploaded_by: user.id, org_id: await myOrgId(),
    }).select('*, employee:profiles!employee_id(id,name)').single();
    if (error) fail(400, error.message);
    return { document: data };
  }
  if (method === 'DELETE' && seg[0] === 'hr' && seg[1] === 'documents' && seg.length === 3) {
    const { error } = await supabase.from('employee_documents').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  if (head === 'GET /hr' && seg[1] === 'cases') {
    const { data, error } = await supabase.from('disciplinary_cases').select('*, employee:profiles!employee_id(id,name), openedBy:profiles!opened_by(id,name)').order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { cases: data };
  }
  if (head === 'POST /hr' && seg[1] === 'cases') {
    const { employeeId, category, description } = body;
    if (!employeeId || !description?.trim()) fail(400, 'Employee and description are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('disciplinary_cases').insert({
      employee_id: employeeId, opened_by: user.id, category: category || 'other', description: description.trim(), org_id: await myOrgId(),
    }).select('*, employee:profiles!employee_id(id,name), openedBy:profiles!opened_by(id,name)').single();
    if (error) fail(400, error.message);
    return { case: data };
  }
  if (method === 'PATCH' && seg[0] === 'hr' && seg[1] === 'cases' && seg.length === 3) {
    const patch = {};
    ['category','description','resolutionNotes','responseNote','outcome','queryLetterId','outcomeLetterId'].forEach((k) => {
      const col = { resolutionNotes: 'resolution_notes', responseNote: 'response_note', queryLetterId: 'query_letter_id', outcomeLetterId: 'outcome_letter_id' }[k] || k;
      if (body[k] !== undefined) patch[col] = body[k];
    });
    if (body.responseNote !== undefined) patch.response_at = new Date().toISOString();
    if (body.status !== undefined) { patch.status = body.status; if (body.status === 'resolved') patch.resolved_at = new Date().toISOString(); }
    const { data, error } = await supabase.from('disciplinary_cases').update(patch).eq('id', seg[2]).select('*, employee:profiles!employee_id(id,name), openedBy:profiles!opened_by(id,name)').single();
    if (error) fail(400, error.message);
    return { case: data };
  }

  // ---- hr: self-service letter requests ----
  if (head === 'GET /hr' && seg[1] === 'letters') {
    const { data, error } = await supabase.from('letter_requests').select('*, employee:profiles!employee_id(id,name,email)').order('requested_at', { ascending: false });
    if (error) fail(400, error.message);
    return { letters: data };
  }
  if (head === 'POST /hr' && seg[1] === 'letters') {
    const { letterType, purpose } = body;
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('letter_requests').insert({
      employee_id: user.id, letter_type: letterType || 'employment_verification', purpose: purpose || '', org_id: await myOrgId(),
    }).select('*, employee:profiles!employee_id(id,name,email)').single();
    if (error) fail(400, error.message);
    return { letter: data };
  }
  if (method === 'PATCH' && seg[0] === 'hr' && seg[1] === 'letters' && seg.length === 3) {
    const { status, declineReason, issuedFilePath } = body;
    const { data: { user } } = await supabase.auth.getUser();
    const patch = { status, decided_by: user.id, decided_at: new Date().toISOString() };
    if (declineReason !== undefined) patch.decline_reason = declineReason;
    if (issuedFilePath !== undefined) patch.issued_file_path = issuedFilePath;
    const { data, error } = await supabase.from('letter_requests').update(patch).eq('id', seg[2]).select('*, employee:profiles!employee_id(id,name,email)').single();
    if (error) fail(400, error.message);
    return { letter: data };
  }

  // ---- hr: letters engine (letterheads + issued letters) ----
  if (head === 'GET /hr' && seg[1] === 'letterheads') {
    const { data, error } = await supabase.from('hr_letterheads').select('*').order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { letterheads: data };
  }
  if (head === 'POST /hr' && seg[1] === 'letterheads') {
    const { name, mode, templateKey, details, filePath, isDefault } = body;
    const { data: { user } } = await supabase.auth.getUser();
    const orgId = await myOrgId();
    if (isDefault !== false) await supabase.from('hr_letterheads').update({ is_default: false }).eq('org_id', orgId);
    const { data, error } = await supabase.from('hr_letterheads').insert({
      org_id: orgId, name: name || 'Company letterhead', mode: mode || 'generated',
      template_key: templateKey || 'classic', details: details || {}, file_path: filePath || null,
      is_default: isDefault !== false, created_by: user.id,
    }).select().single();
    if (error) fail(400, error.message);
    return { letterhead: data };
  }
  if (method === 'PATCH' && seg[0] === 'hr' && seg[1] === 'letterheads' && seg.length === 3) {
    const { name, mode, templateKey, details, filePath, isDefault } = body;
    const patch = { updated_at: new Date().toISOString() };
    if (name !== undefined) patch.name = name;
    if (mode !== undefined) patch.mode = mode;
    if (templateKey !== undefined) patch.template_key = templateKey;
    if (details !== undefined) patch.details = details;
    if (filePath !== undefined) patch.file_path = filePath;
    if (isDefault === true) {
      const orgId = await myOrgId();
      await supabase.from('hr_letterheads').update({ is_default: false }).eq('org_id', orgId);
      patch.is_default = true;
    }
    const { data, error } = await supabase.from('hr_letterheads').update(patch).eq('id', seg[2]).select().single();
    if (error) fail(400, error.message);
    return { letterhead: data };
  }
  if (method === 'DELETE' && seg[0] === 'hr' && seg[1] === 'letterheads' && seg.length === 3) {
    const { error } = await supabase.from('hr_letterheads').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }
  if (head === 'GET /hr' && seg[1] === 'issued-letters') {
    const { data, error } = await supabase.from('hr_letters')
      .select('*, employee:profiles!employee_id(id,name,email), issuedBy:profiles!issued_by(id,name)')
      .order('issued_at', { ascending: false });
    if (error) fail(400, error.message);
    return { letters: data };
  }
  if (head === 'POST /hr' && seg[1] === 'issued-letters') {
    const { employeeId, letterType, title, letterBody, letterheadId, requestId, filePath } = body;
    if (!employeeId || !title?.trim() || !letterBody?.trim()) fail(400, 'Employee, title and letter body are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('hr_letters').insert({
      org_id: await myOrgId(), employee_id: employeeId, letter_type: letterType || 'custom',
      title: title.trim(), body: letterBody, letterhead_id: letterheadId || null,
      request_id: requestId || null, file_path: filePath || null, issued_by: user.id,
    }).select('*, employee:profiles!employee_id(id,name,email), issuedBy:profiles!issued_by(id,name)').single();
    if (error) fail(400, error.message);
    return { letter: data };
  }

  // ---- hr: onboarding / offboarding ----
  if (head === 'GET /hr' && seg[1] === 'templates') {
    const phase = (path.match(/phase=([^&]*)/) || [])[1];
    let q = supabase.from('lifecycle_task_templates').select('*').eq('active', true).order('sort_order');
    if (phase) q = q.eq('phase', phase);
    const { data, error } = await q;
    if (error) fail(400, error.message);
    return { templates: data };
  }
  if (head === 'GET /hr' && seg[1] === 'lifecycle-tasks' && seg.length === 2) {
    const employeeId = (path.match(/employeeId=([^&]*)/) || [])[1];
    const phase = (path.match(/phase=([^&]*)/) || [])[1];
    let q = supabase.from('lifecycle_tasks').select('*, completedBy:profiles!completed_by(id,name)').order('due_date');
    if (employeeId) q = q.eq('employee_id', employeeId);
    if (phase) q = q.eq('phase', phase);
    const { data, error } = await q;
    if (error) fail(400, error.message);
    return { tasks: data };
  }
  if (method === 'PATCH' && seg[0] === 'hr' && seg[1] === 'lifecycle-tasks' && seg.length === 3) {
    const { data: { user } } = await supabase.auth.getUser();
    const patch = {};
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.status === 'done') { patch.status = 'done'; patch.completed_by = user.id; patch.completed_at = new Date().toISOString(); }
    else if (body.status === 'pending') { patch.status = 'pending'; patch.completed_by = null; patch.completed_at = null; }
    const { data, error } = await supabase.from('lifecycle_tasks').update(patch).eq('id', seg[2]).select('*, completedBy:profiles!completed_by(id,name)').single();
    if (error) fail(400, error.message);
    return { task: data };
  }
  if (head === 'POST /hr' && seg[1] === 'onboarding' && seg[2] === 'generate') {
    const { employeeId } = body;
    if (!employeeId) fail(400, 'employeeId is required.');
    const { data: emp, error: empErr } = await supabase.from('profiles').select('id, start_date').eq('id', employeeId).single();
    if (empErr) fail(400, empErr.message);
    if (!emp.start_date) fail(400, "Set the employee's start date before generating onboarding tasks.");
    const { data: templates, error: tplErr } = await supabase.from('lifecycle_task_templates')
      .select('*').eq('phase', 'onboarding').eq('active', true).order('sort_order');
    if (tplErr) fail(400, tplErr.message);
    const start = new Date(emp.start_date + 'T00:00:00');
    const onbOrgId = await myOrgId();
    const rows = templates.map((t) => {
      const due = new Date(start); due.setDate(due.getDate() + t.offset_days);
      return { employee_id: employeeId, phase: 'onboarding', title: t.title, category: t.category, due_date: due.toISOString().slice(0, 10), org_id: onbOrgId };
    });
    const { data, error } = await supabase.from('lifecycle_tasks').insert(rows).select('*, completedBy:profiles!completed_by(id,name)');
    if (error) fail(400, error.message);
    return { tasks: data };
  }
  if (method === 'PATCH' && seg[0] === 'hr' && seg[1] === 'employees' && seg[3] === 'probation') {
    const { data, error } = await supabase.rpc('hr_set_probation', { p_employee_id: seg[2], p_probation_end_date: body.probationEndDate || null });
    if (error) fail(400, error.message);
    return { user: toPublic(data) };
  }
  if (head === 'POST /hr' && seg[1] === 'employees' && seg[3] === 'confirm') {
    const { data, error } = await supabase.rpc('hr_confirm_employee', { p_employee_id: seg[2] });
    if (error) fail(400, error.message);
    return { user: toPublic(data) };
  }

  const EXIT_SELECT = '*, employee:profiles!employee_id(id,name,email), initiatedBy:profiles!initiated_by(id,name)';
  if (head === 'GET /hr' && seg[1] === 'exits' && seg.length === 2) {
    const { data, error } = await supabase.from('exit_records').select(EXIT_SELECT).order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { exits: data };
  }
  if (head === 'POST /hr' && seg[1] === 'exits' && seg.length === 2) {
    const { employeeId, reason, reasonNotes, lastWorkingDay } = body;
    if (!employeeId || !reason || !lastWorkingDay) fail(400, 'Employee, reason and last working day are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const exitOrgId = await myOrgId();
    const { data: exitRow, error } = await supabase.from('exit_records').insert({
      employee_id: employeeId, initiated_by: user.id, reason, reason_notes: reasonNotes || '', last_working_day: lastWorkingDay, org_id: exitOrgId,
    }).select(EXIT_SELECT).single();
    if (error) fail(400, error.message);
    const { data: templates } = await supabase.from('lifecycle_task_templates')
      .select('*').eq('phase', 'offboarding').eq('active', true).order('sort_order');
    if (templates?.length) {
      const lwd = new Date(lastWorkingDay + 'T00:00:00');
      const rows = templates.map((t) => {
        const due = new Date(lwd); due.setDate(due.getDate() + t.offset_days);
        return { employee_id: employeeId, phase: 'offboarding', exit_id: exitRow.id, title: t.title, category: t.category, due_date: due.toISOString().slice(0, 10), org_id: exitOrgId };
      });
      await supabase.from('lifecycle_tasks').insert(rows);
    }
    return { exit: exitRow };
  }
  if (method === 'PATCH' && seg[0] === 'hr' && seg[1] === 'exits' && seg.length === 3) {
    const patch = {};
    ['status','unusedLeaveDays','exitInterviewNotes','rehireEligible','reasonNotes'].forEach((k) => {
      const col = { unusedLeaveDays: 'unused_leave_days', exitInterviewNotes: 'exit_interview_notes', rehireEligible: 'rehire_eligible', reasonNotes: 'reason_notes' }[k] || k;
      if (body[k] !== undefined) patch[col] = body[k];
    });
    const { data, error } = await supabase.from('exit_records').update(patch).eq('id', seg[2]).select(EXIT_SELECT).single();
    if (error) fail(400, error.message);
    return { exit: data };
  }
  if (head === 'POST /hr' && seg[1] === 'exits' && seg[3] === 'finalize') {
    const { error } = await supabase.rpc('hr_finalize_exit', { p_exit_id: seg[2] });
    if (error) fail(400, error.message);
    const { data, error: getErr } = await supabase.from('exit_records').select(EXIT_SELECT).eq('id', seg[2]).single();
    if (getErr) fail(400, getErr.message);
    return { exit: data };
  }

  // ---- visitors (person records) ----
  if (head === 'GET /visitors') {
    let q = supabase.from('visitors').select('*').order('name');
    if (path.includes('banned=true')) { q = q.eq('is_banned', true); }
    else if (body.q || path.includes('q=')) {
      const term = body.q || decodeURIComponent((path.match(/q=([^&]*)/) || [])[1] || '');
      if (term) q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
    }
    const { data, error } = await q;
    if (error) fail(400, error.message);
    return { visitors: data };
  }
  if (head === 'POST /visitors') {
    const { name, company, phone, email, idType, idNumber } = body;
    if (!name || !phone) fail(400, 'Name and phone are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('visitors').insert({
      name: name.trim(), company: (company || '').trim(),
      phone: phone.trim(), email: (email || '').trim(), created_by: user.id, org_id: await myOrgId(),
    }).select().single();
    if (error) fail(400, error.message);
    return { visitor: data };
  }
  if (method === 'PATCH' && seg[0] === 'visitors' && seg[2] === 'ban') {
    const { banned, reason } = body;
    const { data, error } = await supabase.from('visitors')
      .update({ is_banned: Boolean(banned), ban_reason: reason || '' })
      .eq('id', seg[1]).select().single();
    if (error) fail(400, error.message);
    return { visitor: data };
  }

  // ---- visits ----
  const VISIT_SELECT = '*, visitor:visitors(id,name,company,phone,email,is_banned,ban_reason), host:profiles!host_id(id,name,email), checkin_by:profiles!checked_in_by(id,name), checkout_by:profiles!checked_out_by(id,name), dept:departments(id,name)';

  if (head === 'GET /visits') {
    // Code lookup: GET /visits/code/:code
    if (seg[1] === 'code' && seg[2]) {
      const { data, error } = await supabase.from('visits').select(VISIT_SELECT)
        .eq('access_code', seg[2]).in('status', ['expected','checked_in']).maybeSingle();
      if (error) fail(400, error.message);
      if (!data) fail(404, 'No active visit found for that code.');
      return { visit: data };
    }

    let q = supabase.from('visits').select(VISIT_SELECT).order('expected_at', { ascending: false });
    if (path.includes('mine=true')) {
      const { data: { user } } = await supabase.auth.getUser();
      q = q.or(`host_id.eq.${user.id},created_by.eq.${user.id}`);
    }
    if (path.includes('status=')) {
      const status = (path.match(/status=([^&]*)/) || [])[1];
      if (status) q = q.eq('status', status);
    }
    if (path.includes('overstay=true')) {
      const cutoff = new Date(Date.now() - 4 * 3600000).toISOString();
      q = q.eq('status', 'checked_in').lt('checked_in_at', cutoff);
    }
    const { data, error } = await q;
    if (error) fail(400, error.message);
    return { visits: data };
  }

  if (head === 'POST /visits') {
    // Mark no-shows
    if (seg[1] === 'noshow') {
      const { data, error } = await supabase.rpc('mark_no_shows');
      if (error) fail(400, error.message);
      return { count: data };
    }
    // Create visit (creates visitor inline if no visitorId)
    const { visitorId, visitorName, visitorCompany, visitorPhone, visitorEmail,
            purpose, notes, expectedAt, accessPoint, hostId } = body;
    if (!purpose) fail(400, 'Purpose is required.');
    if (!expectedAt) fail(400, 'Expected arrival time is required.');

    const { data: { user } } = await supabase.auth.getUser();
    const resolvedHostId = hostId || user.id;

    // Resolve or create visitor person record
    let resolvedVisitorId = visitorId;
    if (!resolvedVisitorId) {
      if (!visitorName || !visitorPhone) fail(400, 'Visitor name and phone are required.');
      const { data: vis, error: visErr } = await supabase.from('visitors').insert({
        name: visitorName.trim(), company: (visitorCompany || '').trim(),
        phone: visitorPhone.trim(), email: (visitorEmail || '').trim(),
        created_by: user.id, org_id: await myOrgId(),
      }).select().single();
      if (visErr) fail(400, visErr.message);
      resolvedVisitorId = vis.id;
    }

    // Get department from host profile
    const { data: hostProfile } = await supabase.from('profiles').select('department_id').eq('id', resolvedHostId).single();
    const deptId = hostProfile?.department_id || null;

    const { data, error } = await supabase.rpc('create_visit', {
      p_visitor_id:    resolvedVisitorId,
      p_host_id:       resolvedHostId,
      p_department_id: deptId,
      p_purpose:       purpose.trim(),
      p_notes:         notes || '',
      p_expected_at:   expectedAt,
      p_access_point:  accessPoint || 'Main Entrance',
    });
    if (error) fail(400, error.message);
    return { visit: data };
  }

  if (method === 'PATCH' && seg[0] === 'visits' && seg.length === 2) {
    const { action, badgeNumber, accessPoint, flagReason } = body;
    const { data: { user } } = await supabase.auth.getUser();
    let patch = {};
    if (action === 'checkin') {
      patch = { status: 'checked_in', checked_in_at: new Date().toISOString(), checked_in_by: user.id };
      if (badgeNumber) patch.badge_number = badgeNumber;
      if (accessPoint) patch.access_point = accessPoint;
    } else if (action === 'checkout') {
      patch = { status: 'checked_out', checked_out_at: new Date().toISOString(), checked_out_by: user.id };
    } else if (action === 'cancel') {
      patch = { status: 'cancelled' };
    } else if (action === 'flag') {
      patch = { flagged: true, flag_reason: flagReason || '' };
    } else {
      fail(400, 'Unknown action. Use: checkin, checkout, cancel, flag.');
    }
    const { data, error } = await supabase.from('visits').update(patch).eq('id', seg[1]).select(VISIT_SELECT).single();
    if (error) fail(400, error.message);
    return { visit: data };
  }

  if (head === 'GET /visitstats') {
    const { data, error } = await supabase.rpc('get_visitor_stats');
    if (error) fail(400, error.message);
    return { stats: data };
  }

  // ---- crm ----
  if (head === 'GET /crm' && seg[1] === 'companies') {
    const { data, error } = await supabase.from('crm_companies').select('*').order('name');
    if (error) fail(400, error.message);
    return { companies: data };
  }
  if (head === 'POST /crm' && seg[1] === 'companies') {
    const { name, industry, phone, email, website, address, notes } = body;
    if (!name?.trim()) fail(400, 'Company name is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('crm_companies').insert({
      name: name.trim(), industry: industry || '', phone: phone || '', email: email || '',
      website: website || '', address: address || '', notes: notes || '',
      created_by: user.id, org_id: await myOrgId(),
    }).select().single();
    if (error) fail(400, error.message);
    return { company: data };
  }
  if (method === 'PATCH' && seg[0] === 'crm' && seg[1] === 'companies' && seg.length === 3) {
    const patch = {};
    ['name','industry','phone','email','website','address','notes'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
    const { data, error } = await supabase.from('crm_companies').update(patch).eq('id', seg[2]).select().single();
    if (error) fail(400, error.message);
    return { company: data };
  }
  if (method === 'DELETE' && seg[0] === 'crm' && seg[1] === 'companies' && seg.length === 3) {
    const { error } = await supabase.from('crm_companies').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  const CONTACT_SELECT = '*, company:crm_companies(id,name)';
  if (head === 'GET /crm' && seg[1] === 'contacts') {
    const { data, error } = await supabase.from('crm_contacts').select(CONTACT_SELECT).order('name');
    if (error) fail(400, error.message);
    return { contacts: data };
  }
  if (head === 'POST /crm' && seg[1] === 'contacts') {
    const { name, companyId, jobTitle, email, phone, whatsapp, notes } = body;
    if (!name?.trim()) fail(400, 'Contact name is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('crm_contacts').insert({
      name: name.trim(), company_id: companyId || null, job_title: jobTitle || '', email: email || '',
      phone: phone || '', whatsapp: whatsapp || '', notes: notes || '',
      created_by: user.id, org_id: await myOrgId(),
    }).select(CONTACT_SELECT).single();
    if (error) fail(400, error.message);
    return { contact: data };
  }
  if (method === 'PATCH' && seg[0] === 'crm' && seg[1] === 'contacts' && seg.length === 3) {
    const patch = {};
    ['name','jobTitle','email','phone','whatsapp','notes'].forEach((k) => {
      const col = { jobTitle: 'job_title' }[k] || k;
      if (body[k] !== undefined) patch[col] = body[k];
    });
    if (body.companyId !== undefined) patch.company_id = body.companyId || null;
    const { data, error } = await supabase.from('crm_contacts').update(patch).eq('id', seg[2]).select(CONTACT_SELECT).single();
    if (error) fail(400, error.message);
    return { contact: data };
  }
  if (method === 'DELETE' && seg[0] === 'crm' && seg[1] === 'contacts' && seg.length === 3) {
    const { error } = await supabase.from('crm_contacts').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  const ACTIVITY_SELECT = '*, contact:crm_contacts(id,name,email,phone,whatsapp), company:crm_companies(id,name), author:profiles!created_by(id,name)';
  if (head === 'GET /crm' && seg[1] === 'activities') {
    let q = supabase.from('crm_activities').select(ACTIVITY_SELECT).order('occurred_at', { ascending: false });
    const contactId = (path.match(/contactId=([^&]*)/) || [])[1];
    const companyId = (path.match(/companyId=([^&]*)/) || [])[1];
    if (contactId) q = q.eq('contact_id', contactId);
    if (companyId) q = q.eq('company_id', companyId);
    const { data, error } = await q;
    if (error) fail(400, error.message);
    return { activities: data };
  }
  if (method === 'PATCH' && seg[0] === 'crm' && seg[1] === 'activities' && seg[2]) {
    const patch = {};
    if (body.replied !== undefined) patch.replied_at = body.replied ? new Date().toISOString() : null;
    if (body.followUpAt !== undefined) patch.follow_up_at = body.followUpAt;
    if (body.notes !== undefined) patch.notes = body.notes;
    const { data, error } = await supabase.from('crm_activities').update(patch).eq('id', seg[2]).select(ACTIVITY_SELECT).single();
    if (error) fail(400, error.message);
    return { activity: data };
  }

  // ---- crm: deals pipeline ----
  const DEAL_SELECT = '*, contact:crm_contacts(id,name,phone,whatsapp), company:crm_companies(id,name)';
  if (head === 'GET /crm' && seg[1] === 'bookings') {
    const { data, error } = await supabase.from('crm_bookings').select('*').order('starts_at', { ascending: true });
    if (error) fail(400, error.message);
    return { bookings: data };
  }
  if (head === 'POST /crm' && seg[1] === 'bookings') {
    const { customerName, phone, service, startsAt, durationMins, notes, contactId } = body;
    if (!customerName?.trim()) fail(400, 'Customer name is required.');
    if (!startsAt) fail(400, 'Booking date and time are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('crm_bookings').insert({
      customer_name: customerName.trim(), phone: (phone || '').trim(), service: (service || '').trim(),
      starts_at: startsAt, duration_mins: Number(durationMins) || 60, notes: notes || '',
      contact_id: contactId || null, created_by: user.id, org_id: await myOrgId(),
    }).select('*').single();
    if (error) fail(400, error.message);
    return { booking: data };
  }
  if (method === 'PATCH' && seg[0] === 'crm' && seg[1] === 'bookings' && seg.length === 3) {
    const patch = {};
    if (body.status !== undefined) patch.status = body.status;
    if (body.startsAt !== undefined) patch.starts_at = body.startsAt;
    if (body.notes !== undefined) patch.notes = body.notes;
    const { data, error } = await supabase.from('crm_bookings').update(patch).eq('id', seg[2]).select('*').single();
    if (error) fail(400, error.message);
    return { booking: data };
  }
  if (method === 'DELETE' && seg[0] === 'crm' && seg[1] === 'bookings' && seg.length === 3) {
    const { error } = await supabase.from('crm_bookings').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  if (head === 'GET /crm' && seg[1] === 'receivables') {
    const { data, error } = await supabase.from('crm_receivables').select('*').order('due_date', { ascending: true, nullsFirst: false });
    if (error) fail(400, error.message);
    return { receivables: data };
  }
  if (head === 'POST /crm' && seg[1] === 'receivables') {
    const { customerName, amountNaira, dueDate, note, contactId } = body;
    if (!customerName?.trim()) fail(400, 'Customer name is required.');
    if (!Number(amountNaira) || Number(amountNaira) <= 0) fail(400, 'Enter the amount owed.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('crm_receivables').insert({
      customer_name: customerName.trim(), amount_naira: Number(amountNaira), due_date: dueDate || null,
      note: note || '', contact_id: contactId || null, created_by: user.id, org_id: await myOrgId(),
    }).select('*').single();
    if (error) fail(400, error.message);
    return { receivable: data };
  }
  if (method === 'PATCH' && seg[0] === 'crm' && seg[1] === 'receivables' && seg.length === 3) {
    const patch = {};
    if (body.status !== undefined) {
      patch.status = body.status;
      patch.settled_at = body.status === 'paid' || body.status === 'written_off' ? new Date().toISOString() : null;
    }
    if (body.amountNaira !== undefined) patch.amount_naira = Number(body.amountNaira);
    if (body.dueDate !== undefined) patch.due_date = body.dueDate || null;
    if (body.note !== undefined) patch.note = body.note;
    const { data, error } = await supabase.from('crm_receivables').update(patch).eq('id', seg[2]).select('*').single();
    if (error) fail(400, error.message);
    return { receivable: data };
  }
  if (method === 'DELETE' && seg[0] === 'crm' && seg[1] === 'receivables' && seg.length === 3) {
    const { error } = await supabase.from('crm_receivables').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  if (head === 'GET /crm' && seg[1] === 'deals') {
    const { data, error } = await supabase.from('crm_deals').select(DEAL_SELECT).order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { deals: data };
  }
  if (head === 'POST /crm' && seg[1] === 'deals') {
    const { title, contactId, companyId, valueNaira, stage, expectedClose, notes } = body;
    if (!title?.trim()) fail(400, 'Deal title is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('crm_deals').insert({
      title: title.trim(), contact_id: contactId || null, company_id: companyId || null,
      value_naira: Number(valueNaira) || 0, stage: stage || 'lead', expected_close: expectedClose || null,
      notes: notes || '', created_by: user.id, org_id: await myOrgId(),
    }).select(DEAL_SELECT).single();
    if (error) fail(400, error.message);
    return { deal: data };
  }
  if (method === 'PATCH' && seg[0] === 'crm' && seg[1] === 'deals' && seg.length === 3) {
    const patch = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) patch.title = body.title;
    if (body.contactId !== undefined) patch.contact_id = body.contactId || null;
    if (body.companyId !== undefined) patch.company_id = body.companyId || null;
    if (body.valueNaira !== undefined) patch.value_naira = Number(body.valueNaira) || 0;
    if (body.stage !== undefined) patch.stage = body.stage;
    if (body.expectedClose !== undefined) patch.expected_close = body.expectedClose || null;
    if (body.notes !== undefined) patch.notes = body.notes;
    const { data, error } = await supabase.from('crm_deals').update(patch).eq('id', seg[2]).select(DEAL_SELECT).single();
    if (error) fail(400, error.message);
    return { deal: data };
  }
  if (method === 'DELETE' && seg[0] === 'crm' && seg[1] === 'deals' && seg.length === 3) {
    const { error } = await supabase.from('crm_deals').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }
  if (head === 'POST /crm' && seg[1] === 'activities') {
    const { contactId, companyId, type, notes, occurredAt } = body;
    if (!contactId && !companyId) fail(400, 'Link this activity to a contact or company.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('crm_activities').insert({
      contact_id: contactId || null, company_id: companyId || null, type: type || 'note',
      notes: notes || '', occurred_at: occurredAt || new Date().toISOString(),
      created_by: user.id, org_id: await myOrgId(),
    }).select(ACTIVITY_SELECT).single();
    if (error) fail(400, error.message);
    return { activity: data };
  }
  if (method === 'DELETE' && seg[0] === 'crm' && seg[1] === 'activities' && seg.length === 3) {
    const { error } = await supabase.from('crm_activities').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  // ---- attendance ----
  const ATT_SELECT = '*, employee:profiles!employee_id(id,name,email)';
  if (head === 'GET /attendance' && seg[1] === 'records') {
    const { data, error } = await supabase.from('attendance_records').select(ATT_SELECT).order('clock_in_at', { ascending: false });
    if (error) fail(400, error.message);
    return { records: data };
  }
  // Manager correction of a shift — RLS already allows managers to update
  // records; this closes the "forgot to clock out" dead end.
  if (method === 'PATCH' && seg[0] === 'attendance' && seg[1] === 'records' && seg.length === 3) {
    const patch = {};
    if (body.clockInAt !== undefined) patch.clock_in_at = body.clockInAt;
    if (body.clockOutAt !== undefined) patch.clock_out_at = body.clockOutAt;
    if (body.notes !== undefined) patch.notes = body.notes;
    const { data, error } = await supabase.from('attendance_records').update(patch).eq('id', seg[2]).select(ATT_SELECT).single();
    if (error) fail(400, error.message);
    return { record: data };
  }
  if (head === 'GET /attendance' && seg[1] === 'mine') {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('attendance_records').select('*').eq('employee_id', user.id).order('clock_in_at', { ascending: false });
    if (error) fail(400, error.message);
    return { records: data };
  }
  if (head === 'POST /attendance' && seg[1] === 'clockin') {
    const { lat, lng } = body;
    const { data, error } = await supabase.rpc('attendance_clock_in', { p_lat: lat ?? null, p_lng: lng ?? null });
    if (error) fail(400, error.message);
    return { record: data };
  }
  if (head === 'POST /attendance' && seg[1] === 'clockout') {
    const { lat, lng } = body;
    const { data, error } = await supabase.rpc('attendance_clock_out', { p_lat: lat ?? null, p_lng: lng ?? null });
    if (error) fail(400, error.message);
    return { record: data };
  }

  // ---- benefits ----
  if (head === 'GET /benefits' && seg[1] === 'plans') {
    const { data, error } = await supabase.from('benefit_plans').select('*').order('name');
    if (error) fail(400, error.message);
    return { plans: data };
  }
  if (head === 'POST /benefits' && seg[1] === 'plans') {
    const { name, type, provider, notes } = body;
    if (!name?.trim()) fail(400, 'Plan name is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('benefit_plans').insert({
      name: name.trim(), type: type || 'hmo', provider: provider || '', notes: notes || '',
      created_by: user.id, org_id: await myOrgId(),
    }).select().single();
    if (error) fail(400, error.message);
    return { plan: data };
  }
  if (method === 'PATCH' && seg[0] === 'benefits' && seg[1] === 'plans' && seg.length === 3) {
    const patch = {};
    ['name','type','provider','notes','active'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
    const { data, error } = await supabase.from('benefit_plans').update(patch).eq('id', seg[2]).select().single();
    if (error) fail(400, error.message);
    return { plan: data };
  }
  if (method === 'DELETE' && seg[0] === 'benefits' && seg[1] === 'plans' && seg.length === 3) {
    const { error } = await supabase.from('benefit_plans').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  const ENROLL_SELECT = '*, employee:profiles!employee_id(id,name,email), plan:benefit_plans(id,name,type,provider)';
  if (head === 'GET /benefits' && seg[1] === 'enrollments') {
    const { data, error } = await supabase.from('employee_benefits').select(ENROLL_SELECT).order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { enrollments: data };
  }
  if (head === 'GET /benefits' && seg[1] === 'mine') {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('employee_benefits').select(ENROLL_SELECT).eq('employee_id', user.id);
    if (error) fail(400, error.message);
    return { enrollments: data };
  }
  if (head === 'POST /benefits' && seg[1] === 'enrollments') {
    const { employeeId, planId, enrollmentDate, memberId, pfaName, pfaPin, notes } = body;
    if (!employeeId || !planId) fail(400, 'Employee and plan are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('employee_benefits').insert({
      employee_id: employeeId, plan_id: planId, enrollment_date: enrollmentDate || new Date().toISOString().slice(0, 10),
      member_id: memberId || '', pfa_name: pfaName || '', pfa_pin: pfaPin || '', notes: notes || '',
      created_by: user.id, org_id: await myOrgId(),
    }).select(ENROLL_SELECT).single();
    if (error) fail(400, /unique/i.test(error.message) ? 'Employee is already enrolled in this plan.' : error.message);
    return { enrollment: data };
  }
  if (method === 'PATCH' && seg[0] === 'benefits' && seg[1] === 'enrollments' && seg.length === 3) {
    const patch = {};
    ['status','memberId','pfaName','pfaPin','notes'].forEach((k) => {
      const col = { memberId: 'member_id', pfaName: 'pfa_name', pfaPin: 'pfa_pin' }[k] || k;
      if (body[k] !== undefined) patch[col] = body[k];
    });
    const { data, error } = await supabase.from('employee_benefits').update(patch).eq('id', seg[2]).select(ENROLL_SELECT).single();
    if (error) fail(400, error.message);
    return { enrollment: data };
  }
  if (method === 'DELETE' && seg[0] === 'benefits' && seg[1] === 'enrollments' && seg.length === 3) {
    const { error } = await supabase.from('employee_benefits').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  // ---- it-assets ----
  const ASSET_SELECT = '*, employee:profiles!assigned_to(id,name,email)';
  if (head === 'GET /itassets' && seg[1] === 'assets') {
    const { data, error } = await supabase.from('it_assets').select(ASSET_SELECT).order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { assets: data };
  }
  if (head === 'GET /itassets' && seg[1] === 'history') {
    const { data, error } = await supabase.from('it_asset_history')
      .select('*, employee:profiles!employee_id(id,name), author:profiles!created_by(id,name)')
      .eq('asset_id', seg[2]).order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { history: data };
  }
  if (head === 'POST /itassets' && seg[1] === 'assets') {
    const { assetTag, name, category, serialNumber, purchaseDate, purchaseCost } = body;
    if (!assetTag?.trim() || !name?.trim()) fail(400, 'Asset tag and name are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('it_assets').insert({
      asset_tag: assetTag.trim(), name: name.trim(), category: category || 'other',
      serial_number: serialNumber || '', purchase_date: purchaseDate || null, purchase_cost: purchaseCost || null,
      created_by: user.id, org_id: await myOrgId(),
    }).select(ASSET_SELECT).single();
    if (error) fail(400, /unique/i.test(error.message) ? 'That asset tag is already in use.' : error.message);
    return { asset: data };
  }
  if (method === 'PATCH' && seg[0] === 'itassets' && seg[1] === 'assets' && seg.length === 3) {
    const { action, employeeId, notes, ...rest } = body;
    const { data: { user } } = await supabase.auth.getUser();
    const patch = {};
    ['name','category','serialNumber','purchaseDate','purchaseCost','notes'].forEach((k) => {
      const col = { serialNumber: 'serial_number', purchaseDate: 'purchase_date', purchaseCost: 'purchase_cost' }[k] || k;
      if (rest[k] !== undefined) patch[col] = rest[k];
    });
    const orgId = await myOrgId();
    if (action === 'assign')   { patch.status = 'in_use'; patch.assigned_to = employeeId; }
    if (action === 'return')   { patch.status = 'spare';  patch.assigned_to = null; }
    if (action === 'repair')   patch.status = 'repair';
    if (action === 'retire')   { patch.status = 'retired'; patch.assigned_to = null; }
    const { data, error } = await supabase.from('it_assets').update(patch).eq('id', seg[2]).select(ASSET_SELECT).single();
    if (error) fail(400, error.message);
    if (action) {
      await supabase.from('it_asset_history').insert({
        asset_id: seg[2], action: { assign: 'assigned', return: 'returned', repair: 'repaired', retire: 'retired' }[action] || 'note',
        employee_id: employeeId || data.assigned_to || null, notes: notes || '', created_by: user.id, org_id: orgId,
      });
    }
    return { asset: data };
  }
  if (method === 'DELETE' && seg[0] === 'itassets' && seg[1] === 'assets' && seg.length === 3) {
    const { error } = await supabase.from('it_assets').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  // ---- procurement ----
  if (head === 'GET /procurement' && seg[1] === 'vendors') {
    const { data, error } = await supabase.from('vendors').select('*').order('name');
    if (error) fail(400, error.message);
    return { vendors: data };
  }
  if (head === 'POST /procurement' && seg[1] === 'vendors') {
    const { name, contactName, phone, email, address, notes } = body;
    if (!name?.trim()) fail(400, 'Vendor name is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('vendors').insert({
      name: name.trim(), contact_name: contactName || '', phone: phone || '', email: email || '',
      address: address || '', notes: notes || '', created_by: user.id, org_id: await myOrgId(),
    }).select().single();
    if (error) fail(400, error.message);
    return { vendor: data };
  }
  if (method === 'PATCH' && seg[0] === 'procurement' && seg[1] === 'vendors' && seg.length === 3) {
    const patch = {};
    ['name','phone','email','address','notes'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
    const { data, error } = await supabase.from('vendors').update(patch).eq('id', seg[2]).select().single();
    if (error) fail(400, error.message);
    return { vendor: data };
  }
  if (method === 'DELETE' && seg[0] === 'procurement' && seg[1] === 'vendors' && seg.length === 3) {
    const { error } = await supabase.from('vendors').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  const PR_SELECT = '*, requester:profiles!requested_by(id,name,email), vendor:vendors(id,name), dept:departments(id,name)';
  if (head === 'GET /procurement' && seg[1] === 'requests') {
    const { data, error } = await supabase.from('purchase_requests').select(PR_SELECT).order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { requests: data };
  }
  if (head === 'POST /procurement' && seg[1] === 'requests') {
    const { departmentId, vendorId, itemDescription, quantity, unitCost, vatRate, notes } = body;
    if (!itemDescription?.trim()) fail(400, 'Item description is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('purchase_requests').insert({
      requested_by: user.id, department_id: departmentId || null, vendor_id: vendorId || null,
      item_description: itemDescription.trim(), quantity: quantity || 1, unit_cost: unitCost || 0,
      vat_rate: vatRate ?? 0.075, notes: notes || '', org_id: await myOrgId(),
    }).select(PR_SELECT).single();
    if (error) fail(400, error.message);
    return { request: data };
  }
  if (method === 'PATCH' && seg[0] === 'procurement' && seg[1] === 'requests' && seg.length === 3) {
    const { action } = body;
    if (action) {
      const { data, error } = await supabase.rpc('decide_purchase_request', { _id: seg[2], _decision: action });
      if (error) fail(400, error.message);
      const { data: full, error: getErr } = await supabase.from('purchase_requests').select(PR_SELECT).eq('id', data.id).single();
      if (getErr) fail(400, getErr.message);
      return { request: full };
    }
    const patch = {};
    ['itemDescription','quantity','unitCost','vatRate','notes'].forEach((k) => {
      const col = { itemDescription: 'item_description', unitCost: 'unit_cost', vatRate: 'vat_rate' }[k] || k;
      if (body[k] !== undefined) patch[col] = body[k];
    });
    if (body.vendorId !== undefined) patch.vendor_id = body.vendorId || null;
    const { data, error } = await supabase.from('purchase_requests').update(patch).eq('id', seg[2]).select(PR_SELECT).single();
    if (error) fail(400, error.message);
    return { request: data };
  }
  if (method === 'DELETE' && seg[0] === 'procurement' && seg[1] === 'requests' && seg.length === 3) {
    const { error } = await supabase.from('purchase_requests').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  // ---- inventory ----
  if (head === 'GET /inventory' && seg[1] === 'warehouses') {
    const { data, error } = await supabase.from('warehouses').select('*').order('name');
    if (error) fail(400, error.message);
    return { warehouses: data };
  }
  if (head === 'POST /inventory' && seg[1] === 'warehouses') {
    const { name, location } = body;
    if (!name?.trim()) fail(400, 'Warehouse name is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('warehouses').insert({
      name: name.trim(), location: location || '', created_by: user.id, org_id: await myOrgId(),
    }).select().single();
    if (error) fail(400, error.message);
    return { warehouse: data };
  }

  if (head === 'GET /inventory' && seg[1] === 'items') {
    const { data, error } = await supabase.from('stock_items').select('*, levels:stock_levels(warehouse_id, quantity)').order('name');
    if (error) fail(400, error.message);
    return { items: data };
  }
  if (head === 'POST /inventory' && seg[1] === 'items') {
    const { sku, name, unit, category, reorderLevel, notes, forSale, forStaffUse } = body;
    if (!sku?.trim() || !name?.trim()) fail(400, 'SKU and name are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('stock_items').insert({
      sku: sku.trim(), name: name.trim(), unit: unit || 'unit', category: category || '',
      reorder_level: reorderLevel || 0, notes: notes || '', created_by: user.id, org_id: await myOrgId(),
      for_sale: forSale ?? true, for_staff_use: forStaffUse ?? false,
    }).select().single();
    if (error) fail(400, /unique/i.test(error.message) ? 'That SKU is already in use.' : error.message);
    return { item: data };
  }
  if (method === 'DELETE' && seg[0] === 'inventory' && seg[1] === 'items' && seg.length === 3) {
    const { error } = await supabase.from('stock_items').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  if (head === 'GET /inventory' && seg[1] === 'movements') {
    const { data, error } = await supabase.from('stock_movements')
      .select('*, item:stock_items(id,name,sku,unit), warehouse:warehouses!warehouse_id(id,name), toWarehouse:warehouses!to_warehouse_id(id,name), author:profiles!created_by(id,name)')
      .order('created_at', { ascending: false }).limit(100);
    if (error) fail(400, error.message);
    return { movements: data };
  }
  if (head === 'POST /inventory' && seg[1] === 'movements') {
    const { itemId, warehouseId, type, quantity, toWarehouseId, reference, notes } = body;
    if (!itemId || !warehouseId || !type || !quantity) fail(400, 'Item, warehouse, type and quantity are required.');
    const { data, error } = await supabase.rpc('record_stock_movement', {
      p_item_id: itemId, p_warehouse_id: warehouseId, p_type: type, p_quantity: quantity,
      p_to_warehouse_id: toWarehouseId || null, p_reference: reference || '', p_notes: notes || '',
    });
    if (error) fail(400, error.message);
    return { movement: data };
  }

  // ---- inventory bookings (stock reservations) ----
  const RESERVATION_SELECT = '*, item:stock_items(id,name,sku,unit), warehouse:warehouses(id,name), author:profiles!created_by(id,name)';
  if (head === 'GET /inventory' && seg[1] === 'reservations') {
    const { data, error } = await supabase.from('stock_reservations').select(RESERVATION_SELECT).order('created_at', { ascending: false }).limit(200);
    if (error) fail(400, error.message);
    return { reservations: data };
  }
  if (head === 'POST /inventory' && seg[1] === 'reservations') {
    const { itemId, warehouseId, quantity, reference, notes, holdUntil } = body;
    if (!itemId || !warehouseId || !quantity) fail(400, 'Item, warehouse and quantity are required.');
    const { data, error } = await supabase.rpc('reserve_stock', {
      p_item_id: itemId, p_warehouse_id: warehouseId, p_quantity: quantity,
      p_reference: reference || '', p_notes: notes || '', p_hold_until: holdUntil || null,
    });
    if (error) fail(400, error.message);
    const { data: full, error: getErr } = await supabase.from('stock_reservations').select(RESERVATION_SELECT).eq('id', data.id).single();
    if (getErr) fail(400, getErr.message);
    return { reservation: full };
  }
  if (head === 'POST /inventory' && seg[1] === 'reservations' && seg[3] === 'fulfill') {
    const { data, error } = await supabase.rpc('fulfill_reservation', { p_id: seg[2] });
    if (error) fail(400, error.message);
    const { data: full, error: getErr } = await supabase.from('stock_reservations').select(RESERVATION_SELECT).eq('id', data.id).single();
    if (getErr) fail(400, getErr.message);
    return { reservation: full };
  }
  if (head === 'POST /inventory' && seg[1] === 'reservations' && seg[3] === 'release') {
    const { data, error } = await supabase.rpc('release_reservation', { p_id: seg[2] });
    if (error) fail(400, error.message);
    const { data: full, error: getErr } = await supabase.from('stock_reservations').select(RESERVATION_SELECT).eq('id', data.id).single();
    if (getErr) fail(400, getErr.message);
    return { reservation: full };
  }

  // ---- inventory staff takeouts ----
  const TAKEOUT_SELECT = '*, item:stock_items(id,name,sku,unit), warehouse:warehouses(id,name), staff:profiles!staff_id(id,name,email), approver:profiles!approved_by(id,name)';
  if (head === 'GET /inventory' && seg[1] === 'takeouts') {
    const { data, error } = await supabase.from('stock_takeouts').select(TAKEOUT_SELECT).order('created_at', { ascending: false }).limit(200);
    if (error) fail(400, error.message);
    return { takeouts: data };
  }
  if (head === 'POST /inventory' && seg[1] === 'takeouts' && seg.length === 2) {
    const { itemId, warehouseId, quantity, staffId, notes } = body;
    if (!itemId || !warehouseId || !quantity || !staffId) fail(400, 'Item, warehouse, quantity and staff member are required.');
    const { data, error } = await supabase.rpc('create_takeout', { p_item_id: itemId, p_warehouse_id: warehouseId, p_quantity: quantity, p_staff_id: staffId, p_notes: notes || '' });
    if (error) fail(400, error.message);
    const { data: full, error: getErr } = await supabase.from('stock_takeouts').select(TAKEOUT_SELECT).eq('id', data.id).single();
    if (getErr) fail(400, getErr.message);
    return { takeout: full };
  }
  if (head === 'POST /inventory' && seg[1] === 'takeouts' && seg[3] === 'return') {
    const { data, error } = await supabase.rpc('return_takeout', { p_id: seg[2], p_notes: body?.notes || '' });
    if (error) fail(400, error.message);
    const { data: full, error: getErr } = await supabase.from('stock_takeouts').select(TAKEOUT_SELECT).eq('id', data.id).single();
    if (getErr) fail(400, getErr.message);
    return { takeout: full };
  }
  if (head === 'POST /inventory' && seg[1] === 'takeouts' && seg[3] === 'cancel') {
    const { data, error } = await supabase.rpc('cancel_takeout', { p_id: seg[2] });
    if (error) fail(400, error.message);
    const { data: full, error: getErr } = await supabase.from('stock_takeouts').select(TAKEOUT_SELECT).eq('id', data.id).single();
    if (getErr) fail(400, getErr.message);
    return { takeout: full };
  }

  // ---- trade documents (invoice, receipt, GRN, SRP) ----
  const TRADE_DOC_SELECT = '*, contact:crm_contacts(id,name), vendor:vendors(id,name), warehouse:warehouses(id,name), author:profiles!created_by(id,name)';
  if (head === 'GET /trade-docs' && seg.length === 1) {
    const { data, error } = await supabase.from('trade_documents').select(TRADE_DOC_SELECT).order('created_at', { ascending: false }).limit(300);
    if (error) fail(400, error.message);
    return { documents: data };
  }
  if (head === 'POST /trade-docs' && seg.length === 1) {
    const { docType, partyName, partyPhone, partyEmail, partyAddress, contactId, vendorId, warehouseId, items, vatRate, dueDate, reference, notes, linkStock } = body;
    if (!docType) fail(400, 'Document type is required.');
    if (!items || !items.length) fail(400, 'Add at least one line item.');
    const { data, error } = await supabase.rpc('create_trade_document', {
      p_doc_type: docType, p_party_name: partyName || '', p_party_phone: partyPhone || '',
      p_party_email: partyEmail || '', p_party_address: partyAddress || '',
      p_contact_id: contactId || null, p_vendor_id: vendorId || null, p_warehouse_id: warehouseId || null,
      p_items: items, p_vat_rate: vatRate ?? 0.075, p_due_date: dueDate || null,
      p_reference: reference || '', p_notes: notes || '', p_link_stock: !!linkStock,
    });
    if (error) fail(400, error.message);
    const { data: full, error: getErr } = await supabase.from('trade_documents').select(TRADE_DOC_SELECT).eq('id', data.id).single();
    if (getErr) fail(400, getErr.message);
    return { document: full };
  }
  if (method === 'PATCH' && seg[0] === 'trade-docs' && seg.length === 2) {
    const { status } = body;
    if (!['draft', 'issued', 'paid', 'void'].includes(status)) fail(400, 'Invalid status.');
    const { data, error } = await supabase.from('trade_documents').update({ status }).eq('id', seg[1]).select(TRADE_DOC_SELECT).single();
    if (error) fail(400, error.message);
    return { document: data };
  }
  if (method === 'DELETE' && seg[0] === 'trade-docs' && seg.length === 2) {
    const { error } = await supabase.from('trade_documents').delete().eq('id', seg[1]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  // ---- trade documents: letterhead settings ----
  if (head === 'GET /trade-docs' && seg[1] === 'settings') {
    const { data, error } = await supabase.from('trade_doc_settings').select('*').maybeSingle();
    if (error) fail(400, error.message);
    return { settings: data };
  }
  if (head === 'POST /trade-docs' && seg[1] === 'settings') {
    const { companyName, address, tagline, phone, email, logoUrl, accentColor, signatureName, signatureTitle, signatureUrl, templateKey } = body;
    const { data, error } = await supabase.rpc('upsert_trade_doc_settings', {
      p_company_name: companyName || '', p_address: address || '', p_tagline: tagline || '',
      p_phone: phone || '', p_email: email || '', p_logo_url: logoUrl || '', p_accent_color: accentColor || '#0A0E1A',
      p_signature_name: signatureName || '', p_signature_title: signatureTitle || '', p_signature_url: signatureUrl || '',
      p_template_key: templateKey || 'classic',
    });
    if (error) fail(400, error.message);
    return { settings: data };
  }

  // ---- automation ----
  if (head === 'GET /automation' && seg[1] === 'settings') {
    const { data, error } = await supabase.from('automation_settings').select('*');
    if (error) fail(400, error.message);
    return { settings: data };
  }
  if (head === 'POST /automation' && seg[1] === 'settings') {
    const { key, enabled, config } = body;
    if (!key) fail(400, 'Automation key is required.');
    const { data, error } = await supabase.rpc('upsert_automation_setting', { p_key: key, p_enabled: !!enabled, p_config: config || {} });
    if (error) fail(400, error.message);
    return { setting: data };
  }
  if (head === 'GET /automation' && seg[1] === 'runs') {
    const { data, error } = await supabase.from('automation_runs').select('*').order('ran_at', { ascending: false }).limit(60);
    if (error) fail(400, error.message);
    return { runs: data };
  }

  // ---- finance ----
  if (head === 'GET /finance' && seg[1] === 'categories') {
    const { data, error } = await supabase.from('expense_categories').select('*').order('name');
    if (error) fail(400, error.message);
    return { categories: data };
  }
  if (head === 'POST /finance' && seg[1] === 'categories') {
    const { name } = body;
    if (!name?.trim()) fail(400, 'Category name is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('expense_categories').insert({ name: name.trim(), created_by: user.id, org_id: await myOrgId() }).select().single();
    if (error) fail(400, /unique/i.test(error.message) ? 'That category already exists.' : error.message);
    return { category: data };
  }

  const EXPENSE_SELECT = '*, category:expense_categories(id,name), dept:departments(id,name), submitter:profiles!submitted_by(id,name,email)';
  if (head === 'GET /finance' && seg[1] === 'expenses') {
    const { data, error } = await supabase.from('expenses').select(EXPENSE_SELECT).order('expense_date', { ascending: false });
    if (error) fail(400, error.message);
    return { expenses: data };
  }
  if (head === 'POST /finance' && seg[1] === 'expenses') {
    const { categoryId, departmentId, vendor, description, amount, vatRate, expenseDate, notes, receiptPath } = body;
    if (!description?.trim()) fail(400, 'Description is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('expenses').insert({
      category_id: categoryId || null, department_id: departmentId || null, vendor: vendor || '',
      description: description.trim(), amount: amount || 0, vat_rate: vatRate ?? 0.075,
      expense_date: expenseDate || new Date().toISOString().slice(0, 10), notes: notes || '',
      receipt_path: receiptPath || null, submitted_by: user.id, org_id: await myOrgId(),
    }).select(EXPENSE_SELECT).single();
    if (error) fail(400, error.message);
    return { expense: data };
  }
  if (method === 'PATCH' && seg[0] === 'finance' && seg[1] === 'expenses' && seg.length === 3) {
    const { action } = body;
    if (action) {
      const { data, error } = await supabase.rpc('decide_expense', { _id: seg[2], _decision: action });
      if (error) fail(400, error.message);
      const { data: full, error: getErr } = await supabase.from('expenses').select(EXPENSE_SELECT).eq('id', data.id).single();
      if (getErr) fail(400, getErr.message);
      return { expense: full };
    }
    const patch = {};
    ['vendor','description','amount','vatRate','notes','expenseDate'].forEach((k) => {
      const col = { vatRate: 'vat_rate', expenseDate: 'expense_date' }[k] || k;
      if (body[k] !== undefined) patch[col] = body[k];
    });
    if (body.categoryId !== undefined) patch.category_id = body.categoryId || null;
    const { data, error } = await supabase.from('expenses').update(patch).eq('id', seg[2]).select(EXPENSE_SELECT).single();
    if (error) fail(400, error.message);
    return { expense: data };
  }
  if (method === 'DELETE' && seg[0] === 'finance' && seg[1] === 'expenses' && seg.length === 3) {
    const { error } = await supabase.from('expenses').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  if (head === 'GET /finance' && seg[1] === 'budgets') {
    const { data, error } = await supabase.from('budgets').select('*, category:expense_categories(id,name), dept:departments(id,name)').order('period_year', { ascending: false });
    if (error) fail(400, error.message);
    return { budgets: data };
  }
  if (head === 'POST /finance' && seg[1] === 'budgets') {
    const { departmentId, categoryId, periodYear, periodMonth, amount, notes } = body;
    if (!periodYear || !amount) fail(400, 'Period year and amount are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('budgets').insert({
      department_id: departmentId || null, category_id: categoryId || null, period_year: periodYear,
      period_month: periodMonth || null, amount, notes: notes || '', created_by: user.id, org_id: await myOrgId(),
    }).select('*, category:expense_categories(id,name), dept:departments(id,name)').single();
    if (error) fail(400, error.message);
    return { budget: data };
  }
  if (method === 'DELETE' && seg[0] === 'finance' && seg[1] === 'budgets' && seg.length === 3) {
    const { error } = await supabase.from('budgets').delete().eq('id', seg[2]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  // ---- projects ----
  const PROJECT_SELECT = '*, owner:profiles!owner_id(id,name,email)';
  if (head === 'GET /projects' && seg.length === 1) {
    const { data, error } = await supabase.from('projects').select(PROJECT_SELECT).order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { projects: data };
  }
  if (head === 'POST /projects' && seg.length === 1) {
    const { name, description, startDate, targetDate } = body;
    if (!name?.trim()) fail(400, 'Project name is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const orgId = await myOrgId();
    const { data, error } = await supabase.from('projects').insert({
      name: name.trim(), description: description || '', owner_id: user.id,
      start_date: startDate || null, target_date: targetDate || null, created_by: user.id, org_id: orgId,
    }).select(PROJECT_SELECT).single();
    if (error) fail(400, error.message);
    await supabase.from('project_members').insert({ project_id: data.id, user_id: user.id, role: 'lead', org_id: orgId });
    return { project: data };
  }
  if (method === 'PATCH' && seg[0] === 'projects' && seg.length === 2) {
    const patch = {};
    ['name','description','status'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
    if (body.startDate !== undefined) patch.start_date = body.startDate || null;
    if (body.targetDate !== undefined) patch.target_date = body.targetDate || null;
    const { data, error } = await supabase.from('projects').update(patch).eq('id', seg[1]).select(PROJECT_SELECT).single();
    if (error) fail(400, error.message);
    return { project: data };
  }
  if (method === 'DELETE' && seg[0] === 'projects' && seg.length === 2) {
    const { error } = await supabase.from('projects').delete().eq('id', seg[1]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  if (head === 'GET /projects' && seg[2] === 'members') {
    const { data, error } = await supabase.from('project_members').select('*, user:profiles!user_id(id,name,email)').eq('project_id', seg[1]);
    if (error) fail(400, error.message);
    return { members: data };
  }
  if (head === 'POST /projects' && seg[2] === 'members') {
    const { userId, role } = body;
    if (!userId) fail(400, 'userId is required.');
    const { data, error } = await supabase.from('project_members').insert({
      project_id: seg[1], user_id: userId, role: role || 'member', org_id: await myOrgId(),
    }).select('*, user:profiles!user_id(id,name,email)').single();
    if (error) fail(400, /unique/i.test(error.message) ? 'That person is already a member.' : error.message);
    return { member: data };
  }
  if (method === 'DELETE' && seg[0] === 'projects' && seg[2] === 'members' && seg.length === 4) {
    const { error } = await supabase.from('project_members').delete().eq('project_id', seg[1]).eq('user_id', seg[3]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  if (head === 'GET /projects' && seg[2] === 'milestones') {
    const { data, error } = await supabase.from('milestones').select('*').eq('project_id', seg[1]).order('sort_order');
    if (error) fail(400, error.message);
    return { milestones: data };
  }
  if (head === 'POST /projects' && seg[2] === 'milestones') {
    const { title, dueDate, sortOrder } = body;
    if (!title?.trim()) fail(400, 'Milestone title is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('milestones').insert({
      project_id: seg[1], title: title.trim(), due_date: dueDate || null, sort_order: sortOrder || 0,
      created_by: user.id, org_id: await myOrgId(),
    }).select().single();
    if (error) fail(400, error.message);
    return { milestone: data };
  }
  if (method === 'PATCH' && seg[0] === 'projects' && seg[2] === 'milestones' && seg.length === 4) {
    const patch = {};
    ['title','status','sortOrder'].forEach((k) => {
      const col = { sortOrder: 'sort_order' }[k] || k;
      if (body[k] !== undefined) patch[col] = body[k];
    });
    if (body.dueDate !== undefined) patch.due_date = body.dueDate || null;
    const { data, error } = await supabase.from('milestones').update(patch).eq('id', seg[3]).select().single();
    if (error) fail(400, error.message);
    return { milestone: data };
  }
  if (method === 'DELETE' && seg[0] === 'projects' && seg[2] === 'milestones' && seg.length === 4) {
    const { error } = await supabase.from('milestones').delete().eq('id', seg[3]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  const PTASK_SELECT = '*, assignee:profiles!assigned_to(id,name,email), milestone:milestones(id,title)';
  if (head === 'GET /projects' && seg[2] === 'tasks') {
    const { data, error } = await supabase.from('project_tasks').select(PTASK_SELECT).eq('project_id', seg[1]).order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { tasks: data };
  }
  if (head === 'POST /projects' && seg[2] === 'tasks') {
    const { title, description, milestoneId, assignedTo, priority, dueDate } = body;
    if (!title?.trim()) fail(400, 'Task title is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('project_tasks').insert({
      project_id: seg[1], title: title.trim(), description: description || '', milestone_id: milestoneId || null,
      assigned_to: assignedTo || null, priority: priority || 'medium', due_date: dueDate || null,
      created_by: user.id, org_id: await myOrgId(),
    }).select(PTASK_SELECT).single();
    if (error) fail(400, error.message);
    return { task: data };
  }
  if (method === 'PATCH' && seg[0] === 'projects' && seg[2] === 'tasks' && seg.length === 4) {
    const patch = {};
    ['title','description','status','priority'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
    if (body.assignedTo !== undefined) patch.assigned_to = body.assignedTo || null;
    if (body.milestoneId !== undefined) patch.milestone_id = body.milestoneId || null;
    if (body.dueDate !== undefined) patch.due_date = body.dueDate || null;
    const { data, error } = await supabase.from('project_tasks').update(patch).eq('id', seg[3]).select(PTASK_SELECT).single();
    if (error) fail(400, error.message);
    return { task: data };
  }
  if (method === 'DELETE' && seg[0] === 'projects' && seg[2] === 'tasks' && seg.length === 4) {
    const { error } = await supabase.from('project_tasks').delete().eq('id', seg[3]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  // ---- documents ----
  if (head === 'GET /docfolders') {
    const { data, error } = await supabase.from('doc_folders').select('*').order('name');
    if (error) fail(400, error.message);
    return { folders: data };
  }
  if (head === 'POST /docfolders') {
    const { name, parentFolderId } = body;
    if (!name?.trim()) fail(400, 'Folder name is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('doc_folders').insert({
      name: name.trim(), parent_folder_id: parentFolderId || null, created_by: user.id, org_id: await myOrgId(),
    }).select().single();
    if (error) fail(400, error.message);
    return { folder: data };
  }
  if (method === 'DELETE' && seg[0] === 'docfolders' && seg.length === 2) {
    const { error } = await supabase.from('doc_folders').delete().eq('id', seg[1]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  const DOC_SELECT = '*, folder:doc_folders(id,name), author:profiles!created_by(id,name,email)';
  if (head === 'GET /documents' && seg.length === 1) {
    const { data, error } = await supabase.from('documents').select(DOC_SELECT).order('updated_at', { ascending: false });
    if (error) fail(400, error.message);
    return { documents: data };
  }
  if (head === 'POST /documents' && seg.length === 1) {
    const { name, folderId, filePath, fileSize, visibility } = body;
    if (!name?.trim() || !filePath) fail(400, 'Name and file are required.');
    const { data: { user } } = await supabase.auth.getUser();
    const orgId = await myOrgId();
    const { data, error } = await supabase.from('documents').insert({
      name: name.trim(), folder_id: folderId || null, file_path: filePath, file_size: fileSize || null,
      visibility: visibility || 'org', created_by: user.id, org_id: orgId,
    }).select(DOC_SELECT).single();
    if (error) fail(400, error.message);
    await supabase.from('document_versions').insert({
      document_id: data.id, version: 1, file_path: filePath, file_size: fileSize || null, uploaded_by: user.id, org_id: orgId,
    });
    return { document: data };
  }
  if (method === 'PATCH' && seg[0] === 'documents' && seg.length === 2) {
    const { name, folderId, visibility } = body;
    const patch = { updated_at: new Date().toISOString() };
    if (name !== undefined) patch.name = name;
    if (folderId !== undefined) patch.folder_id = folderId || null;
    if (visibility !== undefined) patch.visibility = visibility;
    const { data, error } = await supabase.from('documents').update(patch).eq('id', seg[1]).select(DOC_SELECT).single();
    if (error) fail(400, error.message);
    return { document: data };
  }
  if (method === 'DELETE' && seg[0] === 'documents' && seg.length === 2) {
    const { error } = await supabase.from('documents').delete().eq('id', seg[1]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  if (head === 'POST /documents' && seg[2] === 'versions') {
    const { filePath, fileSize, notes } = body;
    if (!filePath) fail(400, 'File is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const orgId = await myOrgId();
    const { data: doc, error: docErr } = await supabase.from('documents').select('current_version').eq('id', seg[1]).single();
    if (docErr) fail(400, docErr.message);
    const nextVersion = (doc.current_version || 1) + 1;
    const { error: vErr } = await supabase.from('document_versions').insert({
      document_id: seg[1], version: nextVersion, file_path: filePath, file_size: fileSize || null,
      notes: notes || '', uploaded_by: user.id, org_id: orgId,
    });
    if (vErr) fail(400, vErr.message);
    const { data, error } = await supabase.from('documents')
      .update({ file_path: filePath, file_size: fileSize || null, current_version: nextVersion, updated_at: new Date().toISOString() })
      .eq('id', seg[1]).select(DOC_SELECT).single();
    if (error) fail(400, error.message);
    return { document: data };
  }
  if (head === 'GET /documents' && seg[2] === 'versions') {
    const { data, error } = await supabase.from('document_versions')
      .select('*, uploader:profiles!uploaded_by(id,name)').eq('document_id', seg[1]).order('version', { ascending: false });
    if (error) fail(400, error.message);
    return { versions: data };
  }

  if (head === 'GET /documents' && seg[2] === 'permissions') {
    const { data, error } = await supabase.from('document_permissions').select('*, user:profiles!user_id(id,name,email)').eq('document_id', seg[1]);
    if (error) fail(400, error.message);
    return { permissions: data };
  }
  if (head === 'POST /documents' && seg[2] === 'permissions') {
    const { userId } = body;
    if (!userId) fail(400, 'userId is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('document_permissions').insert({
      document_id: seg[1], user_id: userId, granted_by: user.id, org_id: await myOrgId(),
    }).select('*, user:profiles!user_id(id,name,email)').single();
    if (error) fail(400, /unique/i.test(error.message) ? 'That person already has access.' : error.message);
    return { permission: data };
  }
  if (method === 'DELETE' && seg[0] === 'documents' && seg[2] === 'permissions' && seg.length === 4) {
    const { error } = await supabase.from('document_permissions').delete().eq('document_id', seg[1]).eq('user_id', seg[3]);
    if (error) fail(400, error.message);
    return { ok: true };
  }

  if (head === 'POST /contact' && seg.length === 1) {
    const { name, email, phone, company, message } = body;
    const { error } = await supabase.rpc('public_submit_contact_message', {
      p_name: name, p_email: email || '', p_phone: phone || '', p_company: company || '', p_message: message || '',
    });
    if (error) fail(400, error.message);
    return { ok: true };
  }

  if (head === 'POST /embed' && seg[1] === 'lead') {
    const { orgSlug, name, email, phone, message } = body;
    const { error } = await supabase.rpc('public_submit_lead', {
      p_org_slug: orgSlug, p_name: name, p_email: email || '', p_phone: phone || '', p_message: message || '',
    });
    if (error) fail(400, error.message);
    return { ok: true };
  }

  return fail(404, `No Supabase route for ${method} ${path}`);
}
