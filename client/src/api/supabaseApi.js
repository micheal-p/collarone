// ---------------------------------------------------------------------------
// Real backend on Supabase. Implements the same endpoint contract the pages
// already call (apiGet('/me/suites'), apiPost('/users', ...), etc.) so nothing
// in the UI has to change. Auth + reads/edits go straight to Supabase under
// RLS; privileged ops (create user, reset password, enable/disable) go to the
// Vercel /api/admin function which holds the service key.
// ---------------------------------------------------------------------------
import { supabase } from '../lib/supabaseClient.js';
import { SUITES, MULTI_TENANT_SAFE_SUITES } from '../config/suites.js';

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
    .select('id, name, slug, plan_tier, theme_color, logo_url, status, suites_enabled, website_type').eq('id', orgId).single();
  if (error || !data) fail(401, 'No organization found for this account.');
  return data;
}

const toPublicOrg = (o) => ({
  id: o.id, name: o.name, slug: o.slug, planTier: o.plan_tier, themeColor: o.theme_color, logoUrl: o.logo_url,
  status: o.status, suitesEnabled: o.suites_enabled, websiteType: o.website_type,
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
    const safeForOrg = isFoundingOrg || MULTI_TENANT_SAFE_SUITES.includes(s.key);
    const granted = (profile.role === 'super_admin' ? safeForOrg : Boolean(grant));
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
    if (org.status !== 'active') { await supabase.auth.signOut(); fail(403, "Your organization's account is pending activation. We'll email you once your payment is confirmed."); }
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
  if (head === 'POST /auth' && seg[1] === 'change-password') {
    if (!body.newPassword || body.newPassword.length < 8) fail(400, 'New password must be at least 8 characters.');
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
    const { phone, whatsapp, avatarUrl } = body;
    if (!phone || !phone.trim()) fail(400, 'Phone number is required.');
    const { error } = await supabase.rpc('update_my_profile', {
      p_phone:      phone.trim(),
      p_whatsapp:   (whatsapp || '').trim(),
      p_avatar_url: (avatarUrl || '').trim(),
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
  if (head === 'POST /platform' && seg[1] === 'impersonate') {
    return callAdmin('impersonate', { orgId: body.orgId });
  }
  if (head === 'GET /platform' && seg[1] === 'audit-log') {
    const { data, error } = await supabase.from('platform_admin_audit_log').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) fail(error.code === '42501' ? 403 : 400, error.message);
    return { entries: data };
  }

  // ---- status: public health-check history (unauthenticated, anon role) ----
  if (head === 'GET /status' && seg[1] === 'checks') {
    const { data, error } = await supabase.from('status_checks').select('*').order('checked_at', { ascending: false }).limit(500);
    if (error) fail(400, error.message);
    return { checks: data };
  }

  // ---- careers: public job board (unauthenticated, anon role) ----
  if (head === 'GET /careers' && seg[1] === 'postings' && seg.length === 2) {
    const { data, error } = await supabase.from('public_job_postings').select('*').order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { postings: data };
  }
  if (head === 'GET /careers' && seg[1] === 'postings' && seg.length === 3) {
    const { data, error } = await supabase.from('public_job_postings').select('*').eq('id', seg[2]).maybeSingle();
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
  if (head === 'POST /users') return { user: toPublic(await callAdmin('create', body)) };

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
    const { data, error } = await supabase.from('profiles').update({ suites: body.suites || [] }).eq('id', seg[1]).select().single();
    if (error) fail(400, error.message);
    return { user: toPublic(data) };
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
    ['stage','rating','rejectionReason','offerSalary','offerStartDate','offerStatus','hiredProfileId'].forEach((k) => {
      const col = { rejectionReason: 'rejection_reason', offerSalary: 'offer_salary', offerStartDate: 'offer_start_date', offerStatus: 'offer_status', hiredProfileId: 'hired_profile_id' }[k] || k;
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
    ['outcome','feedback','mode'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
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
    ['category','description','resolutionNotes'].forEach((k) => {
      const col = { resolutionNotes: 'resolution_notes' }[k] || k;
      if (body[k] !== undefined) patch[col] = body[k];
    });
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

  const ACTIVITY_SELECT = '*, contact:crm_contacts(id,name), company:crm_companies(id,name), author:profiles!created_by(id,name)';
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

  return fail(404, `No Supabase route for ${method} ${path}`);
}
