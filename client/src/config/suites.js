// Mirrors server/src/config/suites.js. The SERVER is authoritative for access in
// real mode; in demo mode this list also drives the mock API.
export const SUITES = [
  // Two relationship fields, different jobs:
  //  • requires: a HARD, PAID dependency — this module can't function without
  //    the named one, so picking it auto-adds that foundation AND the customer
  //    pays for it (it counts as a suite). Payroll/Leave/Attendance all run on
  //    employee records that live in HR, so they require 'hr'. Enforced in the
  //    price estimator, signup, and server-side. See requiredFoundations().
  //  • companions: a soft "comes along when granted" convenience in the STAFF
  //    access picker (not about billing). HR files letters into Documents, etc.
  { key: 'hr',          name: 'HR & Staff',         tier: 'core',     status: 'live', desc: 'Everything about each staff member in one place — files, letters, hiring and org chart.', companions: ['documents'] },
  { key: 'leave',       name: 'Leave Management',   tier: 'core',     status: 'live', desc: 'Requests, approvals and balance tracking.', requires: ['hr'] },
  { key: 'tasks',       name: 'Task & Report',      tier: 'core',     status: 'live', desc: 'Give jobs to staff, mark what’s urgent, and see who’s done what.' },
  { key: 'visitors',    name: 'Visitor Management', tier: 'core',     status: 'live', desc: 'Front-desk check-in, host alerts, visitor logs.' },
  { key: 'payroll',     name: 'Payroll & Benefits', tier: 'core',     status: 'live', desc: '2026 Tax Act payroll runs, payslips, staff loans — plus HMO, pension/PFA and custom benefits, set differently for each staff member.', requires: ['hr'] },
  { key: 'crm',         name: 'Customers (CRM)',    tier: 'core',     status: 'live', desc: 'Contacts, deals, bookings and money owed — WhatsApp-first.' },
  { key: 'attendance',  name: 'Time & Attendance',  tier: 'extended', status: 'live', desc: 'Clock in and out with location, track hours and overtime.', requires: ['hr'] },
  { key: 'procurement', name: 'Buying (Procurement)', tier: 'extended', status: 'live', desc: 'Ask to buy things, track suppliers, and get approvals.' },
  { key: 'inventory',   name: 'Inventory & Assets', tier: 'extended', status: 'live', desc: 'Track what you sell and the equipment your staff use — stock counts, sign-outs and returns.' },
  { key: 'finance',     name: 'Finance',            tier: 'extended', status: 'live', desc: 'Expenses, budgets and financial reports.' },
  { key: 'projects',    name: 'Projects',           tier: 'extended', status: 'live', desc: 'Plan jobs in stages, track them on a board, work as a team.' },
  { key: 'documents',   name: 'Documents',          tier: 'extended', status: 'live', desc: 'Keep files safe, track changes, and control who sees what.' },
  { key: 'trade-docs',  name: 'Invoicing & Trade Docs', tier: 'extended', status: 'live', desc: 'Invoices customers pay from a link — plus receipts, money owed, delivery notes and stock passes.' },
  { key: 'automation',  name: 'Automation',         tier: 'extended', status: 'live', desc: 'Rules that run your busywork — auto-assign tasks, approvals, reminders and alerts.' },
  { key: 'compliance',  name: 'Compliance Calendar', tier: 'extended', status: 'live', desc: 'Nigerian government deadlines — PAYE, VAT, pension, NHF, CAC — tracked per month, never missed.' },
];

// Mirrors server/src/config/suites.js for presentation. The SERVER is authoritative
// for access; this only adds per-tile visuals (icon key + accent tint).
export const SUITE_META = {
  hr:          { icon: 'people',    tint: '#0b6b3a' },
  leave:       { icon: 'calendar',  tint: '#1aa564' },
  tasks:       { icon: 'check',      tint: '#2b6cb0' },
  visitors:    { icon: 'badge',      tint: '#8a5cf6' },
  payroll:     { icon: 'wallet',     tint: '#b45309' },
  crm:         { icon: 'contacts',   tint: '#0e7c66' },
  attendance:  { icon: 'clock',      tint: '#0369a1' },
  procurement: { icon: 'cart',       tint: '#b7791f' },
  inventory:   { icon: 'box',        tint: '#9b2c2c' },
  finance:     { icon: 'coins',      tint: '#2f855a' },
  projects:    { icon: 'kanban',     tint: '#6b46c1' },
  documents:   { icon: 'doc',        tint: '#475569' },
  'trade-docs':{ icon: 'receipt',    tint: '#7c2d12' },
  automation:  { icon: 'bolt',       tint: '#b45309' },
  compliance:  { icon: 'shield',     tint: '#166534' },
};

export const tierLabel = { core: 'MVP Core', extended: 'Extended' };

// Hard dependency chain. Given the suites a customer picked, return the full
// paid set with every required foundation added (transitively). Picking Payroll
// pulls in HR; the customer pays for HR too. Order-stable, deduped. Use this
// everywhere a selection turns into what-they-pay-for (estimator, signup) so the
// chain is applied in exactly one place.
export const requiresOf = (key) => (SUITES.find((s) => s.key === key)?.requires) || [];

export const requiredFoundations = (keys) => {
  const out = [];
  const add = (k) => {
    if (out.includes(k)) return;
    for (const dep of requiresOf(k)) add(dep); // foundation first
    if (!out.includes(k)) out.push(k);
  };
  for (const k of keys) add(k);
  return out;
};

// The suites auto-added purely because something else required them, given a
// selection — for showing "HR added automatically (required by Payroll)".
export const addedByRequirement = (keys) =>
  requiredFoundations(keys).filter((k) => !keys.includes(k));

// Suite families — the "brothers". Used only to GROUP the picker so
// relationships are visible; each suite has one home family (functional links
// still cross families). This is presentation, not pricing — the price is
// always the plain à-la-carte total.
export const FAMILIES = [
  { key: 'people', label: 'People — run your staff' },
  { key: 'sales',  label: 'Sales & money — sell and get paid' },
  { key: 'stock',  label: 'Stock & buying — goods in and out' },
  { key: 'work',   label: 'Work — get things done' },
  { key: 'extra',  label: 'Front desk & extras' },
];
export const SUITE_FAMILY = {
  hr: 'people', payroll: 'people', leave: 'people', attendance: 'people',
  crm: 'sales', 'trade-docs': 'sales', finance: 'sales',
  inventory: 'stock', procurement: 'stock',
  tasks: 'work', projects: 'work', documents: 'work',
  visitors: 'extra', compliance: 'extra', automation: 'extra',
};

// Business-type presets — one click pre-selects a sensible starter set. The
// price is just the normal total (no discount, no cannibalisation): a guide,
// not a priced "pack". requiredFoundations() still pulls in any dependency.
export const PRESETS = [
  { key: 'shop',     label: 'Shop / Retail',    hint: 'Sell stock, invoice, track customers', suites: ['inventory', 'trade-docs', 'crm'] },
  { key: 'service',  label: 'Service business', hint: 'Clients, jobs and invoices',            suites: ['crm', 'projects', 'trade-docs'] },
  { key: 'employer', label: 'Employer / team',  hint: 'Run and pay your staff',                suites: ['hr', 'payroll', 'leave', 'attendance'] },
];

// Suites that have been through the per-org data-isolation pass (Stage 2 of
// the roadmap) and are safe to grant to an organization other than the
// founding one. Everything
// else is enforced server-side too (enforce_phase1_suite_scope() strips any
// other key on write) — this list just keeps the UI honest about it.
export const MULTI_TENANT_SAFE_SUITES = ['hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm', 'attendance', 'procurement', 'inventory', 'finance', 'projects', 'documents', 'trade-docs', 'automation', 'compliance'];

// Payroll runs Nigerian statutory deductions (PAYE, pension, NHF) — it isn't
// built for any other country's tax/pension regime yet, so it's gated to
// orgs registered in Nigeria. Enforced here for the UI and again in Postgres
// (enforce_payroll_country_scope trigger) so it can't be bypassed client-side.
export const COUNTRY_ONLY_SUITES = { payroll: ['NG'] };
export const suiteAllowedForCountry = (key, country) => !COUNTRY_ONLY_SUITES[key] || COUNTRY_ONLY_SUITES[key].includes(country || 'NG');

// Per-suite role options shown in the admin grant picker.
// Suites not listed here get the default Member / Manager pair.
export const SUITE_ROLES = {
  visitors: [
    { value: 'staff',        label: 'Staff' },
    { value: 'receptionist', label: 'Receptionist' },
    { value: 'security',     label: 'Security' },
    { value: 'management',   label: 'Management' },
  ],
};
