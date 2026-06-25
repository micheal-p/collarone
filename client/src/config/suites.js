// Mirrors server/src/config/suites.js. The SERVER is authoritative for access in
// real mode; in demo mode this list also drives the mock API.
export const SUITES = [
  { key: 'hr',          name: 'HR & Staff',         tier: 'core',     status: 'live', desc: 'Employee records, org structure, onboarding.' },
  { key: 'leave',       name: 'Leave Management',   tier: 'core',     status: 'live', desc: 'Requests, approvals and balance tracking.' },
  { key: 'tasks',       name: 'Task & Report',      tier: 'core',     status: 'live', desc: 'Assignments, priorities and productivity reports.' },
  { key: 'visitors',    name: 'Visitor Management', tier: 'core',     status: 'live', desc: 'Front-desk check-in, host alerts, visitor logs.' },
  { key: 'it-assets',   name: 'IT Assets',          tier: 'extended', status: 'soon', desc: 'Asset tracking, assignment and lifecycle.' },
  { key: 'procurement', name: 'Procurement',        tier: 'extended', status: 'soon', desc: 'Purchase requests, vendors and approvals.' },
  { key: 'inventory',   name: 'Inventory',          tier: 'extended', status: 'soon', desc: 'Stock levels, low-stock alerts, warehouses.' },
  { key: 'finance',     name: 'Finance',            tier: 'extended', status: 'soon', desc: 'Expenses, budgets and financial reports.' },
  { key: 'projects',    name: 'Projects',           tier: 'extended', status: 'soon', desc: 'Milestones, boards and collaboration.' },
  { key: 'documents',   name: 'Documents',          tier: 'extended', status: 'soon', desc: 'Secure storage, versioning, permissions.' },
];

// Mirrors server/src/config/suites.js for presentation. The SERVER is authoritative
// for access; this only adds per-tile visuals (icon key + accent tint).
export const SUITE_META = {
  hr:          { icon: 'people',    tint: '#0b6b3a' },
  leave:       { icon: 'calendar',  tint: '#1aa564' },
  tasks:       { icon: 'check',      tint: '#2b6cb0' },
  visitors:    { icon: 'badge',      tint: '#8a5cf6' },
  'it-assets': { icon: 'laptop',     tint: '#0e7490' },
  procurement: { icon: 'cart',       tint: '#b7791f' },
  inventory:   { icon: 'box',        tint: '#9b2c2c' },
  finance:     { icon: 'coins',      tint: '#2f855a' },
  projects:    { icon: 'kanban',     tint: '#6b46c1' },
  documents:   { icon: 'doc',        tint: '#475569' },
};

export const tierLabel = { core: 'MVP Core', extended: 'Extended' };
