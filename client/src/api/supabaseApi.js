// ---------------------------------------------------------------------------
// Real backend on Supabase. Implements the same endpoint contract the pages
// already call (apiGet('/me/suites'), apiPost('/users', ...), etc.) so nothing
// in the UI has to change. Auth + reads/edits go straight to Supabase under
// RLS; privileged ops (create user, reset password, enable/disable) go to the
// Vercel /api/admin function which holds the service key.
// ---------------------------------------------------------------------------
import { supabase } from '../lib/supabaseClient.js';
import { SUITES } from '../config/suites.js';

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
});

async function myProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) fail(401, 'Authentication required.');
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error || !data) fail(401, 'No profile found for this account.');
  return data;
}

function tiles(profile) {
  return SUITES.map((s) => {
    const grant = (profile.suites || []).find((g) => g.key === s.key);
    const granted = profile.role === 'super_admin' || Boolean(grant);
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
    await supabase.rpc('touch_last_login');
    return { accessToken: data.session.access_token, user: toPublic(profile) };
  }
  if (head === 'POST /auth' && seg[1] === 'refresh') {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) fail(401, 'No active session.');
    const profile = await myProfile();
    if (profile.status !== 'active') { await supabase.auth.signOut(); fail(401, 'Account is inactive.'); }
    return { accessToken: session.access_token, user: toPublic(profile) };
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
  if (head === 'GET /me' && !seg[1]) return { user: toPublic(await myProfile()) };
  if (head === 'PATCH /me' && !seg[1]) {
    const { phone, whatsapp, avatarUrl } = body;
    if (!phone || !phone.trim()) fail(400, 'Phone number is required.');
    const { error } = await supabase.rpc('update_my_profile', {
      p_phone:      phone.trim(),
      p_whatsapp:   (whatsapp || '').trim(),
      p_avatar_url: (avatarUrl || '').trim(),
    });
    if (error) fail(500, error.message);
    return { user: toPublic(await myProfile()) };
  }
  if (head === 'GET /me' && seg[1] === 'suites') {
    const p = await myProfile();
    return { suites: tiles(p), isSystemAdmin: p.role === 'super_admin' };
  }
  if (head === 'GET /catalog') return { suites: SUITES };
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
    const { data, error } = await supabase.from('departments').insert({ name: name.trim(), code: code.trim().toUpperCase() }).select().single();
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
        .insert({ task_id: seg[1], author_id: user.id, body: reportBody.trim(), attachments: attachments || [] })
        .select('*, author:profiles!author_id(id,name,email)').single();
      if (error) fail(400, error.message);
      return { report: data };
    }
    const { title, description, departmentId, assignedTo, priority, dueDate } = body;
    if (!title) fail(400, 'Title is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const row = { title, description: description || '', created_by: user.id };
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
      phone: phone.trim(), email: (email || '').trim(), created_by: user.id,
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
        created_by: user.id,
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

  return fail(404, `No Supabase route for ${method} ${path}`);
}
