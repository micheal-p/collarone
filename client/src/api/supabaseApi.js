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
  if (head === 'GET /tasks') {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, assignee:profiles!assigned_to(id,name,email), creator:profiles!created_by(id,name), dept:departments(id,name)')
      .order('created_at', { ascending: false });
    if (error) fail(400, error.message);
    return { tasks: data };
  }
  if (head === 'POST /tasks') {
    const { title, description, departmentId, assignedTo, priority, dueDate } = body;
    if (!title) fail(400, 'Title is required.');
    const { data: { user } } = await supabase.auth.getUser();
    const row = { title, description: description || '', created_by: user.id };
    if (departmentId) row.department_id = departmentId;
    if (assignedTo) row.assigned_to = assignedTo;
    if (priority) row.priority = priority;
    if (dueDate) row.due_date = dueDate;
    const { data, error } = await supabase.from('tasks').insert(row).select('*, assignee:profiles!assigned_to(id,name,email), creator:profiles!created_by(id,name), dept:departments(id,name)').single();
    if (error) fail(400, error.message);
    return { task: data };
  }
  if (method === 'PATCH' && seg[0] === 'tasks' && seg.length === 2) {
    const patch = {};
    ['title','description','priority','status'].forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
    if (body.dueDate !== undefined) patch.due_date = body.dueDate || null;
    if (body.assignedTo !== undefined) patch.assigned_to = body.assignedTo || null;
    if (body.departmentId !== undefined) patch.department_id = body.departmentId || null;
    const { data, error } = await supabase.from('tasks').update(patch).eq('id', seg[1])
      .select('*, assignee:profiles!assigned_to(id,name,email), creator:profiles!created_by(id,name), dept:departments(id,name)').single();
    if (error) fail(400, error.message);
    return { task: data };
  }
  if (method === 'DELETE' && seg[0] === 'tasks' && seg.length === 2) {
    const { error } = await supabase.from('tasks').delete().eq('id', seg[1]);
    if (error) fail(400, error.message);
    return { ok: true };
  }
  if (head === 'GET /tasks' && seg[1] === 'stats') {
    const { data, error } = await supabase.rpc('get_task_stats');
    if (error) fail(400, error.message);
    return { stats: data };
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

  return fail(404, `No Supabase route for ${method} ${path}`);
}
