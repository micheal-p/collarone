// ---------------------------------------------------------------------------
// Demo backend — a self-contained mock API backed by localStorage so the whole
// UI is testable with NO server. Free-pass sign-in + clean signup.
// Enabled by default; set VITE_DEMO_MODE=false to use the real backend.
// ---------------------------------------------------------------------------
import { SUITES } from '../config/suites.js';

const DB_KEY = 'orgops_demo_db_v1';
const SESSION_KEY = 'orgops_demo_session';
const KEYS = SUITES.map((s) => s.key);

function seed() {
  return {
    users: [
      mk({ name: 'System Administrator', email: 'admin@collarone-demo.app', password: 'ChangeMe!2026', role: 'super_admin', jobTitle: 'System Administrator', department: 'IT' }),
      mk({ name: 'Amaka Obi', email: 'amaka@collarone-demo.app', password: 'Welcome!2026', role: 'staff', jobTitle: 'HR Manager', department: 'People Ops', suites: [{ key: 'hr', role: 'manager' }] }),
      mk({ name: 'Bola Adeyemi', email: 'bola@collarone-demo.app', password: 'Welcome!2026', role: 'manager', jobTitle: 'Operations Lead', department: 'Operations', suites: [{ key: 'tasks', role: 'manager' }, { key: 'visitors', role: 'member' }] }),
      mk({ name: 'Chidi Okafor', email: 'chidi@collarone-demo.app', password: 'Welcome!2026', role: 'staff', jobTitle: 'Field Officer', department: 'Logistics', suites: [{ key: 'leave', role: 'member' }] }),
    ],
  };
}

function mk(p) {
  return {
    id: 'u' + Math.random().toString(36).slice(2, 9),
    name: p.name,
    email: (p.email || '').toLowerCase().trim(),
    password: p.password || 'demo',
    role: p.role || 'staff',
    jobTitle: p.jobTitle || '',
    department: p.department || '',
    suites: cleanSuites(p.suites || []),
    status: 'active',
    mustChangePassword: p.mustChangePassword ?? false,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
  };
}

function load() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  const s = seed();
  localStorage.setItem(DB_KEY, JSON.stringify(s));
  return s;
}
let db = load();
const save = () => localStorage.setItem(DB_KEY, JSON.stringify(db));

function cleanSuites(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const g of arr) {
    if (!KEYS.includes(g?.key) || seen.has(g.key)) continue;
    seen.add(g.key);
    out.push({ key: g.key, role: g.role === 'manager' ? 'manager' : 'member' });
  }
  return out;
}

const pub = (u) => { const { password, ...rest } = u; return { ...rest, id: u.id }; };
const fail = (status, message) => { const e = new Error(message); e.status = status; e.code = 'demo'; throw e; };
const nameFromEmail = (e) =>
  e.split('@')[0].split(/[._-]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || 'Demo User';

const session = {
  get: () => db.users.find((u) => u.id === localStorage.getItem(SESSION_KEY)) || null,
  set: (u) => localStorage.setItem(SESSION_KEY, u.id),
  clear: () => localStorage.removeItem(SESSION_KEY),
};
const requireAuth = () => session.get() || fail(401, 'Authentication required.');
const requireAdmin = () => { const u = requireAuth(); if (u.role !== 'super_admin') fail(403, 'You do not have permission to perform this action.'); return u; };
const issue = (u) => ({ accessToken: 'demo.' + u.id, user: pub(u) });

function suiteTiles(u) {
  return SUITES.map((s) => {
    const grant = u.suites.find((g) => g.key === s.key);
    const granted = u.role === 'super_admin' || Boolean(grant);
    return { ...s, granted, suiteRole: u.role === 'super_admin' ? 'manager' : grant?.role || null, openable: granted && s.status === 'live' };
  });
}

// Main entry — mirrors the shape of the real api() client.
export async function demoApi(path, opts = {}) {
  await new Promise((r) => setTimeout(r, 130)); // tiny latency so it feels real
  const method = (opts.method || 'GET').toUpperCase();
  const body = opts.body || {};
  const seg = path.split('?')[0].split('/').filter(Boolean);
  const route = `${method} /${seg.join('/')}`.replace(/\/(u[a-z0-9]+)(\/|$)/, '/:id$2');

  switch (true) {
    // ---- auth ----
    case route === 'POST /auth/login': {
      const email = (body.email || '').toLowerCase().trim();
      if (!email) fail(400, 'Email is required.');
      let u = db.users.find((x) => x.email === email);
      if (!u) { u = mk({ name: nameFromEmail(email), email, password: body.password, role: 'super_admin' }); db.users.unshift(u); } // free pass
      if (u.status !== 'active') fail(403, 'Your account has been disabled.');
      u.lastLoginAt = new Date().toISOString(); save();
      session.set(u);
      return issue(u);
    }
    case route === 'POST /auth/signup': {
      const email = (body.email || '').toLowerCase().trim();
      if (!body.name || !email) fail(400, 'Name and email are required.');
      let u = db.users.find((x) => x.email === email);
      if (!u) { u = mk({ name: body.name.trim(), email, password: body.password, role: 'super_admin' }); db.users.unshift(u); save(); }
      session.set(u);
      return issue(u);
    }
    case route === 'POST /auth/refresh': {
      const u = session.get();
      return u ? issue(u) : fail(401, 'No active session.');
    }
    case route === 'POST /auth/logout':
      session.clear(); return { ok: true };
    case route === 'POST /auth/change-password': {
      const u = requireAuth();
      if (!body.newPassword || body.newPassword.length < 8) fail(400, 'New password must be at least 8 characters.');
      u.password = body.newPassword; u.mustChangePassword = false; save();
      return { ok: true };
    }

    // ---- me / catalog ----
    case route === 'GET /me':
      return { user: pub(requireAuth()) };
    case route === 'GET /me/suites': {
      const u = requireAuth();
      return { suites: suiteTiles(u), isSystemAdmin: u.role === 'super_admin' };
    }
    case route === 'GET /catalog':
      requireAuth(); return { suites: SUITES };

    // ---- suite gating ----
    case method === 'GET' && seg[0] === 'suites' && seg.length === 2: {
      const u = requireAuth();
      const meta = SUITES.find((s) => s.key === seg[1]);
      if (!meta) fail(404, 'Unknown suite.');
      const grant = u.suites.find((g) => g.key === seg[1]);
      if (u.role !== 'super_admin' && !grant) fail(403, 'You have not been granted access to this suite.');
      return { suite: meta, access: { role: u.role === 'super_admin' ? 'manager' : grant?.role || 'member', enteredBy: u.email } };
    }

    // ---- admin: users ----
    case route === 'GET /users':
      requireAdmin(); return { users: db.users.map(pub) };
    case route === 'POST /users': {
      requireAdmin();
      const email = (body.email || '').toLowerCase().trim();
      if (!body.name || !email || !body.password) fail(400, 'Name, email and password are required.');
      if (body.password.length < 8) fail(400, 'Temporary password must be at least 8 characters.');
      if (db.users.find((x) => x.email === email)) fail(409, 'A user with this email already exists.');
      const u = mk({ ...body, email, suites: body.role === 'super_admin' ? [] : body.suites, mustChangePassword: true });
      db.users.unshift(u); save();
      return { user: pub(u) };
    }
    case method === 'PATCH' && seg[0] === 'users' && seg.length === 2: {
      requireAdmin();
      const u = db.users.find((x) => x.id === seg[1]) || fail(404, 'User not found.');
      ['name', 'jobTitle', 'department', 'role'].forEach((k) => { if (body[k] !== undefined) u[k] = body[k]; });
      save(); return { user: pub(u) };
    }
    case method === 'PUT' && seg[0] === 'users' && seg[2] === 'suites': {
      requireAdmin();
      const u = db.users.find((x) => x.id === seg[1]) || fail(404, 'User not found.');
      u.suites = cleanSuites(body.suites); save();
      return { user: pub(u) };
    }
    case method === 'PATCH' && seg[0] === 'users' && seg[2] === 'status': {
      const admin = requireAdmin();
      if (seg[1] === admin.id) fail(400, 'You cannot change your own account status.');
      const u = db.users.find((x) => x.id === seg[1]) || fail(404, 'User not found.');
      if (!['active', 'disabled'].includes(body.status)) fail(400, 'Invalid status.');
      u.status = body.status; save();
      return { user: pub(u) };
    }
    case method === 'POST' && seg[0] === 'users' && seg[2] === 'reset-password': {
      requireAdmin();
      const u = db.users.find((x) => x.id === seg[1]) || fail(404, 'User not found.');
      if (!body.password || body.password.length < 8) fail(400, 'Temporary password must be at least 8 characters.');
      u.password = body.password; u.mustChangePassword = true; save();
      return { ok: true };
    }

    default:
      // ---- HR suite + Employee 360 demo data --------------------------------
  // Enough believable, deterministic data that the HR directory and the
  // Employee 360 record render fully in demo mode. Derived from db.users so
  // ids always line up; regenerated per call (nothing persisted).
  if (seg[0] === 'hr' || (seg[0] === 'departments') || (seg[0] === 'payroll' && ['salary', 'bank'].includes(seg[1])) || (seg[0] === 'attendance' && seg[1] === 'records') || (seg[0] === 'itassets' && seg[1] === 'assets') || (seg[0] === 'benefits' && seg[1] === 'enrollments') || route === 'GET /tasks') {
    requireAuth();
    const DEPTS = [{ id: 1, name: 'IT' }, { id: 2, name: 'People Ops' }, { id: 3, name: 'Operations' }, { id: 4, name: 'Logistics' }];
    const ET = ['full_time', 'full_time', 'contract', 'full_time'];
    const staff = db.users.filter((u) => u.status === 'active').map((u, i) => {
      const dept = DEPTS.find((d) => d.name === u.department) || DEPTS[i % DEPTS.length];
      const managerId = u.role === 'super_admin' ? null : db.users[0].id;
      return {
        id: u.id, name: u.name, email: u.email, phone: `080${(31111111 + i * 1234567) % 100000000}`,
        jobTitle: u.jobTitle, role: u.role, avatarUrl: null,
        departmentId: dept.id, deptName: dept.name,
        managerId, manager: managerId ? { id: managerId, name: db.users[0].name } : null,
        employmentType: ET[i % ET.length],
        startDate: new Date(Date.now() - (200 + i * 260) * 86400000).toISOString().slice(0, 10),
      };
    });
    const byIdx = (id) => Math.max(0, db.users.findIndex((u) => u.id === id));
    const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
    const empId = (fallback) => (path.match(/employeeId=([^&]*)/) || [])[1] || fallback;

    if (route === 'GET /hr/staff') return { staff };
    if (seg[0] === 'departments') return { departments: DEPTS };
    if (seg[0] === 'payroll' && seg[1] === 'salary') {
      const i = byIdx(seg[2]);
      const basic = 250000 + i * 90000;
      return { history: [
        { id: 's1' + i, basic, housing: basic * 0.4, transport: basic * 0.2, other_allowances: 30000, effective_date: daysAgo(120).slice(0, 10) },
        { id: 's0' + i, basic: basic * 0.85, housing: basic * 0.34, transport: basic * 0.17, other_allowances: 20000, effective_date: daysAgo(480).slice(0, 10) },
      ] };
    }
    if (seg[0] === 'payroll' && seg[1] === 'bank') {
      const i = byIdx(seg[2]);
      return { accounts: [{ id: 'b' + i, bank_name: ['GTBank', 'Access Bank', 'Zenith Bank', 'UBA'][i % 4], account_name: db.users[i]?.name, account_number: String(1234567890 + i * 1111111).slice(0, 10), is_primary: true }] };
    }
    if (seg[0] === 'attendance') {
      const records = staff.flatMap((s, si) => Array.from({ length: 8 }, (_, d) => {
        const day = d * 3 + (si % 3);
        const cin = new Date(Date.now() - day * 86400000); cin.setHours(8, 40 + si * 5, 0, 0);
        const cout = new Date(cin); cout.setHours(17, 10 + si * 7, 0, 0);
        return { id: `att${si}-${d}`, employee_id: s.id, employee: { id: s.id, name: s.name, email: s.email }, clock_in_at: cin.toISOString(), clock_out_at: d === 0 && si === 1 ? null : cout.toISOString() };
      }));
      return { records };
    }
    if (seg[0] === 'itassets') {
      return { assets: staff.slice(0, 3).map((s, i) => ({ id: 'a' + i, name: ['MacBook Air M2', 'Dell Latitude 5440', 'iPhone 13'][i], category: ['Laptop', 'Laptop', 'Phone'][i], asset_tag: `CLR-00${i + 1}`, serial_number: '', status: 'in_use', assigned_to: s.id, employee: { id: s.id, name: s.name } })) };
    }
    if (seg[0] === 'benefits') {
      return { enrollments: staff.map((s, i) => ({ id: 'en' + i, employee_id: s.id, employee: { id: s.id, name: s.name }, status: 'active', plan: { id: 'p1', name: i % 2 ? 'Axa Mansard HMO — Gold' : 'Stanbic IBTC Pension (RSA)', type: i % 2 ? 'hmo' : 'pension', provider: i % 2 ? 'Axa Mansard' : 'Stanbic IBTC' } })) };
    }
    if (route === 'GET /tasks') {
      return { tasks: staff.flatMap((s, i) => [
        { id: `t${i}a`, title: ['Quarterly stock reconciliation', 'Onboard new vendor', 'Prepare payroll inputs', 'Site visit report — Ikeja'][i % 4], status: 'in_progress', due_date: daysAgo(-3).slice(0, 10), assigned_to: s.id, assignee: { id: s.id, name: s.name } },
        { id: `t${i}b`, title: 'Weekly report', status: 'done', due_date: daysAgo(4).slice(0, 10), assigned_to: s.id, assignee: { id: s.id, name: s.name } },
      ]) };
    }
    if (seg[0] === 'hr' && seg[1] === 'goals') {
      const id = empId(null);
      const mine = staff.filter((s) => !id || s.id === id);
      return { goals: mine.map((s, i) => ({ id: 'g' + i + s.id, employee_id: s.id, employee: { id: s.id, name: s.name }, title: 'Close Q3 objectives at 90%+', status: 'in_progress', target_date: daysAgo(-45).slice(0, 10) })) };
    }
    if (seg[0] === 'hr' && seg[1] === 'reviews') {
      const id = empId(null);
      const mine = staff.filter((s) => !id || s.id === id);
      return { reviews: mine.map((s, i) => ({ id: 'r' + i + s.id, employee_id: s.id, employee: { id: s.id, name: s.name }, reviewer: { id: db.users[0].id, name: db.users[0].name }, cycle_label: 'H1 2026', rating: 4, status: 'submitted', created_at: daysAgo(30) })) };
    }
    if (seg[0] === 'hr' && seg[1] === 'trainings') return { trainings: [] };
    if (seg[0] === 'hr' && seg[1] === 'documents') {
      const id = empId(null);
      const mine = staff.filter((s) => !id || s.id === id);
      return { documents: mine.flatMap((s, i) => [
        { id: 'd' + i + 'a', employee: { id: s.id, name: s.name }, title: 'Employment contract', category: 'contract', expiry_date: null, file_path: 'demo', created_at: daysAgo(300) },
        { id: 'd' + i + 'b', employee: { id: s.id, name: s.name }, title: 'Means of ID (NIN slip)', category: 'id', expiry_date: daysAgo(-200).slice(0, 10), file_path: 'demo', created_at: daysAgo(290) },
      ]) };
    }
    if (seg[0] === 'hr' && seg[1] === 'cases') return { cases: [] };

    // ---- letters engine (requests, letterheads, issued register) ----
    if (!db.letterRequests) {
      db.letterRequests = [{
        id: 'lr1', employee_id: staff[3]?.id, employee: { id: staff[3]?.id, name: staff[3]?.name, email: staff[3]?.email },
        letter_type: 'employment_verification', purpose: 'Bank account opening — GTBank', status: 'pending',
        requested_at: daysAgo(2), decided_at: null,
      }];
      db.letterheads = []; db.issuedLetters = []; save();
    }
    if (route === 'GET /hr/letters') return { letters: db.letterRequests };
    if (method === 'PATCH' && seg[1] === 'letters' && seg.length === 3) {
      const r = db.letterRequests.find((x) => x.id === seg[2]) || fail(404, 'Request not found.');
      Object.assign(r, { status: body.status, decline_reason: body.declineReason || null, decided_at: new Date().toISOString() });
      save(); return { letter: r };
    }
    if (route === 'GET /hr/letterheads') return { letterheads: db.letterheads };
    if (route === 'POST /hr/letterheads') {
      db.letterheads.forEach((x) => { x.is_default = false; });
      const lh = { id: 'lh' + Math.random().toString(36).slice(2, 8), name: body.name, mode: body.mode || 'generated', template_key: body.templateKey || 'classic', details: body.details || {}, file_path: body.filePath || null, is_default: true, created_at: new Date().toISOString() };
      db.letterheads.unshift(lh); save(); return { letterhead: lh };
    }
    if (method === 'PATCH' && seg[1] === 'letterheads' && seg.length === 3) {
      const lh = db.letterheads.find((x) => x.id === seg[2]) || fail(404, 'Letterhead not found.');
      if (body.isDefault) db.letterheads.forEach((x) => { x.is_default = x.id === lh.id; });
      if (body.name !== undefined) lh.name = body.name;
      if (body.mode !== undefined) lh.mode = body.mode;
      if (body.templateKey !== undefined) lh.template_key = body.templateKey;
      if (body.details !== undefined) lh.details = body.details;
      if (body.filePath !== undefined) lh.file_path = body.filePath;
      save(); return { letterhead: lh };
    }
    if (route === 'GET /hr/issued-letters') return { letters: db.issuedLetters };
    if (route === 'POST /hr/issued-letters') {
      const empRec = staff.find((s) => s.id === body.employeeId);
      const me = session.get();
      const l = { id: 'il' + Math.random().toString(36).slice(2, 8), employee_id: body.employeeId, employee: { id: empRec?.id, name: empRec?.name, email: empRec?.email }, letter_type: body.letterType, title: body.title, body: body.letterBody, letterhead_id: body.letterheadId || null, request_id: body.requestId || null, file_path: null, issuedBy: { id: me?.id, name: me?.name }, issued_at: new Date().toISOString() };
      db.issuedLetters.unshift(l); save(); return { letter: l };
    }

    if (seg[0] === 'hr') return fail(404, `Demo API has no route for ${route}`);
  }

  // storefront funnel — demo-safe stubs so a prospect clicking through a
  // demo store gets believable behaviour instead of a 404
  if (route === 'POST /site/order') {
    return { orderNo: `ORD-DEMO${String(Math.floor(Math.random() * 900) + 100)}`, total: (body.items || []).length * 25000, method: body.method || 'transfer',
      bank: (body.method || 'transfer') === 'transfer' ? { bankName: 'GTBank', accountName: 'Demo Store Ltd', accountNumber: '0123456789', note: 'Demo mode — no real order was placed.' } : null };
  }
  if (route === 'POST /embed/lead') return { ok: true };
  if (route === 'POST /contact') return { ok: true };
  if (route === 'GET /me/notices') return { notices: [] };
  if (/^POST \/notices\/.+\/dismiss$/.test(route)) return { ok: true };

  return fail(404, `Demo API has no route for ${route}`);
  }
}
