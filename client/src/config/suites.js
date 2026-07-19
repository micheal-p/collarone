// Mirrors server/src/config/suites.js. The SERVER is authoritative for access in
// real mode; in demo mode this list also drives the mock API.
export const SUITES = [
  // companions: suites that come along whenever this one is granted — they stay
  // separate modules (own tiles, own screens) but the paid experience is
  // connected: HR files letters into Documents, the Employee 360 reads Payroll
  // and Benefits. Granting HR auto-selects these in the grant picker.
  { key: 'hr',          name: 'HR & Staff',         tier: 'core',     status: 'live', desc: 'Employee 360 records, letters, org structure, recruiting, onboarding.', companions: ['benefits', 'payroll', 'documents'] },
  { key: 'leave',       name: 'Leave Management',   tier: 'core',     status: 'live', desc: 'Requests, approvals and balance tracking.' },
  { key: 'tasks',       name: 'Task & Report',      tier: 'core',     status: 'live', desc: 'Assignments, priorities and productivity reports.' },
  { key: 'visitors',    name: 'Visitor Management', tier: 'core',     status: 'live', desc: 'Front-desk check-in, host alerts, visitor logs.' },
  { key: 'payroll',     name: 'Payroll',            tier: 'core',     status: 'live', desc: 'Salary structures, payroll runs, statutory deductions, payslips.' },
  { key: 'crm',         name: 'CRM',                tier: 'core',     status: 'live', desc: 'Contacts, deals, bookings and money owed — WhatsApp-first.' },
  { key: 'attendance',  name: 'Time & Attendance',  tier: 'extended', status: 'live', desc: 'Geo-tagged clock-in/out, timesheets, overtime.' },
  { key: 'benefits',    name: 'Benefits',           tier: 'extended', status: 'live', desc: 'HMO, group life, pension/PFA tracking.' },
  { key: 'it-assets',   name: 'IT Assets',          tier: 'extended', status: 'live', desc: 'Asset tracking, assignment and lifecycle.' },
  { key: 'procurement', name: 'Procurement',        tier: 'extended', status: 'live', desc: 'Purchase requests, vendors and approvals.' },
  { key: 'inventory',   name: 'Inventory',          tier: 'extended', status: 'live', desc: 'Stock levels, low-stock alerts, warehouses and bookings.' },
  { key: 'finance',     name: 'Finance',            tier: 'extended', status: 'live', desc: 'Expenses, budgets and financial reports.' },
  { key: 'projects',    name: 'Projects',           tier: 'extended', status: 'live', desc: 'Milestones, boards and collaboration.' },
  { key: 'documents',   name: 'Documents',          tier: 'extended', status: 'live', desc: 'Secure storage, versioning, permissions.' },
  { key: 'trade-docs',  name: 'Trade Documents',    tier: 'extended', status: 'live', desc: 'Generate invoices, receipts, goods-received notes and stock release passes.' },
  { key: 'automation',  name: 'Automation',         tier: 'extended', status: 'live', desc: 'Rules that run your busywork — auto-assign tasks, approvals, reminders and alerts.' },
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
  benefits:    { icon: 'heart',      tint: '#be123c' },
  'it-assets': { icon: 'laptop',     tint: '#0e7490' },
  procurement: { icon: 'cart',       tint: '#b7791f' },
  inventory:   { icon: 'box',        tint: '#9b2c2c' },
  finance:     { icon: 'coins',      tint: '#2f855a' },
  projects:    { icon: 'kanban',     tint: '#6b46c1' },
  documents:   { icon: 'doc',        tint: '#475569' },
  'trade-docs':{ icon: 'receipt',    tint: '#7c2d12' },
  automation:  { icon: 'bolt',       tint: '#b45309' },
};

export const tierLabel = { core: 'MVP Core', extended: 'Extended' };

// Suites that have been through the per-org data-isolation pass (Stage 2 of
// the roadmap) and are safe to grant to an organization other than the
// founding one. Everything
// else is enforced server-side too (enforce_phase1_suite_scope() strips any
// other key on write) — this list just keeps the UI honest about it.
export const MULTI_TENANT_SAFE_SUITES = ['hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm', 'attendance', 'benefits', 'it-assets', 'procurement', 'inventory', 'finance', 'projects', 'documents', 'trade-docs', 'automation'];

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
