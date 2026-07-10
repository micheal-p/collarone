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
      return fail(404, `Demo API has no route for ${route}`);
  }
}
