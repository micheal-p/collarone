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

// Main entry — mirrors the shape of the real api() client. Responses are
// deep-cloned so the UI never holds live references into the demo db —
// otherwise a later unshift() mutates an array React already has in state
// and the UI double-counts (the duplicated-invoice bug).
export async function demoApi(path, opts = {}) {
  const result = await demoApiInner(path, opts);
  try { return structuredClone(result); } catch { return JSON.parse(JSON.stringify(result)); }
}

async function demoApiInner(path, opts = {}) {
  await new Promise((r) => setTimeout(r, 130)); // tiny latency so it feels real
  const method = (opts.method || 'GET').toUpperCase();
  const body = opts.body || {};
  const seg = path.split('?')[0].split('/').filter(Boolean);
  // Normalise generated user-id segments (id = 'u' + 7 chars, see mk()) to
  // /:id. The length floor of 5 is load-bearing: without it the literal
  // resource name `/users` (u + 'sers', 4 chars) is itself rewritten to /:id,
  // which 404s the whole Admin → Users page in demo mode.
  const route = `${method} /${seg.join('/')}`.replace(/\/(u[a-z0-9]{5,})(\/|$)/, '/:id$2');

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
    case route === 'POST /auth/forgot-password':
      return { ok: true }; // demo has no email backend — always neutral-success
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


  // ---- inventory & assets (demo-enabled suite: full sample stock) ----
  if (seg[0] === 'inventory') {
    const me = requireAuth();
    const irid = (pfx) => pfx + Math.random().toString(36).slice(2, 8);
    const iNow = () => new Date().toISOString();
    const activeStaff = db.users.filter((u) => u.status === 'active');

    if (!db.invWarehouses) {
      db.invWarehouses = [
        { id: 'wh1', name: 'Main store — Ikeja', location: 'Ikeja, Lagos' },
        { id: 'wh2', name: 'Warehouse — Trade Fair', location: 'Ojo, Lagos' },
      ];
      db.invItems = [
        { id: 'it1', sku: 'RICE-50KG', name: 'Rice — 50kg bag', unit: 'bags', category: 'Food', reorder_level: 10, for_sale: true, for_staff_use: false, notes: '', levels: [{ warehouse_id: 'wh1', quantity: 34 }, { warehouse_id: 'wh2', quantity: 12 }] },
        { id: 'it2', sku: 'OIL-25L', name: 'Vegetable oil — 25L', unit: 'kegs', category: 'Food', reorder_level: 8, for_sale: true, for_staff_use: false, notes: '', levels: [{ warehouse_id: 'wh1', quantity: 6 }] },
        { id: 'it3', sku: 'HELMET', name: 'Safety helmet', unit: 'pieces', category: 'Equipment', reorder_level: 4, for_sale: false, for_staff_use: true, notes: '', levels: [{ warehouse_id: 'wh1', quantity: 10 }] },
        { id: 'it4', sku: 'DRILL-M', name: 'Makita drill', unit: 'pieces', category: 'Equipment', reorder_level: 1, for_sale: false, for_staff_use: true, notes: '', levels: [{ warehouse_id: 'wh1', quantity: 3 }] },
      ];
      db.invMovements = [
        { id: 'mv1', item: { id: 'it1', name: 'Rice — 50kg bag' }, warehouse: { id: 'wh1', name: 'Main store — Ikeja' }, type: 'in', quantity: 40, reference: 'GRN-0004', notes: '', author: { name: activeStaff[0]?.name }, created_at: iNow() },
      ];
      db.invReservations = [
        { id: 'rs1', item: { id: 'it1', name: 'Rice — 50kg bag' }, item_id: 'it1', warehouse: { id: 'wh1', name: 'Main store — Ikeja' }, warehouse_id: 'wh1', quantity: 5, reference: 'Order ORD-2201', notes: '', hold_until: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), status: 'held', created_at: iNow() },
      ];
      db.invTakeouts = [
        { id: 'tk1', item: { id: 'it4', name: 'Makita drill', unit: 'pieces' }, item_id: 'it4', warehouse_id: 'wh1', quantity: 1, staff_id: activeStaff[1]?.id, staff: { id: activeStaff[1]?.id, name: activeStaff[1]?.name }, approved_by: me.id, approver: { id: me.id, name: me.name }, status: 'approved', notes: 'Site job — Lekki', created_at: new Date(Date.now() - 5 * 86400000).toISOString(), returned_at: null },
      ];
      save();
    }

    const applyLevel = (itemId, whId, delta) => {
      const it = db.invItems.find((x) => x.id === itemId); if (!it) return;
      let lvl = it.levels.find((l) => l.warehouse_id === whId);
      if (!lvl) { lvl = { warehouse_id: whId, quantity: 0 }; it.levels.push(lvl); }
      lvl.quantity = Math.max(0, Number(lvl.quantity) + delta);
    };

    if (route === 'GET /inventory/items') return { items: db.invItems };
    if (route === 'POST /inventory/items') {
      const it = { id: irid('it'), sku: (body.sku || '').toUpperCase(), name: body.name || '', unit: body.unit || 'unit', category: body.category || '', reorder_level: Number(body.reorderLevel) || 0, for_sale: body.forSale !== false, for_staff_use: Boolean(body.forStaffUse), notes: body.notes || '', levels: [] };
      db.invItems.unshift(it); save(); return { item: it };
    }
    if (method === 'DELETE' && seg[1] === 'items') { db.invItems = db.invItems.filter((x) => x.id !== seg[2]); save(); return { ok: true }; }
    if (route === 'GET /inventory/warehouses') return { warehouses: db.invWarehouses };
    if (route === 'POST /inventory/warehouses') {
      const w = { id: irid('wh'), name: body.name || '', location: body.location || '' };
      db.invWarehouses.push(w); save(); return { warehouse: w };
    }
    if (route === 'GET /inventory/movements') return { movements: db.invMovements };
    if (route === 'POST /inventory/movements') {
      const it = db.invItems.find((x) => x.id === body.itemId);
      const wh = db.invWarehouses.find((x) => x.id === body.warehouseId);
      const qty = Number(body.quantity) || 0;
      if (body.type === 'in') applyLevel(body.itemId, body.warehouseId, qty);
      else if (body.type === 'out') applyLevel(body.itemId, body.warehouseId, -qty);
      else if (body.type === 'transfer') { applyLevel(body.itemId, body.warehouseId, -qty); if (body.toWarehouseId) applyLevel(body.itemId, body.toWarehouseId, qty); }
      else applyLevel(body.itemId, body.warehouseId, qty);
      const mv = { id: irid('mv'), item: { id: it?.id, name: it?.name }, warehouse: { id: wh?.id, name: wh?.name }, type: body.type, quantity: qty, reference: body.reference || '', notes: body.notes || '', author: { name: me.name }, created_at: iNow() };
      db.invMovements.unshift(mv); save(); return { movement: mv };
    }
    if (route === 'GET /inventory/reservations') return { reservations: db.invReservations };
    if (route === 'POST /inventory/reservations') {
      const it = db.invItems.find((x) => x.id === body.itemId);
      const wh = db.invWarehouses.find((x) => x.id === body.warehouseId);
      const r = { id: irid('rs'), item: { id: it?.id, name: it?.name }, item_id: body.itemId, warehouse: { id: wh?.id, name: wh?.name }, warehouse_id: body.warehouseId, quantity: Number(body.quantity) || 1, reference: body.reference || '', notes: body.notes || '', hold_until: body.holdUntil || null, status: 'held', created_at: iNow() };
      db.invReservations.unshift(r); save(); return { reservation: r };
    }
    if (seg[1] === 'reservations' && seg[3] === 'fulfill') {
      const r = db.invReservations.find((x) => x.id === seg[2]);
      if (r) { r.status = 'fulfilled'; r.decided_at = iNow(); applyLevel(r.item_id, r.warehouse_id, -Number(r.quantity)); save(); }
      return { reservation: r };
    }
    if (seg[1] === 'reservations' && seg[3] === 'release') {
      const r = db.invReservations.find((x) => x.id === seg[2]);
      if (r) { r.status = 'released'; r.decided_at = iNow(); save(); }
      return { reservation: r };
    }
    if (route === 'GET /inventory/takeouts') return { takeouts: db.invTakeouts };
    if (route === 'POST /inventory/takeouts') {
      const it = db.invItems.find((x) => x.id === body.itemId);
      const staff = db.users.find((x) => x.id === body.staffId);
      applyLevel(body.itemId, body.warehouseId, -Number(body.quantity || 1));
      const t = { id: irid('tk'), item: { id: it?.id, name: it?.name, unit: it?.unit }, item_id: body.itemId, warehouse_id: body.warehouseId, quantity: Number(body.quantity) || 1, staff_id: body.staffId, staff: { id: staff?.id, name: staff?.name }, approved_by: me.id, approver: { id: me.id, name: me.name }, status: 'approved', notes: body.notes || '', created_at: iNow(), returned_at: null };
      db.invTakeouts.unshift(t); save(); return { takeout: t };
    }
    if (seg[1] === 'takeouts' && seg[3] === 'return') {
      const t = db.invTakeouts.find((x) => x.id === seg[2]);
      if (t) { t.status = 'returned'; t.returned_at = iNow(); applyLevel(t.item_id, t.warehouse_id, Number(t.quantity)); save(); }
      return { takeout: t };
    }
    if (seg[1] === 'takeouts' && seg[3] === 'cancel') {
      const t = db.invTakeouts.find((x) => x.id === seg[2]);
      if (t) { t.status = 'cancelled'; applyLevel(t.item_id, t.warehouse_id, Number(t.quantity)); save(); }
      return { takeout: t };
    }
    return fail(404, `Demo API has no route for ${route}`);
  }

  // ---- payroll & benefits (full demo: rates, runs, payslips, wall, loans) ----
  if (seg[0] === 'payroll' && !['salary', 'bank'].includes(seg[1])) {
    const me = requireAuth();
    const prid = (pfx) => pfx + Math.random().toString(36).slice(2, 8);
    const pNow = () => new Date().toISOString();
    const meR = { id: me.id, name: me.name };

    // 2026 Tax Act defaults — mirrors the real seed
    db.payrollRates = db.payrollRates || {
      deductionRates: [
        { key: 'pension_employee', label: 'Pension — employee share', rate: 0.08, basis: 'pensionable' },
        { key: 'pension_employer', label: 'Pension — employer share', rate: 0.10, basis: 'pensionable' },
        { key: 'nhf', label: 'National Housing Fund', rate: 0.025, basis: 'basic' },
        { key: 'nsitf', label: 'NSITF (employer cost)', rate: 0.01, basis: 'gross' },
      ],
      payeBands: [
        { id: 'b1', min_annual: 0, max_annual: 800000, rate: 0, sort_order: 1 },
        { id: 'b2', min_annual: 800000, max_annual: 3000000, rate: 0.15, sort_order: 2 },
        { id: 'b3', min_annual: 3000000, max_annual: 12000000, rate: 0.18, sort_order: 3 },
        { id: 'b4', min_annual: 12000000, max_annual: 25000000, rate: 0.21, sort_order: 4 },
        { id: 'b5', min_annual: 25000000, max_annual: 50000000, rate: 0.23, sort_order: 5 },
        { id: 'b6', min_annual: 50000000, max_annual: null, rate: 0.25, sort_order: 6 },
      ],
    };
    const payeAnnual = (taxable) => {
      let remaining = Math.max(0, taxable); let tax = 0;
      for (const b of db.payrollRates.payeBands) {
        if (remaining <= 0) break;
        const width = (b.max_annual ?? Infinity) - b.min_annual;
        const inBand = Math.min(remaining, width);
        tax += inBand * b.rate; remaining -= inBand;
      }
      return tax;
    };

    const active = db.users.filter((u) => u.status === 'active');
    // sample salaries for the first few staff so a generated run has real rows
    db.demoSalaries = db.demoSalaries || Object.fromEntries(active.slice(0, 4).map((u, i) => [u.id, {
      basic: [250000, 180000, 420000, 150000][i], housing: [80000, 50000, 120000, 40000][i],
      transport: [40000, 30000, 60000, 25000][i], other: [30000, 0, 80000, 10000][i],
      annual_rent: [1200000, 0, 2400000, 600000][i],
    }]));
    db.payrollRuns = db.payrollRuns || [];
    db.payrollLines = db.payrollLines || {};
    db.staffLoans = db.staffLoans || [{
      id: prid('ln'), employee_id: active[1]?.id, employee: { id: active[1]?.id, name: active[1]?.name },
      loan_type: 'advance', principal: 100000, monthly_installment: 25000, reason: 'School fees support',
      status: 'active', repaid: 50000, repayments: [{ amount: 25000 }, { amount: 25000 }], created_at: pNow(),
    }];
    db.bankWall = db.bankWall || [
      { id: prid('bw'), action_type: 'new_employee', employee: { name: active[2]?.name || 'New staff' }, status: 'pending', created_at: pNow() },
      { id: prid('bw'), action_type: 'account_changed', employee: { name: active[0]?.name || 'Staff' }, status: 'pending', created_at: pNow() },
    ];

    if (route === 'GET /payroll/rates') return { deductionRates: db.payrollRates.deductionRates, payeBands: db.payrollRates.payeBands };
    if (method === 'PATCH' && seg[1] === 'rates' && seg.length === 3) {
      const r = db.payrollRates.deductionRates.find((x) => x.key === seg[2]);
      if (r) { r.rate = Number(body.rate) || r.rate; save(); }
      return { rate: r };
    }
    if (method === 'PATCH' && seg[1] === 'paye-bands' && seg.length === 3) {
      const b = db.payrollRates.payeBands.find((x) => x.id === seg[2]);
      if (b) { Object.assign(b, { rate: body.rate ?? b.rate, min_annual: body.minAnnual ?? b.min_annual, max_annual: body.maxAnnual === undefined ? b.max_annual : body.maxAnnual }); save(); }
      return { band: b };
    }
    if (route === 'GET /payroll/employees') {
      return { employees: active.map((u) => ({ id: u.id, name: u.name, email: u.email, job_title: u.jobTitle || 'Staff', payroll_state: 'active', hasSalary: Boolean(db.demoSalaries[u.id]) })) };
    }
    if (method === 'PATCH' && seg[1] === 'employees') return { ok: true };
    if (route === 'GET /payroll/runs') return { runs: db.payrollRuns };
    if (route === 'POST /payroll/runs/generate') {
      const { month, year } = body;
      if (db.payrollRuns.some((r) => r.period_month === month && r.period_year === year)) fail(400, 'A payroll run already exists for that period.');
      const run = { id: prid('run'), period_month: month, period_year: year, status: 'draft', notes: '', disbursement_reference: '', approvedBy: null, approved_at: null, released_at: null, disbursed_at: null, created_at: pNow() };
      const lines = Object.entries(db.demoSalaries).map(([uid, ss]) => {
        const u = db.users.find((x) => x.id === uid); if (!u || u.status !== 'active') return null;
        const pensionable = ss.basic + ss.housing + ss.transport;
        const gross = pensionable + ss.other;
        const pension = Math.round(pensionable * 0.08);
        const nhf = Math.round(ss.basic * 0.025);
        const rentRelief = Math.min(ss.annual_rent * 0.2, 500000);
        const paye = Math.round(payeAnnual(Math.max(0, gross * 12 - rentRelief - pension * 12 - nhf * 12)) / 12);
        const loan = db.staffLoans.filter((l) => l.employee_id === uid && l.status === 'active')
          .reduce((s2, l) => s2 + Math.min(l.monthly_installment, l.principal - (l.repaid || 0)), 0);
        return {
          id: prid('pl'), run_id: run.id, employee_id: uid, employee: { id: uid, name: u.name, email: u.email, job_title: u.jobTitle || 'Staff' },
          basic: ss.basic, housing: ss.housing, transport: ss.transport, other_allowances: ss.other, gross,
          pension_employee: pension, pension_employer: Math.round(pensionable * 0.10), nhf, nsitf: Math.round(gross * 0.01),
          paye, other_deductions: loan, net: gross - pension - nhf - paye - loan,
          bank_snapshot: { bankName: 'GTBank', accountNumber: '0123456789', accountName: u.name }, payment_status: 'unpaid', payment_note: '',
        };
      }).filter(Boolean);
      db.payrollRuns.unshift(run); db.payrollLines[run.id] = lines; save();
      return { run };
    }
    if (method === 'DELETE' && seg[1] === 'runs' && seg.length === 3) { db.payrollRuns = db.payrollRuns.filter((r) => r.id !== seg[2]); delete db.payrollLines[seg[2]]; save(); return { ok: true }; }
    if (method === 'PATCH' && seg[1] === 'runs' && seg.length === 3) {
      const r = db.payrollRuns.find((x) => x.id === seg[2]); if (!r) fail(404, 'Run not found');
      const { action, reference, notes } = body;
      if (action === 'approve') { r.status = 'approved'; r.approvedBy = meR; r.approved_at = pNow(); db.bankWall.unshift({ id: prid('bw'), action_type: 'run_approved', run: { id: r.id, period_month: r.period_month, period_year: r.period_year }, status: 'pending', created_at: pNow() }); }
      else if (action === 'release') { r.status = 'released'; r.released_at = pNow(); }
      else if (action === 'disburse') { r.status = 'disbursed'; r.disbursed_at = pNow(); r.disbursement_reference = reference || ''; }
      else if (action === 'reopen') r.status = 'draft';
      else if (notes !== undefined) r.notes = notes;
      save(); return { run: r };
    }
    if (seg[1] === 'runs' && seg[3] === 'lines') return { lines: db.payrollLines[seg[2]] || [] };
    if (method === 'PATCH' && seg[1] === 'lines' && seg.length === 3) {
      for (const lines of Object.values(db.payrollLines)) {
        const l = lines.find((x) => x.id === seg[2]);
        if (l) {
          if (body.otherDeductions !== undefined) { l.other_deductions = body.otherDeductions; l.net = l.gross - l.pension_employee - l.nhf - l.paye - l.other_deductions; }
          if (body.paymentStatus !== undefined) l.payment_status = body.paymentStatus;
          if (body.paymentNote !== undefined) l.payment_note = body.paymentNote;
          save(); return { line: l };
        }
      }
      fail(404, 'Line not found');
    }
    if (route === 'GET /payroll/mypayslips') {
      const out = [];
      for (const r of db.payrollRuns.filter((x) => x.released_at)) {
        for (const l of (db.payrollLines[r.id] || []).filter((x) => x.employee_id === me.id)) {
          out.push({ ...l, run: { id: r.id, period_month: r.period_month, period_year: r.period_year, released_at: r.released_at } });
        }
      }
      return { payslips: out };
    }
    if (route === 'GET /payroll/bankwall') return { actions: db.bankWall };
    if (method === 'PATCH' && seg[1] === 'bankwall' && seg.length === 3) {
      const a = db.bankWall.find((x) => x.id === seg[2]);
      if (a) { a.status = body.status || a.status; a.actionedBy = meR; a.actioned_at = pNow(); save(); }
      return { action: a };
    }
    if (route === 'GET /payroll/loans') return { loans: db.staffLoans };
    if (route === 'POST /payroll/loans') {
      const u = db.users.find((x) => x.id === (body.employeeId || me.id)) || me;
      const loan = { id: prid('ln'), employee_id: u.id, employee: { id: u.id, name: u.name }, loan_type: body.loanType || 'loan', principal: Number(body.principal) || 0, monthly_installment: Number(body.monthlyInstallment) || 0, reason: body.reason || '', status: 'pending', repaid: 0, repayments: [], created_at: pNow() };
      db.staffLoans.unshift(loan); save(); return { loan };
    }
    if (seg[1] === 'loans' && seg[3] === 'decide') {
      const l = db.staffLoans.find((x) => x.id === seg[2]); if (!l) fail(404, 'Loan not found');
      if (body.decision === 'approve') { l.status = 'active'; if (body.installment) l.monthly_installment = body.installment; }
      else if (body.decision === 'reject') l.status = 'rejected';
      else if (body.decision === 'cancel') l.status = 'cancelled';
      save(); return { loan: l };
    }
    return fail(404, `Demo API has no route for ${route}`);
  }

  if (seg[0] === 'hr' || (seg[0] === 'departments') || (seg[0] === 'payroll' && ['salary', 'bank'].includes(seg[1])) || seg[0] === 'attendance' || route === 'GET /tasks') {
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
      // Mutations echo a sensible structure — history itself is deterministic.
      if (method === 'PATCH' && seg.length === 3) {
        return { structure: { id: seg[2], basic: body.basic ?? 0, housing: body.housing ?? 0, transport: body.transport ?? 0, other_allowances: body.otherAllowances ?? 0, effective_date: body.effectiveDate || new Date().toISOString().slice(0, 10) } };
      }
      if (method === 'POST') {
        if (!body.employeeId) fail(400, 'employeeId is required.');
        return { structure: { id: 'sn' + Math.random().toString(36).slice(2, 8), employee_id: body.employeeId, basic: body.basic || 0, housing: body.housing || 0, transport: body.transport || 0, other_allowances: body.otherAllowances || 0, effective_date: body.effectiveDate || new Date().toISOString().slice(0, 10) } };
      }
      const i = byIdx(seg[2]);
      const basic = 250000 + i * 90000;
      return { history: [
        { id: 's1' + i, basic, housing: basic * 0.4, transport: basic * 0.2, other_allowances: 30000, effective_date: daysAgo(120).slice(0, 10) },
        { id: 's0' + i, basic: basic * 0.85, housing: basic * 0.34, transport: basic * 0.17, other_allowances: 20000, effective_date: daysAgo(480).slice(0, 10) },
      ] };
    }
    if (seg[0] === 'payroll' && seg[1] === 'bank') {
      if (method === 'DELETE' && seg.length === 3) return { ok: true };
      if (method === 'POST') {
        if (!body.employeeId || !body.bankName || !body.accountNumber || !body.accountName) fail(400, 'Employee, bank, account number and account name are required.');
        return { account: { id: 'bn' + Math.random().toString(36).slice(2, 8), employee_id: body.employeeId, bank_name: body.bankName, bank_code: body.bankCode || '', account_number: body.accountNumber, account_name: body.accountName, is_primary: body.isPrimary !== false } };
      }
      const i = byIdx(seg[2]);
      return { accounts: [{ id: 'b' + i, bank_name: ['GTBank', 'Access Bank', 'Zenith Bank', 'UBA'][i % 4], account_name: db.users[i]?.name, account_number: String(1234567890 + i * 1111111).slice(0, 10), is_primary: true }] };
    }
    if (seg[0] === 'attendance') {
      // Real shifts the demo user opens/closes persist; the backdrop of team
      // records stays deterministic (regenerated per call).
      if (!db.attShifts) { db.attShifts = []; save(); }
      const me = session.get();
      if (method === 'POST' && seg[1] === 'clockin') {
        if (db.attShifts.some((r) => r.employee_id === me.id && !r.clock_out_at)) fail(400, 'You already have an open shift — clock out first.');
        const rec = { id: 'sh' + Math.random().toString(36).slice(2, 8), employee_id: me.id, employee: { id: me.id, name: me.name, email: me.email }, clock_in_at: new Date().toISOString(), clock_out_at: null, notes: '' };
        db.attShifts.unshift(rec); save(); return { record: rec };
      }
      if (method === 'POST' && seg[1] === 'clockout') {
        const rec = db.attShifts.find((r) => r.employee_id === me.id && !r.clock_out_at) || fail(400, 'No open shift to close.');
        rec.clock_out_at = new Date().toISOString(); save(); return { record: rec };
      }
      const gen = staff.flatMap((s, si) => Array.from({ length: 8 }, (_, d) => {
        const day = d * 3 + (si % 3);
        const cin = new Date(Date.now() - day * 86400000); cin.setHours(8, 40 + si * 5, 0, 0);
        const cout = new Date(cin); cout.setHours(17, 10 + si * 7, 0, 0);
        return { id: `att${si}-${d}`, employee_id: s.id, employee: { id: s.id, name: s.name, email: s.email }, clock_in_at: cin.toISOString(), clock_out_at: d === 0 && si === 1 ? null : cout.toISOString() };
      }));
      if (method === 'PATCH' && seg[1] === 'records' && seg.length === 3) {
        const rec = db.attShifts.find((r) => r.id === seg[2]) || gen.find((r) => r.id === seg[2]) || fail(404, 'Record not found.');
        if (body.clockInAt !== undefined) rec.clock_in_at = body.clockInAt;
        if (body.clockOutAt !== undefined) rec.clock_out_at = body.clockOutAt;
        if (body.notes !== undefined) rec.notes = body.notes;
        save(); return { record: rec };
      }
      if (seg[1] === 'mine') return { records: [...db.attShifts.filter((r) => r.employee_id === me.id), ...gen.filter((r) => r.employee_id === me.id)] };
      return { records: [...db.attShifts, ...gen] };
    }
    if (route === 'GET /tasks') {
      return { tasks: staff.flatMap((s, i) => [
        { id: `t${i}a`, title: ['Quarterly stock reconciliation', 'Onboard new vendor', 'Prepare payroll inputs', 'Site visit report — Ikeja'][i % 4], status: 'in_progress', due_date: daysAgo(-3).slice(0, 10), assigned_to: s.id, assignee: { id: s.id, name: s.name } },
        { id: `t${i}b`, title: 'Weekly report', status: 'done', due_date: daysAgo(4).slice(0, 10), assigned_to: s.id, assignee: { id: s.id, name: s.name } },
      ]) };
    }
    // ---- recruiting / ATS (requisitions, pipeline, interviews) ----
    if (seg[0] === 'hr' && seg[1] === 'requisitions') {
      if (!db.atsReqs) {
        db.atsReqs = [
          { id: 'rq1', title: 'Field Sales Officer', department: { id: 1, name: 'Operations' }, department_id: 1, hiring_manager: { id: db.users[0]?.id, name: db.users[0]?.name }, headcount: 2, employment_type: 'full_time', location: 'Lagos', status: 'open', min_experience_years: 2, salary_min: 1800000, salary_max: 2400000, description: 'Own a route, grow retail accounts, report daily.', created_at: daysAgo(21) },
          { id: 'rq2', title: 'Accounts Officer', department: { id: 2, name: 'Finance' }, department_id: 2, hiring_manager: { id: db.users[0]?.id, name: db.users[0]?.name }, headcount: 1, employment_type: 'full_time', location: 'Ikeja', status: 'open', min_experience_years: 3, salary_min: 2400000, salary_max: 3000000, description: 'Reconciliations, expense posting, bank liaison support.', created_at: daysAgo(12) },
        ];
        db.atsApps = [
          { id: 'ap1', requisition_id: 'rq1', candidate: { id: 'c1', name: 'Ngozi Eze', email: 'ngozi.eze@example.com', phone: '08021110001' }, candidate_id: 'c1', stage: 'interview', rating: 4, offer_status: 'none', offer_token: 'demo-token-1', cover_letter: 'Five years selling FMCG routes in Surulere and Yaba.', created_at: daysAgo(9), updated_at: daysAgo(2) },
          { id: 'ap2', requisition_id: 'rq1', candidate: { id: 'c2', name: 'Ibrahim Musa', email: 'ibrahim.musa@example.com', phone: '08021110002' }, candidate_id: 'c2', stage: 'offer', rating: 5, offer_status: 'accepted', offer_salary: 2200000, offer_start_date: daysAgo(-14).slice(0, 10), offer_sent_at: daysAgo(3), offer_decided_at: daysAgo(1), offer_token: 'demo-token-2', created_at: daysAgo(15), updated_at: daysAgo(1) },
          { id: 'ap3', requisition_id: 'rq1', candidate: { id: 'c3', name: 'Kemi Adebayo', email: 'kemi.a@example.com', phone: '' }, candidate_id: 'c3', stage: 'applied', rating: null, offer_status: 'none', offer_token: 'demo-token-3', created_at: daysAgo(4), updated_at: daysAgo(4) },
          { id: 'ap4', requisition_id: 'rq2', candidate: { id: 'c4', name: 'Tobi Lawal', email: 'tobi.lawal@example.com', phone: '08021110004' }, candidate_id: 'c4', stage: 'screening', rating: 3, offer_status: 'none', offer_token: 'demo-token-4', created_at: daysAgo(6), updated_at: daysAgo(3) },
        ];
        db.atsIvs = [
          { id: 'iv1', application_id: 'ap1', scheduled_at: daysAgo(-2), interviewer_id: db.users[0]?.id, interviewer: { id: db.users[0]?.id, name: db.users[0]?.name }, mode: 'video', outcome: 'pending', feedback: '', scorecard: [] },
          { id: 'iv2', application_id: 'ap2', scheduled_at: daysAgo(6), interviewer_id: db.users[0]?.id, interviewer: { id: db.users[0]?.id, name: db.users[0]?.name }, mode: 'onsite', outcome: 'strong_yes', feedback: 'Sharp on numbers, great references.', scorecard: [{ k: 'skills', s: 5 }, { k: 'communication', s: 4 }, { k: 'experience', s: 5 }, { k: 'culture', s: 4 }] },
        ]; save();
      }
      if (seg.length === 2 && method === 'GET') return { requisitions: db.atsReqs };
      if (seg.length === 2 && method === 'POST') {
        const r = { id: 'rq' + Math.random().toString(36).slice(2, 7), title: body.title, department: null, department_id: body.departmentId, hiring_manager: null, headcount: body.headcount || 1, employment_type: body.employmentType || 'full_time', location: body.location || '', status: body.status || 'draft', description: body.description || '', created_at: new Date().toISOString() };
        db.atsReqs.unshift(r); save(); return { requisition: r };
      }
      if (seg.length === 3 && method === 'PATCH') { const r = db.atsReqs.find((x) => x.id === seg[2]) || fail(404, 'Not found.'); Object.assign(r, { title: body.title ?? r.title, status: body.status ?? r.status, location: body.location ?? r.location }); save(); return { requisition: r }; }
      if (seg.length === 3 && method === 'DELETE') { db.atsReqs = db.atsReqs.filter((x) => x.id !== seg[2]); save(); return { ok: true }; }
      if (seg.length === 4 && seg[3] === 'pipeline') {
        if (method === 'POST') {
          const a = { id: 'ap' + Math.random().toString(36).slice(2, 7), requisition_id: seg[2], candidate: { id: 'c' + Math.random().toString(36).slice(2, 6), name: body.name, email: body.email || '', phone: body.phone || '' }, stage: 'applied', rating: null, offer_status: 'none', offer_token: 'demo-' + Math.random().toString(36).slice(2, 8), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          db.atsApps.push(a); save(); return { application: a };
        }
        return { applications: db.atsApps.filter((a) => a.requisition_id === seg[2]) };
      }
    }
    if (seg[0] === 'hr' && seg[1] === 'applications') {
      if (seg.length === 3 && method === 'PATCH') {
        const a = db.atsApps?.find((x) => x.id === seg[2]) || fail(404, 'Not found.');
        ['stage', 'rating'].forEach((k) => { if (body[k] !== undefined) a[k] = body[k]; });
        if (body.offerStatus !== undefined) a.offer_status = body.offerStatus;
        if (body.offerSalary !== undefined) a.offer_salary = body.offerSalary;
        if (body.offerStartDate !== undefined) a.offer_start_date = body.offerStartDate;
        if (body.offerNote !== undefined) a.offer_note = body.offerNote;
        if (body.offerSentAt !== undefined) a.offer_sent_at = body.offerSentAt;
        if (body.hiredProfileId !== undefined) a.hired_profile_id = body.hiredProfileId;
        if (body.rejectionReason !== undefined) a.rejection_reason = body.rejectionReason;
        a.updated_at = new Date().toISOString(); save(); return { application: a };
      }
      if (seg.length === 4 && seg[3] === 'interviews') {
        if (method === 'POST') {
          const iv = { id: 'iv' + Math.random().toString(36).slice(2, 7), application_id: seg[2], scheduled_at: body.scheduledAt, interviewer_id: body.interviewerId, interviewer: db.users.find((u) => u.id === body.interviewerId) || { name: 'Interviewer' }, mode: body.mode || 'video', outcome: 'pending', feedback: '', scorecard: [] };
          (db.atsIvs = db.atsIvs || []).push(iv); save(); return { interview: iv };
        }
        return { interviews: (db.atsIvs || []).filter((i) => i.application_id === seg[2]) };
      }
    }
    if (seg[0] === 'hr' && seg[1] === 'interviews' && seg.length === 3 && method === 'PATCH') {
      const iv = db.atsIvs?.find((x) => x.id === seg[2]) || fail(404, 'Not found.');
      ['outcome', 'feedback', 'mode', 'scorecard'].forEach((k) => { if (body[k] !== undefined) iv[k] = body[k]; });
      save(); return { interview: iv };
    }
    if (seg[0] === 'hr' && seg[1] === 'myinterviews') return { interviews: db.atsIvs || [] };

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

  // ---- operational suites (benefits, procurement, crm, finance, documents,
  // projects, it-assets) — small seeded lists persisted via db/save() so
  // demo mutations survive a reload. Ids deliberately avoid a leading 'u'
  // (the route-normalization regex above rewrites /u…/ segments to /:id), so
  // PATCH/DELETE handlers match on seg, not `route`.
  if (['staff', 'benefits', 'procurement', 'crm', 'finance', 'documents', 'docfolders', 'projects', 'itassets', 'trade-docs', 'automation', 'compliance'].includes(seg[0])) {
    const me = requireAuth();
    const meRef = { id: me.id, name: me.name, email: me.email };
    const now = () => new Date().toISOString();
    const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
    const rid = (p) => p + Math.random().toString(36).slice(2, 8);
    const active = db.users.filter((u) => u.status === 'active');
    const uref = (u) => (u ? { id: u.id, name: u.name, email: u.email } : null);

    // shared people picker used by projects / documents / it-assets UIs
    if (route === 'GET /staff') return { staff: active.map((u) => ({ id: u.id, name: u.name, email: u.email, department_id: null })) };

    // ---- benefits ----
    if (seg[0] === 'benefits') {
      if (!db.benefitPlans) {
        db.benefitPlans = [
          { id: 'bp1', name: 'Stanbic IBTC Pension (RSA)', type: 'pension', provider: 'Stanbic IBTC', notes: '', active: true, created_at: daysAgo(400) },
          { id: 'bp2', name: 'Axa Mansard HMO — Gold', type: 'hmo', provider: 'Axa Mansard', notes: '', active: true, created_at: daysAgo(400) },
        ];
        db.benefitEnrollments = active.map((u, i) => {
          const p = db.benefitPlans[i % 2];
          return { id: 'en' + i, employee_id: u.id, employee: uref(u), plan_id: p.id, plan: { id: p.id, name: p.name, type: p.type, provider: p.provider }, status: 'active', enrollment_date: daysAgo(220).slice(0, 10), member_id: '', pfa_name: p.type === 'pension' ? 'Stanbic IBTC Pension Managers' : '', pfa_pin: '', notes: '', created_at: daysAgo(220) };
        });
        save();
      }
      const planRef = (p) => ({ id: p.id, name: p.name, type: p.type, provider: p.provider });
      if (route === 'GET /benefits/plans') return { plans: db.benefitPlans };
      if (route === 'POST /benefits/plans') {
        if (!body.name?.trim()) fail(400, 'Plan name is required.');
        const p = { id: rid('bp'), name: body.name.trim(), type: body.type || 'hmo', provider: body.provider || '', notes: body.notes || '', active: true, created_at: now() };
        db.benefitPlans.push(p); save(); return { plan: p };
      }
      if (method === 'PATCH' && seg[1] === 'plans' && seg.length === 3) {
        const p = db.benefitPlans.find((x) => x.id === seg[2]) || fail(404, 'Plan not found.');
        ['name', 'type', 'provider', 'notes', 'active'].forEach((k) => { if (body[k] !== undefined) p[k] = body[k]; });
        save(); return { plan: p };
      }
      if (method === 'DELETE' && seg[1] === 'plans' && seg.length === 3) {
        db.benefitPlans = db.benefitPlans.filter((x) => x.id !== seg[2]); save(); return { ok: true };
      }
      if (route === 'GET /benefits/enrollments') return { enrollments: db.benefitEnrollments };
      if (route === 'GET /benefits/mine') return { enrollments: db.benefitEnrollments.filter((e) => e.employee_id === me.id) };
      if (route === 'POST /benefits/enrollments') {
        if (!body.employeeId || !body.planId) fail(400, 'Employee and plan are required.');
        if (db.benefitEnrollments.some((e) => e.employee_id === body.employeeId && e.plan_id === body.planId)) fail(400, 'Employee is already enrolled in this plan.');
        const p = db.benefitPlans.find((x) => x.id === body.planId) || fail(404, 'Plan not found.');
        const e = { id: rid('en'), employee_id: body.employeeId, employee: uref(db.users.find((u) => u.id === body.employeeId)), plan_id: p.id, plan: planRef(p), status: 'active', enrollment_date: body.enrollmentDate || now().slice(0, 10), member_id: body.memberId || '', pfa_name: body.pfaName || '', pfa_pin: body.pfaPin || '', notes: body.notes || '', created_at: now() };
        db.benefitEnrollments.unshift(e); save(); return { enrollment: e };
      }
      if (method === 'PATCH' && seg[1] === 'enrollments' && seg.length === 3) {
        const e = db.benefitEnrollments.find((x) => x.id === seg[2]) || fail(404, 'Enrollment not found.');
        [['status', 'status'], ['memberId', 'member_id'], ['pfaName', 'pfa_name'], ['pfaPin', 'pfa_pin'], ['notes', 'notes']].forEach(([k, col]) => { if (body[k] !== undefined) e[col] = body[k]; });
        save(); return { enrollment: e };
      }
      if (method === 'DELETE' && seg[1] === 'enrollments' && seg.length === 3) {
        db.benefitEnrollments = db.benefitEnrollments.filter((x) => x.id !== seg[2]); save(); return { ok: true };
      }
    }

    // ---- procurement ----
    if (seg[0] === 'procurement') {
      if (!db.vendors) {
        db.vendors = [
          { id: 'vx1', name: 'TechDepot NG', contact_name: 'Sola Ajayi', phone: '08031234567', email: 'sales@techdepot.ng', address: '12 Adeola Odeku St, Victoria Island, Lagos', notes: '', created_at: daysAgo(300) },
          { id: 'vx2', name: 'Swift Office Supplies', contact_name: 'Ngozi Eze', phone: '08087654321', email: 'orders@swiftoffice.ng', address: '4 Allen Avenue, Ikeja, Lagos', notes: '', created_at: daysAgo(180) },
        ];
        const req = active[2] || active[0];
        db.purchaseRequests = [
          { id: 'pq1', requested_by: req.id, requester: uref(req), vendor_id: 'vx1', vendor: { id: 'vx1', name: 'TechDepot NG' }, department_id: 3, dept: { id: 3, name: 'Operations' }, item_description: 'Dell Latitude 5440 laptops', quantity: 2, unit_cost: 850000, vat_rate: 0.075, notes: 'Replacements for field team', status: 'pending', created_at: daysAgo(2), decided_at: null },
          { id: 'pq2', requested_by: req.id, requester: uref(req), vendor_id: 'vx2', vendor: { id: 'vx2', name: 'Swift Office Supplies' }, department_id: null, dept: null, item_description: 'A4 paper — 20 reams', quantity: 20, unit_cost: 4500, vat_rate: 0.075, notes: '', status: 'approved', created_at: daysAgo(9), decided_at: daysAgo(8) },
        ];
        save();
      }
      if (route === 'GET /procurement/vendors') return { vendors: db.vendors };
      if (route === 'POST /procurement/vendors') {
        if (!body.name?.trim()) fail(400, 'Vendor name is required.');
        const v = { id: rid('vx'), name: body.name.trim(), contact_name: body.contactName || '', phone: body.phone || '', email: body.email || '', address: body.address || '', notes: body.notes || '', created_at: now() };
        db.vendors.push(v); save(); return { vendor: v };
      }
      if (method === 'PATCH' && seg[1] === 'vendors' && seg.length === 3) {
        const v = db.vendors.find((x) => x.id === seg[2]) || fail(404, 'Vendor not found.');
        ['name', 'phone', 'email', 'address', 'notes'].forEach((k) => { if (body[k] !== undefined) v[k] = body[k]; });
        if (body.contactName !== undefined) v.contact_name = body.contactName;
        save(); return { vendor: v };
      }
      if (method === 'DELETE' && seg[1] === 'vendors' && seg.length === 3) {
        db.vendors = db.vendors.filter((x) => x.id !== seg[2]); save(); return { ok: true };
      }
      if (route === 'GET /procurement/requests') return { requests: db.purchaseRequests };
      if (route === 'POST /procurement/requests') {
        if (!body.itemDescription?.trim()) fail(400, 'Item description is required.');
        const v = db.vendors.find((x) => x.id === body.vendorId) || null;
        const r = { id: rid('pq'), requested_by: me.id, requester: meRef, vendor_id: v?.id || null, vendor: v ? { id: v.id, name: v.name } : null, department_id: body.departmentId || null, dept: null, item_description: body.itemDescription.trim(), quantity: body.quantity || 1, unit_cost: body.unitCost || 0, vat_rate: body.vatRate ?? 0.075, notes: body.notes || '', status: 'pending', created_at: now(), decided_at: null };
        db.purchaseRequests.unshift(r); save(); return { request: r };
      }
      if (method === 'PATCH' && seg[1] === 'requests' && seg.length === 3) {
        const r = db.purchaseRequests.find((x) => x.id === seg[2]) || fail(404, 'Request not found.');
        if (body.action) { r.status = body.action; r.decided_at = now(); }
        else {
          [['itemDescription', 'item_description'], ['quantity', 'quantity'], ['unitCost', 'unit_cost'], ['vatRate', 'vat_rate'], ['notes', 'notes']].forEach(([k, col]) => { if (body[k] !== undefined) r[col] = body[k]; });
          if (body.vendorId !== undefined) {
            const v = db.vendors.find((x) => x.id === body.vendorId) || null;
            r.vendor_id = v?.id || null; r.vendor = v ? { id: v.id, name: v.name } : null;
          }
        }
        save(); return { request: r };
      }
      if (method === 'DELETE' && seg[1] === 'requests' && seg.length === 3) {
        db.purchaseRequests = db.purchaseRequests.filter((x) => x.id !== seg[2]); save(); return { ok: true };
      }
    }

    // ---- crm (companies, contacts, activities, deals pipeline) ----
    if (seg[0] === 'crm') {
      // bookings + money owed — persisted demo CRUD
      if (seg[1] === 'bookings') {
        if (!db.crmBookings) {
          db.crmBookings = [
            { id: 'bk1', customer_name: 'Chidinma Okeke', phone: '08031234567', service: 'Consultation', starts_at: new Date(Date.now() + 26 * 3600000).toISOString(), duration_mins: 60, status: 'booked', notes: '' },
            { id: 'bk2', customer_name: 'Tunde Bakare', phone: '08087654321', service: 'Fitting', starts_at: new Date(Date.now() + 50 * 3600000).toISOString(), duration_mins: 45, status: 'booked', notes: '' },
          ]; save();
        }
        if (method === 'POST') {
          const b = { id: 'bk' + Math.random().toString(36).slice(2, 8), customer_name: body.customerName, phone: body.phone || '', service: body.service || '', starts_at: body.startsAt, duration_mins: body.durationMins || 60, status: 'booked', notes: body.notes || '' };
          db.crmBookings.push(b); save(); return { booking: b };
        }
        if (method === 'PATCH' && seg.length === 3) {
          const b = db.crmBookings.find((x) => x.id === seg[2]) || fail(404, 'Booking not found.');
          if (body.status !== undefined) b.status = body.status;
          if (body.notes !== undefined) b.notes = body.notes;
          save(); return { booking: b };
        }
        if (method === 'DELETE' && seg.length === 3) { db.crmBookings = db.crmBookings.filter((x) => x.id !== seg[2]); save(); return { ok: true }; }
        return { bookings: db.crmBookings };
      }
      if (seg[1] === 'receivables') {
        if (!db.crmReceivables) {
          db.crmReceivables = [
            { id: 'rc1', customer_name: 'Sunrise Foods Ltd', amount_naira: 450000, due_date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10), status: 'outstanding', note: 'March supply invoice', created_at: daysAgo(20) },
            { id: 'rc2', customer_name: 'Adaeze N.', amount_naira: 120000, due_date: new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10), status: 'part_paid', note: 'Balance on project', created_at: daysAgo(10) },
          ]; save();
        }
        if (method === 'POST') {
          const r = { id: 'rc' + Math.random().toString(36).slice(2, 8), customer_name: body.customerName, amount_naira: Number(body.amountNaira), due_date: body.dueDate || null, status: 'outstanding', note: body.note || '', created_at: new Date().toISOString() };
          db.crmReceivables.unshift(r); save(); return { receivable: r };
        }
        if (method === 'PATCH' && seg.length === 3) {
          const r = db.crmReceivables.find((x) => x.id === seg[2]) || fail(404, 'Not found.');
          if (body.status !== undefined) r.status = body.status;
          save(); return { receivable: r };
        }
        if (method === 'DELETE' && seg.length === 3) { db.crmReceivables = db.crmReceivables.filter((x) => x.id !== seg[2]); save(); return { ok: true }; }
        return { receivables: db.crmReceivables };
      }
      const contactRef = (c) => (c ? { id: c.id, name: c.name, email: c.email, phone: c.phone, whatsapp: c.whatsapp } : null);
      const companyRef = (c) => (c ? { id: c.id, name: c.name } : null);
      if (!db.crmCompanies) {
        db.crmCompanies = [{ id: 'co1', name: 'Sunrise Foods Ltd', industry: 'FMCG distribution', phone: '08033214567', email: 'info@sunrisefoods.ng', website: 'https://sunrisefoods.ng', address: 'Plot 8, Oregun Industrial Estate, Ikeja', notes: '', created_at: daysAgo(60) }];
        db.crmContacts = [
          { id: 'ct1', name: 'Tunde Bakare', company_id: 'co1', company: { id: 'co1', name: 'Sunrise Foods Ltd' }, job_title: 'Procurement Manager', email: 'tunde@sunrisefoods.ng', phone: '08051112233', whatsapp: '08051112233', notes: '', created_at: daysAgo(45) },
          { id: 'ct2', name: 'Halima Yusuf', company_id: null, company: null, job_title: 'Founder, Halyu Stores', email: 'halima@halyustores.ng', phone: '08094445566', whatsapp: '08094445566', notes: 'Met at Lagos SME fair', created_at: daysAgo(20) },
        ];
        db.crmActivities = [
          { id: 'ac1', contact_id: 'ct1', contact: contactRef(db.crmContacts[0]), company_id: 'co1', company: { id: 'co1', name: 'Sunrise Foods Ltd' }, type: 'call', notes: 'Intro call — wants bulk pricing before month end.', occurred_at: daysAgo(1), replied_at: null, follow_up_at: daysAgo(-1), author: uref(db.users[0]), created_at: daysAgo(1) },
          { id: 'ac2', contact_id: 'ct2', contact: contactRef(db.crmContacts[1]), company_id: null, company: null, type: 'whatsapp', notes: 'Sent price list and delivery terms.', occurred_at: daysAgo(5), replied_at: daysAgo(4), follow_up_at: null, author: uref(db.users[0]), created_at: daysAgo(5) },
        ];
        db.crmDeals = [
          { id: 'dl1', title: 'Sunrise Foods — Q3 bulk supply', contact_id: 'ct1', contact: contactRef(db.crmContacts[0]), company_id: 'co1', company: { id: 'co1', name: 'Sunrise Foods Ltd' }, value_naira: 4500000, stage: 'proposal', expected_close: daysAgo(-21).slice(0, 10), notes: '', created_at: daysAgo(12), updated_at: daysAgo(3) },
          { id: 'dl2', title: 'Halyu Stores starter order', contact_id: 'ct2', contact: contactRef(db.crmContacts[1]), company_id: null, company: null, value_naira: 850000, stage: 'lead', expected_close: null, notes: '', created_at: daysAgo(6), updated_at: daysAgo(6) },
          { id: 'dl3', title: 'Staff canteen supply contract', contact_id: 'ct1', contact: contactRef(db.crmContacts[0]), company_id: 'co1', company: { id: 'co1', name: 'Sunrise Foods Ltd' }, value_naira: 2200000, stage: 'won', expected_close: daysAgo(10).slice(0, 10), notes: '', created_at: daysAgo(40), updated_at: daysAgo(10) },
        ];
        save();
      }
      if (route === 'GET /crm/companies') return { companies: db.crmCompanies };
      if (route === 'POST /crm/companies') {
        if (!body.name?.trim()) fail(400, 'Company name is required.');
        const c = { id: rid('co'), name: body.name.trim(), industry: body.industry || '', phone: body.phone || '', email: body.email || '', website: body.website || '', address: body.address || '', notes: body.notes || '', created_at: now() };
        db.crmCompanies.push(c); save(); return { company: c };
      }
      if (method === 'PATCH' && seg[1] === 'companies' && seg.length === 3) {
        const c = db.crmCompanies.find((x) => x.id === seg[2]) || fail(404, 'Company not found.');
        ['name', 'industry', 'phone', 'email', 'website', 'address', 'notes'].forEach((k) => { if (body[k] !== undefined) c[k] = body[k]; });
        save(); return { company: c };
      }
      if (method === 'DELETE' && seg[1] === 'companies' && seg.length === 3) {
        db.crmCompanies = db.crmCompanies.filter((x) => x.id !== seg[2]); save(); return { ok: true };
      }
      if (route === 'GET /crm/contacts') return { contacts: db.crmContacts };
      if (route === 'POST /crm/contacts') {
        if (!body.name?.trim()) fail(400, 'Contact name is required.');
        const co = db.crmCompanies.find((x) => x.id === body.companyId) || null;
        const c = { id: rid('ct'), name: body.name.trim(), company_id: co?.id || null, company: companyRef(co), job_title: body.jobTitle || '', email: body.email || '', phone: body.phone || '', whatsapp: body.whatsapp || '', notes: body.notes || '', created_at: now() };
        db.crmContacts.push(c); save(); return { contact: c };
      }
      if (method === 'PATCH' && seg[1] === 'contacts' && seg.length === 3) {
        const c = db.crmContacts.find((x) => x.id === seg[2]) || fail(404, 'Contact not found.');
        [['name', 'name'], ['jobTitle', 'job_title'], ['email', 'email'], ['phone', 'phone'], ['whatsapp', 'whatsapp'], ['notes', 'notes']].forEach(([k, col]) => { if (body[k] !== undefined) c[col] = body[k]; });
        if (body.companyId !== undefined) {
          const co = db.crmCompanies.find((x) => x.id === body.companyId) || null;
          c.company_id = co?.id || null; c.company = companyRef(co);
        }
        save(); return { contact: c };
      }
      if (method === 'DELETE' && seg[1] === 'contacts' && seg.length === 3) {
        db.crmContacts = db.crmContacts.filter((x) => x.id !== seg[2]); save(); return { ok: true };
      }
      if (route === 'GET /crm/activities') {
        const contactId = (path.match(/contactId=([^&]*)/) || [])[1];
        const companyId = (path.match(/companyId=([^&]*)/) || [])[1];
        let list = db.crmActivities;
        if (contactId) list = list.filter((a) => a.contact_id === contactId);
        if (companyId) list = list.filter((a) => a.company_id === companyId);
        return { activities: list };
      }
      if (route === 'POST /crm/activities') {
        if (!body.contactId && !body.companyId) fail(400, 'Link this activity to a contact or company.');
        const ct = db.crmContacts.find((x) => x.id === body.contactId) || null;
        const co = db.crmCompanies.find((x) => x.id === body.companyId) || null;
        const a = { id: rid('ac'), contact_id: ct?.id || null, contact: contactRef(ct), company_id: co?.id || null, company: companyRef(co), type: body.type || 'note', notes: body.notes || '', occurred_at: body.occurredAt || now(), replied_at: null, follow_up_at: null, author: meRef, created_at: now() };
        db.crmActivities.unshift(a); save(); return { activity: a };
      }
      if (method === 'PATCH' && seg[1] === 'activities' && seg[2]) {
        const a = db.crmActivities.find((x) => x.id === seg[2]) || fail(404, 'Activity not found.');
        if (body.replied !== undefined) a.replied_at = body.replied ? now() : null;
        if (body.followUpAt !== undefined) a.follow_up_at = body.followUpAt;
        if (body.notes !== undefined) a.notes = body.notes;
        save(); return { activity: a };
      }
      if (method === 'DELETE' && seg[1] === 'activities' && seg.length === 3) {
        db.crmActivities = db.crmActivities.filter((x) => x.id !== seg[2]); save(); return { ok: true };
      }
      if (route === 'GET /crm/deals') return { deals: db.crmDeals };
      if (route === 'POST /crm/deals') {
        if (!body.title?.trim()) fail(400, 'Deal title is required.');
        const ct = db.crmContacts.find((x) => x.id === body.contactId) || null;
        const co = db.crmCompanies.find((x) => x.id === body.companyId) || null;
        const d = { id: rid('dl'), title: body.title.trim(), contact_id: ct?.id || null, contact: contactRef(ct), company_id: co?.id || null, company: companyRef(co), value_naira: Number(body.valueNaira) || 0, stage: body.stage || 'lead', expected_close: body.expectedClose || null, notes: body.notes || '', created_at: now(), updated_at: now() };
        db.crmDeals.unshift(d); save(); return { deal: d };
      }
      if (method === 'PATCH' && seg[1] === 'deals' && seg.length === 3) {
        const d = db.crmDeals.find((x) => x.id === seg[2]) || fail(404, 'Deal not found.');
        if (body.title !== undefined) d.title = body.title;
        if (body.valueNaira !== undefined) d.value_naira = Number(body.valueNaira) || 0;
        if (body.stage !== undefined) d.stage = body.stage;
        if (body.expectedClose !== undefined) d.expected_close = body.expectedClose || null;
        if (body.notes !== undefined) d.notes = body.notes;
        if (body.contactId !== undefined) {
          const ct = db.crmContacts.find((x) => x.id === body.contactId) || null;
          d.contact_id = ct?.id || null; d.contact = contactRef(ct);
        }
        if (body.companyId !== undefined) {
          const co = db.crmCompanies.find((x) => x.id === body.companyId) || null;
          d.company_id = co?.id || null; d.company = companyRef(co);
        }
        d.updated_at = now(); save(); return { deal: d };
      }
      if (method === 'DELETE' && seg[1] === 'deals' && seg.length === 3) {
        db.crmDeals = db.crmDeals.filter((x) => x.id !== seg[2]); save(); return { ok: true };
      }
    }

    // ---- finance (expenses, categories, budgets) ----
    if (seg[0] === 'finance') {
      if (!db.expenseCategories) {
        db.expenseCategories = [
          { id: 'fc1', name: 'Office Supplies', created_at: daysAgo(200) },
          { id: 'fc2', name: 'Travel & Transport', created_at: daysAgo(200) },
        ];
        const sub = active[1] || active[0];
        db.expenses = [
          { id: 'exp1', category_id: 'fc1', category: { id: 'fc1', name: 'Office Supplies' }, department_id: null, dept: null, vendor: 'Swift Office Supplies', description: 'Printer toner and stationery', amount: 86500, vat_rate: 0.075, expense_date: daysAgo(3).slice(0, 10), notes: '', receipt_path: null, status: 'pending', submitted_by: sub.id, submitter: uref(sub), created_at: daysAgo(3) },
          { id: 'exp2', category_id: 'fc2', category: { id: 'fc2', name: 'Travel & Transport' }, department_id: null, dept: null, vendor: 'Uber', description: 'Client visits — Ikeja to Victoria Island', amount: 24300, vat_rate: 0, expense_date: daysAgo(8).slice(0, 10), notes: '', receipt_path: null, status: 'approved', submitted_by: sub.id, submitter: uref(sub), created_at: daysAgo(8) },
          { id: 'exp3', category_id: 'fc1', category: { id: 'fc1', name: 'Office Supplies' }, department_id: null, dept: null, vendor: 'Chicken Republic', description: 'Team lunch — Q2 close', amount: 65000, vat_rate: 0.075, expense_date: daysAgo(15).slice(0, 10), notes: '', receipt_path: null, status: 'paid', submitted_by: sub.id, submitter: uref(sub), created_at: daysAgo(15) },
        ];
        db.budgets = [];
        save();
      }
      const catRef = (c) => (c ? { id: c.id, name: c.name } : null);
      if (route === 'GET /finance/categories') return { categories: db.expenseCategories };
      if (route === 'POST /finance/categories') {
        if (!body.name?.trim()) fail(400, 'Category name is required.');
        if (db.expenseCategories.some((c) => c.name.toLowerCase() === body.name.trim().toLowerCase())) fail(400, 'That category already exists.');
        const c = { id: rid('fc'), name: body.name.trim(), created_at: now() };
        db.expenseCategories.push(c); save(); return { category: c };
      }
      if (route === 'GET /finance/expenses') return { expenses: db.expenses };
      if (route === 'POST /finance/expenses') {
        if (!body.description?.trim()) fail(400, 'Description is required.');
        const cat = db.expenseCategories.find((c) => c.id === body.categoryId) || null;
        const e = { id: rid('exp'), category_id: cat?.id || null, category: catRef(cat), department_id: body.departmentId || null, dept: null, vendor: body.vendor || '', description: body.description.trim(), amount: body.amount || 0, vat_rate: body.vatRate ?? 0.075, expense_date: body.expenseDate || now().slice(0, 10), notes: body.notes || '', receipt_path: body.receiptPath || null, status: 'pending', submitted_by: me.id, submitter: meRef, created_at: now() };
        db.expenses.unshift(e); save(); return { expense: e };
      }
      if (method === 'PATCH' && seg[1] === 'expenses' && seg.length === 3) {
        const e = db.expenses.find((x) => x.id === seg[2]) || fail(404, 'Expense not found.');
        if (body.action) { e.status = body.action; }
        else {
          [['vendor', 'vendor'], ['description', 'description'], ['amount', 'amount'], ['vatRate', 'vat_rate'], ['notes', 'notes'], ['expenseDate', 'expense_date']].forEach(([k, col]) => { if (body[k] !== undefined) e[col] = body[k]; });
          if (body.categoryId !== undefined) {
            const cat = db.expenseCategories.find((c) => c.id === body.categoryId) || null;
            e.category_id = cat?.id || null; e.category = catRef(cat);
          }
        }
        save(); return { expense: e };
      }
      if (method === 'DELETE' && seg[1] === 'expenses' && seg.length === 3) {
        db.expenses = db.expenses.filter((x) => x.id !== seg[2]); save(); return { ok: true };
      }
      if (route === 'GET /finance/budgets') return { budgets: db.budgets };
      if (route === 'POST /finance/budgets') {
        if (!body.periodYear || !body.amount) fail(400, 'Period year and amount are required.');
        const cat = db.expenseCategories.find((c) => c.id === body.categoryId) || null;
        const b = { id: rid('bg'), department_id: body.departmentId || null, dept: null, category_id: cat?.id || null, category: catRef(cat), period_year: body.periodYear, period_month: body.periodMonth || null, amount: body.amount, notes: body.notes || '', created_at: now() };
        db.budgets.unshift(b); save(); return { budget: b };
      }
      if (method === 'DELETE' && seg[1] === 'budgets' && seg.length === 3) {
        db.budgets = db.budgets.filter((x) => x.id !== seg[2]); save(); return { ok: true };
      }
    }

    // ---- documents (files metadata + folders; storage itself is disabled) ----
    if (seg[0] === 'docfolders' || seg[0] === 'documents') {
      if (!db.docFolders) {
        db.docFolders = [
          { id: 'fd1', name: 'Company Policies', parent_folder_id: null, created_at: daysAgo(120) },
          { id: 'fd2', name: 'Templates', parent_folder_id: null, created_at: daysAgo(120) },
        ];
        db.documents = [
          { id: 'doc1', name: 'Employee Handbook 2026.pdf', folder_id: 'fd1', folder: { id: 'fd1', name: 'Company Policies' }, file_path: 'demo/handbook.pdf', file_size: 482133, visibility: 'org', current_version: 1, created_by: db.users[0].id, author: uref(db.users[0]), created_at: daysAgo(90), updated_at: daysAgo(90) },
          { id: 'doc2', name: 'Letterhead Template.docx', folder_id: 'fd2', folder: { id: 'fd2', name: 'Templates' }, file_path: 'demo/letterhead.docx', file_size: 88214, visibility: 'org', current_version: 2, created_by: db.users[0].id, author: uref(db.users[0]), created_at: daysAgo(60), updated_at: daysAgo(40) },
        ];
        save();
      }
      if (route === 'GET /docfolders') return { folders: db.docFolders };
      if (route === 'POST /docfolders') {
        if (!body.name?.trim()) fail(400, 'Folder name is required.');
        const f = { id: rid('fd'), name: body.name.trim(), parent_folder_id: body.parentFolderId || null, created_at: now() };
        db.docFolders.push(f); save(); return { folder: f };
      }
      if (method === 'DELETE' && seg[0] === 'docfolders' && seg.length === 2) {
        db.docFolders = db.docFolders.filter((x) => x.id !== seg[1]);
        db.documents.forEach((d) => { if (d.folder_id === seg[1]) { d.folder_id = null; d.folder = null; } });
        save(); return { ok: true };
      }
      if (route === 'GET /documents') return { documents: db.documents };
      // storage-backed calls fail gracefully in demo
      if (method === 'POST' && seg[0] === 'documents' && (seg.length === 1 || seg[2] === 'versions')) fail(400, 'Uploads are disabled in demo mode.');
      if (method === 'PATCH' && seg[0] === 'documents' && seg.length === 2) {
        const d = db.documents.find((x) => x.id === seg[1]) || fail(404, 'Document not found.');
        if (body.name !== undefined) d.name = body.name;
        if (body.folderId !== undefined) {
          const f = db.docFolders.find((x) => x.id === body.folderId) || null;
          d.folder_id = f?.id || null; d.folder = f ? { id: f.id, name: f.name } : null;
        }
        if (body.visibility !== undefined) d.visibility = body.visibility;
        d.updated_at = now(); save(); return { document: d };
      }
      if (method === 'DELETE' && seg[0] === 'documents' && seg.length === 2) {
        db.documents = db.documents.filter((x) => x.id !== seg[1]); save(); return { ok: true };
      }
      if (method === 'GET' && seg[2] === 'versions') {
        const d = db.documents.find((x) => x.id === seg[1]) || fail(404, 'Document not found.');
        return { versions: Array.from({ length: d.current_version || 1 }, (_, i) => ({ id: `dv-${d.id}-${i}`, document_id: d.id, version: (d.current_version || 1) - i, file_path: d.file_path, file_size: d.file_size, notes: i ? '' : 'Current version', uploaded_by: d.created_by, uploader: { id: d.created_by, name: d.author?.name }, created_at: i ? d.created_at : d.updated_at })) };
      }
      if (method === 'GET' && seg[2] === 'permissions') return { permissions: (db.docPermissions || []).filter((p) => p.document_id === seg[1]) };
      if (method === 'POST' && seg[2] === 'permissions') {
        if (!body.userId) fail(400, 'userId is required.');
        db.docPermissions = db.docPermissions || [];
        if (db.docPermissions.some((p) => p.document_id === seg[1] && p.user_id === body.userId)) fail(400, 'That person already has access.');
        const p = { id: rid('dp'), document_id: seg[1], user_id: body.userId, user: uref(db.users.find((u) => u.id === body.userId)), granted_by: me.id, created_at: now() };
        db.docPermissions.push(p); save(); return { permission: p };
      }
      if (method === 'DELETE' && seg[2] === 'permissions' && seg.length === 4) {
        db.docPermissions = (db.docPermissions || []).filter((p) => !(p.document_id === seg[1] && p.user_id === seg[3])); save(); return { ok: true };
      }
    }

    // ---- projects (project, members, milestones, tasks board) ----
    if (seg[0] === 'projects') {
      if (!db.projects) {
        const owner = db.users[0];
        const a = (i) => active[i % active.length];
        db.projects = [{ id: 'pj1', name: 'Website Revamp', description: 'Relaunch the corporate site with the new brand.', status: 'active', owner_id: owner.id, owner: uref(owner), start_date: daysAgo(30).slice(0, 10), target_date: daysAgo(-45).slice(0, 10), created_at: daysAgo(30) }];
        db.projectMembers = active.slice(0, 3).map((u, i) => ({ id: 'pm' + i, project_id: 'pj1', user_id: u.id, role: i === 0 ? 'lead' : 'member', user: uref(u) }));
        db.projectMilestones = [];
        db.projectTasks = [
          { id: 'pt1', project_id: 'pj1', title: 'Audit current site content', description: '', status: 'done', priority: 'medium', due_date: daysAgo(20).slice(0, 10), assigned_to: a(1).id, assignee: uref(a(1)), milestone_id: null, milestone: null, created_at: daysAgo(28) },
          { id: 'pt2', project_id: 'pj1', title: 'New homepage design', description: 'Hero, services grid, testimonials.', status: 'in_review', priority: 'high', due_date: daysAgo(2).slice(0, 10), assigned_to: a(2).id, assignee: uref(a(2)), milestone_id: null, milestone: null, created_at: daysAgo(24) },
          { id: 'pt3', project_id: 'pj1', title: 'Migrate blog posts', description: '', status: 'in_progress', priority: 'medium', due_date: daysAgo(-7).slice(0, 10), assigned_to: a(3).id, assignee: uref(a(3)), milestone_id: null, milestone: null, created_at: daysAgo(18) },
          { id: 'pt4', project_id: 'pj1', title: 'Set up analytics and uptime checks', description: '', status: 'todo', priority: 'low', due_date: daysAgo(-14).slice(0, 10), assigned_to: a(0).id, assignee: uref(a(0)), milestone_id: null, milestone: null, created_at: daysAgo(10) },
        ];
        save();
      }
      if (route === 'GET /projects') return { projects: db.projects };
      if (route === 'POST /projects') {
        if (!body.name?.trim()) fail(400, 'Project name is required.');
        const p = { id: rid('pj'), name: body.name.trim(), description: body.description || '', status: 'active', owner_id: me.id, owner: meRef, start_date: body.startDate || null, target_date: body.targetDate || null, created_at: now() };
        db.projects.unshift(p);
        db.projectMembers.push({ id: rid('pm'), project_id: p.id, user_id: me.id, role: 'lead', user: meRef });
        save(); return { project: p };
      }
      if (method === 'PATCH' && seg.length === 2) {
        const p = db.projects.find((x) => x.id === seg[1]) || fail(404, 'Project not found.');
        ['name', 'description', 'status'].forEach((k) => { if (body[k] !== undefined) p[k] = body[k]; });
        if (body.startDate !== undefined) p.start_date = body.startDate || null;
        if (body.targetDate !== undefined) p.target_date = body.targetDate || null;
        save(); return { project: p };
      }
      if (method === 'DELETE' && seg.length === 2) {
        db.projects = db.projects.filter((x) => x.id !== seg[1]);
        db.projectTasks = db.projectTasks.filter((t) => t.project_id !== seg[1]);
        db.projectMembers = db.projectMembers.filter((m) => m.project_id !== seg[1]);
        db.projectMilestones = db.projectMilestones.filter((m) => m.project_id !== seg[1]);
        save(); return { ok: true };
      }
      if (method === 'GET' && seg[2] === 'members') return { members: db.projectMembers.filter((m) => m.project_id === seg[1]) };
      if (method === 'POST' && seg[2] === 'members') {
        if (!body.userId) fail(400, 'userId is required.');
        if (db.projectMembers.some((m) => m.project_id === seg[1] && m.user_id === body.userId)) fail(400, 'That person is already a member.');
        const m = { id: rid('pm'), project_id: seg[1], user_id: body.userId, role: body.role || 'member', user: uref(db.users.find((u) => u.id === body.userId)) };
        db.projectMembers.push(m); save(); return { member: m };
      }
      if (method === 'DELETE' && seg[2] === 'members' && seg.length === 4) {
        db.projectMembers = db.projectMembers.filter((m) => !(m.project_id === seg[1] && m.user_id === seg[3])); save(); return { ok: true };
      }
      if (method === 'GET' && seg[2] === 'milestones') return { milestones: db.projectMilestones.filter((m) => m.project_id === seg[1]) };
      if (method === 'POST' && seg[2] === 'milestones') {
        if (!body.title?.trim()) fail(400, 'Milestone title is required.');
        const m = { id: rid('ml'), project_id: seg[1], title: body.title.trim(), status: 'open', due_date: body.dueDate || null, sort_order: body.sortOrder || 0, created_at: now() };
        db.projectMilestones.push(m); save(); return { milestone: m };
      }
      if (method === 'PATCH' && seg[2] === 'milestones' && seg.length === 4) {
        const m = db.projectMilestones.find((x) => x.id === seg[3]) || fail(404, 'Milestone not found.');
        [['title', 'title'], ['status', 'status'], ['sortOrder', 'sort_order']].forEach(([k, col]) => { if (body[k] !== undefined) m[col] = body[k]; });
        if (body.dueDate !== undefined) m.due_date = body.dueDate || null;
        save(); return { milestone: m };
      }
      if (method === 'DELETE' && seg[2] === 'milestones' && seg.length === 4) {
        db.projectMilestones = db.projectMilestones.filter((x) => x.id !== seg[3]); save(); return { ok: true };
      }
      if (method === 'GET' && seg[2] === 'tasks') return { tasks: db.projectTasks.filter((t) => t.project_id === seg[1]) };
      if (method === 'POST' && seg[2] === 'tasks') {
        if (!body.title?.trim()) fail(400, 'Task title is required.');
        const ms = db.projectMilestones.find((x) => x.id === body.milestoneId) || null;
        const t = { id: rid('pt'), project_id: seg[1], title: body.title.trim(), description: body.description || '', status: 'todo', priority: body.priority || 'medium', due_date: body.dueDate || null, assigned_to: body.assignedTo || null, assignee: uref(db.users.find((u) => u.id === body.assignedTo)), milestone_id: ms?.id || null, milestone: ms ? { id: ms.id, title: ms.title } : null, created_at: now() };
        db.projectTasks.unshift(t); save(); return { task: t };
      }
      if (method === 'PATCH' && seg[2] === 'tasks' && seg.length === 4) {
        const t = db.projectTasks.find((x) => x.id === seg[3]) || fail(404, 'Task not found.');
        ['title', 'description', 'status', 'priority'].forEach((k) => { if (body[k] !== undefined) t[k] = body[k]; });
        if (body.dueDate !== undefined) t.due_date = body.dueDate || null;
        if (body.assignedTo !== undefined) {
          t.assigned_to = body.assignedTo || null;
          t.assignee = uref(db.users.find((u) => u.id === body.assignedTo));
        }
        if (body.milestoneId !== undefined) {
          const ms = db.projectMilestones.find((x) => x.id === body.milestoneId) || null;
          t.milestone_id = ms?.id || null; t.milestone = ms ? { id: ms.id, title: ms.title } : null;
        }
        save(); return { task: t };
      }
      if (method === 'DELETE' && seg[2] === 'tasks' && seg.length === 4) {
        db.projectTasks = db.projectTasks.filter((x) => x.id !== seg[3]); save(); return { ok: true };
      }
    }

    // ---- it-assets (register, lifecycle actions, per-asset history) ----
    if (seg[0] === 'itassets') {
      if (!db.itAssets) {
        const holders = active.slice(0, 3);
        db.itAssets = holders.map((u, i) => ({
          id: 'as' + (i + 1), asset_tag: `CLR-00${i + 1}`, name: ['MacBook Air M2', 'Dell Latitude 5440', 'iPhone 13'][i], category: ['Laptop', 'Laptop', 'Phone'][i], serial_number: '', purchase_date: daysAgo(300 + i * 90).slice(0, 10), purchase_cost: [1250000, 890000, 610000][i], status: 'in_use', assigned_to: u.id, employee: uref(u), notes: '', created_at: daysAgo(300 + i * 90),
        }));
        db.itHistory = db.itAssets.flatMap((a, i) => [
          { id: `ih${i}a`, asset_id: a.id, action: 'assigned', employee_id: a.assigned_to, employee: { id: a.employee.id, name: a.employee.name }, notes: 'Issued on onboarding', author: uref(db.users[0]), created_at: daysAgo(200 + i * 30) },
          { id: `ih${i}b`, asset_id: a.id, action: 'note', employee_id: null, employee: null, notes: 'Added to asset register', author: uref(db.users[0]), created_at: daysAgo(300 + i * 90) },
        ]);
        save();
      }
      if (route === 'GET /itassets/assets') return { assets: db.itAssets };
      if (method === 'GET' && seg[1] === 'history' && seg.length === 3) return { history: db.itHistory.filter((h) => h.asset_id === seg[2]) };
      if (route === 'POST /itassets/assets') {
        if (!body.assetTag?.trim() || !body.name?.trim()) fail(400, 'Asset tag and name are required.');
        if (db.itAssets.some((a) => a.asset_tag === body.assetTag.trim())) fail(400, 'That asset tag is already in use.');
        const a = { id: rid('as'), asset_tag: body.assetTag.trim(), name: body.name.trim(), category: body.category || 'other', serial_number: body.serialNumber || '', purchase_date: body.purchaseDate || null, purchase_cost: body.purchaseCost || null, status: 'spare', assigned_to: null, employee: null, notes: '', created_at: now() };
        db.itAssets.unshift(a); save(); return { asset: a };
      }
      if (method === 'PATCH' && seg[1] === 'assets' && seg.length === 3) {
        const a = db.itAssets.find((x) => x.id === seg[2]) || fail(404, 'Asset not found.');
        [['name', 'name'], ['category', 'category'], ['serialNumber', 'serial_number'], ['purchaseDate', 'purchase_date'], ['purchaseCost', 'purchase_cost']].forEach(([k, col]) => { if (body[k] !== undefined) a[col] = body[k]; });
        const act = body.action;
        if (!act && body.notes !== undefined) a.notes = body.notes;
        if (act === 'assign') { a.status = 'in_use'; a.assigned_to = body.employeeId; a.employee = uref(db.users.find((u) => u.id === body.employeeId)); }
        if (act === 'return') { a.status = 'spare'; a.assigned_to = null; a.employee = null; }
        if (act === 'repair') a.status = 'repair';
        if (act === 'retire') { a.status = 'retired'; a.assigned_to = null; a.employee = null; }
        if (act) {
          db.itHistory.unshift({ id: rid('ih'), asset_id: a.id, action: { assign: 'assigned', return: 'returned', repair: 'repaired', retire: 'retired' }[act] || 'note', employee_id: body.employeeId || null, employee: body.employeeId ? uref(db.users.find((u) => u.id === body.employeeId)) : null, notes: body.notes || '', author: meRef, created_at: now() });
        }
        save(); return { asset: a };
      }
      if (method === 'DELETE' && seg[1] === 'assets' && seg.length === 3) {
        db.itAssets = db.itAssets.filter((x) => x.id !== seg[2]);
        db.itHistory = db.itHistory.filter((h) => h.asset_id !== seg[2]);
        save(); return { ok: true };
      }
    }

    // ---- trade documents (invoice / receipt / GRN / SRP) ----
    // ---- compliance calendar (rules mirror supabase/compliance.sql seeds) ----
    if (seg[0] === 'compliance') {
      db.compliancePrefs = db.compliancePrefs || [];
      db.complianceMarks = db.complianceMarks || [];
      const RULES = [
        { key: 'paye', title: 'PAYE remittance', authority: 'State IRS (e.g. LIRS)', description: 'Remit PAYE deducted from staff salaries to the state tax authority. Due by the 10th of the month after payroll.', frequency: 'monthly', due_day: 10, default_month: null, info_url: '', sort_order: 10 },
        { key: 'vat', title: 'VAT filing & remittance', authority: 'FIRS', description: 'File the VAT return and remit 7.5% VAT collected — due by the 21st of the following month, even for nil months.', frequency: 'monthly', due_day: 21, default_month: null, info_url: '', sort_order: 20 },
        { key: 'wht', title: 'Withholding tax remittance', authority: 'FIRS / State IRS', description: 'Remit WHT deducted from vendor payments by the 21st of the following month.', frequency: 'monthly', due_day: 21, default_month: null, info_url: '', sort_order: 30 },
        { key: 'pension', title: 'Pension remittance', authority: 'PenCom / your PFAs', description: 'Remit 8% + 10% pension contributions within 7 working days of paying salaries.', frequency: 'monthly', due_day: 7, default_month: null, info_url: '', sort_order: 40 },
        { key: 'nhf', title: 'NHF remittance', authority: 'FMBN', description: 'Remit the 2.5% National Housing Fund deduction within one month.', frequency: 'monthly', due_day: 28, default_month: null, info_url: '', sort_order: 50 },
        { key: 'nsitf', title: 'NSITF ECS contribution', authority: 'NSITF', description: 'Remit the 1% Employee Compensation Scheme contribution monthly.', frequency: 'monthly', due_day: 15, default_month: null, info_url: '', sort_order: 60 },
        { key: 'paye_annual', title: 'PAYE annual returns', authority: 'State IRS', description: 'File employer annual PAYE returns by 31 January for the previous year.', frequency: 'annual', due_day: 31, default_month: 1, info_url: '', sort_order: 70 },
        { key: 'cac_annual', title: 'CAC annual returns', authority: 'CAC', description: 'File the company annual return with the CAC — set the month that matches your incorporation anniversary.', frequency: 'annual', due_day: 30, default_month: null, info_url: '', sort_order: 80 },
        { key: 'cit', title: 'Companies Income Tax', authority: 'FIRS', description: 'File CIT self-assessment within 6 months of your financial year end.', frequency: 'annual', due_day: 30, default_month: 6, info_url: '', sort_order: 90 },
      ];
      if (route === 'GET /compliance') return { rules: RULES, prefs: db.compliancePrefs, marks: db.complianceMarks };
      if (route === 'POST /compliance/prefs') {
        db.compliancePrefs = db.compliancePrefs.filter((p) => p.rule_key !== body.ruleKey);
        const pref = { rule_key: body.ruleKey, enabled: body.enabled !== false, annual_month: body.annualMonth ?? null, annual_day: body.annualDay ?? null, note: body.note || '' };
        db.compliancePrefs.push(pref); save(); return { pref };
      }
      if (route === 'POST /compliance/marks') {
        const mark = { id: rid('cm'), rule_key: body.ruleKey, period: body.period, note: body.note || '', done_by: me.id, doer: meRef, done_at: now() };
        db.complianceMarks.unshift(mark); save(); return { mark };
      }
      if (seg[1] === 'marks' && seg.length === 3) { db.complianceMarks = db.complianceMarks.filter((m) => m.id !== seg[2]); save(); return { ok: true }; }
      return fail(404, `Demo API has no route for ${route}`);
    }

    if (seg[0] === 'trade-docs') {
      // receivables additions — payments are demo-local
      db.tradeDocPayments = db.tradeDocPayments || [];
      if (seg[2] === 'meta' && method === 'POST') { const d = (db.tradeDocs || []).find((x) => x.id === seg[1]); if (d) { d.meta = body.meta || {}; save(); } return { document: d }; }
      if (seg[2] === 'payments' && method === 'GET') return { payments: db.tradeDocPayments.filter((p) => p.doc_id === seg[1]) };
      if (seg[2] === 'payments' && method === 'POST') {
        const d = (db.tradeDocs || []).find((x) => x.id === seg[1]);
        if (!d) return fail(404, 'Document not found');
        const pay = { id: rid('tp'), doc_id: d.id, amount: Number(body.amount) || 0, method: body.payMethod || 'transfer', reference: body.reference || '', note: body.note || '', paid_at: now(), recorder: meRef };
        db.tradeDocPayments.unshift(pay);
        d.amount_paid = (Number(d.amount_paid) || 0) + pay.amount;
        d.status = d.amount_paid >= d.total ? 'paid' : 'part_paid';
        save(); return { document: d };
      }
      db.tradeDocs = db.tradeDocs || [];
      db.tradeDocSettings = db.tradeDocSettings || null;
      const PREFIX = { invoice: 'INV', receipt: 'RCT', grn: 'GRN', srp: 'SRP', handover: 'HOV', return_note: 'RTN' };
      if (route === 'GET /trade-docs/settings') return { settings: db.tradeDocSettings };
      if (route === 'POST /trade-docs/settings') {
        db.tradeDocSettings = {
          id: db.tradeDocSettings?.id || rid('tds'),
          company_name: body.companyName || '', address: body.address || '', tagline: body.tagline || '',
          phone: body.phone || '', email: body.email || '', logo_url: body.logoUrl || '',
          accent_color: body.accentColor || '#0A0E1A', signature_name: body.signatureName || '',
          signature_title: body.signatureTitle || '', signature_url: body.signatureUrl || '',
          template_key: body.templateKey || 'classic',
        };
        save(); return { settings: db.tradeDocSettings };
      }
      if (route === 'GET /trade-docs') return { documents: db.tradeDocs };
      if (route === 'POST /trade-docs') {
        const items = body.items || [];
        const subtotal = items.reduce((s, it) => s + (Number(it.qty ?? it.quantity) || 0) * (Number(it.unit_price ?? it.unitPrice ?? it.rate ?? 0)), 0);
        const vat_rate = body.vatRate ?? 0.075;
        const vat_amount = subtotal * vat_rate;
        const type = body.docType || 'invoice';
        const seq = db.tradeDocs.filter((d) => d.doc_type === type).length + 1;
        const doc = {
          id: rid('td'), doc_type: type, doc_no: `${PREFIX[type] || 'DOC'}-${String(seq).padStart(4, '0')}`,
          party_name: body.partyName || '', party_phone: body.partyPhone || '', party_email: body.partyEmail || '',
          party_address: body.partyAddress || '', items, subtotal, vat_rate, vat_amount, total: subtotal + vat_amount,
          status: 'issued', due_date: body.dueDate || null, reference: body.reference || '', notes: body.notes || '',
          contact: null, vendor: null, warehouse: null, author: meRef, created_at: now(), meta: {}, amount_paid: 0,
        };
        db.tradeDocs.unshift(doc); save(); return { document: doc };
      }
      if (method === 'PATCH' && seg.length === 2) {
        const d = db.tradeDocs.find((x) => x.id === seg[1]);
        if (d) { d.status = body.status || d.status; save(); }
        return { document: d };
      }
      if (method === 'DELETE' && seg.length === 2) {
        db.tradeDocs = db.tradeDocs.filter((x) => x.id !== seg[1]); save(); return { ok: true };
      }
    }

    // ---- automation settings + run history ----
    if (seg[0] === 'automation') {
      db.automationSettings = db.automationSettings || [];
      db.automationRuns = db.automationRuns || [];
      if (route === 'GET /automation/settings') return { settings: db.automationSettings };
      if (route === 'POST /automation/settings') {
        let row = db.automationSettings.find((s) => s.key === body.key);
        if (!row) { row = { id: rid('as'), key: body.key, enabled: !!body.enabled, config: body.config || {} }; db.automationSettings.push(row); }
        else { row.enabled = !!body.enabled; row.config = body.config || {}; }
        save(); return { setting: row };
      }
      if (route === 'GET /automation/runs') return { runs: db.automationRuns };
    }
  }

  // Payroll runs list (Banking Wall). Empty in demo — shows the clean
  // "no runs yet" state instead of a route-missing toast.
  // Billing renewals — demo has no real subscription to extend
  if (route === 'POST /billing/renew') return fail(400, 'Renewals are disabled in demo mode.');

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
