// Mirrors server/src/config/suites.js. The SERVER is authoritative for access in
// real mode; in demo mode this list also drives the mock API.
// `desc` is the full sentence — it runs on the marketing page, the suite
// header and the demo chooser, where the detail sells the thing. `short` is
// the launcher-tile line only. They are separate because the two jobs pull in
// opposite directions: the long copy ranged from 41 to 191 characters, which
// on a 4-across grid of equal-width tiles produced visibly ragged rows.
export const SUITES = [
  // Two relationship fields, different jobs:
  //  • requires: a HARD, PAID dependency — this module can't function without
  //    the named one, so picking it auto-adds that foundation AND the customer
  //    pays for it (it counts as a suite). Payroll/Leave/Attendance all run on
  //    employee records that live in HR, so they require 'hr'. Enforced in the
  //    price estimator, signup, and server-side. See requiredFoundations().
  //  • companions: a soft "comes along when granted" convenience in the STAFF
  //    access picker (not about billing). HR files letters into Documents, etc.
  { key: 'hr',          name: 'HR & Staff',         tier: 'core',     status: 'live', short: 'Staff records, files, letters and org chart.', desc: 'Everything about each staff member in one place, files, letters, hiring and org chart.', companions: ['documents'] },
  { key: 'leave',       name: 'Leave Management',   tier: 'core',     status: 'live', short: 'Requests, approvals and balance tracking.', desc: 'Requests, approvals and balance tracking.', requires: ['hr'] },
  { key: 'tasks',       name: 'Task & Report',      tier: 'core',     status: 'live', short: 'Assign work and see who has done what.', desc: 'Give jobs to staff, mark what’s urgent, and see who’s done what.' },
  { key: 'visitors',    name: 'Visitor Management', tier: 'core',     status: 'live', short: 'Front-desk check-in, host alerts and logs.', desc: 'Front-desk check-in, host alerts, visitor logs.' },
  { key: 'payroll',     name: 'Payroll & Benefits', tier: 'core',     status: 'live', short: 'Tax-compliant pay runs, payslips and benefits.', desc: '2026 Tax Act payroll runs, payslips, staff loans, plus HMO, pension/PFA and custom benefits, set differently for each staff member.', requires: ['hr'] },
  { key: 'crm',         name: 'Customers (CRM)',    tier: 'core',     status: 'live', short: 'Contacts, deals and money owed, WhatsApp-first.', desc: 'Contacts, deals, bookings and money owed, WhatsApp-first.' },
  { key: 'attendance',  name: 'Time & Attendance',  tier: 'extended', status: 'live', short: 'Clock in and out, timesheets for payroll.', desc: 'Clock in and out with location, from a phone or a wall device, with timesheets you export for payroll.', requires: ['hr'] },
  { key: 'procurement', name: 'Buying (Procurement)', tier: 'extended', status: 'live', short: 'Purchase requests, suppliers and approvals.', desc: 'Ask to buy things, track suppliers, and get approvals.' },
  { key: 'inventory',   name: 'Inventory & Assets', tier: 'extended', status: 'live', short: 'Stock counts, equipment sign-outs and returns.', desc: 'Track what you sell and the equipment your staff use, stock counts, sign-outs and returns.' },
  { key: 'finance',     name: 'Finance',            tier: 'extended', status: 'live', short: 'Expenses, budgets, bank reconciliation, ledger.', desc: 'Expenses with receipts, budgets, bank statement import and reconciliation, and a full double-entry ledger with trial balance, profit & loss and balance sheet.' },
  { key: 'projects',    name: 'Projects',           tier: 'extended', status: 'live', short: 'Plan jobs in stages and track them on a board.', desc: 'Plan jobs in stages, track them on a board, work as a team.' },
  { key: 'documents',   name: 'Documents',          tier: 'extended', status: 'live', short: 'Store files, track changes, control access.', desc: 'Keep files safe, track changes, and control who sees what.' },
  { key: 'trade-docs',  name: 'Invoicing & Trade Docs', tier: 'extended', status: 'live', short: 'Invoices paid from a link, receipts and notes.', desc: 'Invoices customers pay from a link, plus receipts, money owed, delivery notes and stock passes.' },
  { key: 'automation',  name: 'Automation',         tier: 'extended', status: 'live', short: 'Rules that run reminders, approvals and alerts.', desc: 'Rules that run your busywork, auto-assign tasks, approvals, reminders and alerts.' },
  { key: 'compliance',  name: 'Compliance Calendar', tier: 'extended', status: 'live', short: 'Nigerian tax and pension deadlines, month by month.', desc: 'Nigerian statutory deadlines — PAYE, VAT, pension, NHF, CAC — listed per month with what you have already remitted ticked off.' },
];

// Tools every workspace gets for free, deliberately OUTSIDE the SUITES catalog.
//
// This separation is load-bearing, not cosmetic: the renewal engine prices an
// org off how many SUITES it holds (best_plan_kobo() / the Landing estimator),
// so anything that lands in SUITES becomes billable and can push a customer
// into a higher tier. A pinned tool must therefore NEVER be added to SUITES,
// never appear in a suite grant, and never reach the price math — it is simply
// included. `test/pinned_tools_not_priced.mjs` fails the build if that ever
// stops being true. `path` is a real route, not `/suite/<key>`.
export const PINNED_TOOLS = [
  {
    key: 'chat',
    name: 'Team Chat',
    path: '/chat',
    desc: 'Talk to your team where the work is, one General room, one per department, and @mentions that notify.',
    short: 'Rooms per department, with @mentions that notify.',
    icon: 'chat',
    tint: '#1b3a6b',
  },
];

// Mirrors server/src/config/suites.js for presentation. The SERVER is authoritative
// for access; this only adds per-tile visuals (icon key + accent tint).
//
// The tints are not decoration and are not free-choice. Colour encodes which
// FAMILY a suite belongs to, matching the sidebar groups: people & pay are
// greens, sales & money are blues, stock & buying are ambers, work is violet,
// and visitors / compliance / automation are deliberate one-offs. So two tiles
// that look similar are similar, and two that look different are different.
//
// Before this, payroll and automation were the SAME hex, and five unrelated
// suites were near-identical greens. Rules for changing one:
//   - no two suites share a hex;
//   - white glyph on the tint stays above 3:1;
//   - a pair from DIFFERENT families must be clearly distinguishable, well
//     clear of the light grey a locked tile uses.
// test/suite_palette.mjs enforces all three.
export const SUITE_META = {
  hr:          { icon: 'people',    tint: '#065f46' },
  leave:       { icon: 'calendar',  tint: '#059669' },
  tasks:       { icon: 'check',      tint: '#4f46e5' },
  visitors:    { icon: 'badge',      tint: '#be185d' },
  payroll:     { icon: 'wallet',     tint: '#166534' },
  crm:         { icon: 'contacts',   tint: '#1d4ed8' },
  attendance:  { icon: 'clock',      tint: '#4d7c0f' },
  procurement: { icon: 'cart',       tint: '#a16207' },
  inventory:   { icon: 'box',        tint: '#b45309' },
  finance:     { icon: 'coins',      tint: '#0e7490' },
  projects:    { icon: 'kanban',     tint: '#7e22ce' },
  documents:   { icon: 'doc',        tint: '#3730a3' },
  'trade-docs':{ icon: 'receipt',    tint: '#0369a1' },
  automation:  { icon: 'bolt',       tint: '#44403c' },
  compliance:  { icon: 'shield',     tint: '#b91c1c' },
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
// shortLabel is explicit rather than derived. Signup used to render
// label.split(' — ')[0], which quietly made the punctuation in the copy load
// bearing: change the dash and the heading breaks.
export const FAMILIES = [
  { key: 'people', shortLabel: 'People',        label: 'People, run your staff' },
  { key: 'sales',  shortLabel: 'Sales & money', label: 'Sales & money, sell and get paid' },
  { key: 'stock',  shortLabel: 'Stock & buying', label: 'Stock & buying, goods in and out' },
  { key: 'work',   shortLabel: 'Work',          label: 'Work, get things done' },
  { key: 'extra',  shortLabel: 'Front desk',    label: 'Front desk & extras' },
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

// Suites that may be granted IN BULK (imports, department templates, multi-
// select grants). The line: anything exposing org-wide money or other people's
// personal files — HR, Payroll, Finance, Benefits, Documents, Buying,
// Invoicing — is NEVER bulk-grantable; those are deliberate, person-by-person
// grants. Bulk paths also force each suite's base (non-manager) role.
// Mirrored server-side in client/api/admin.js — keep the two lists identical.
export const BULK_SAFE_SUITES = ['leave', 'tasks', 'visitors', 'attendance', 'projects', 'crm', 'inventory', 'it-assets'];

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
