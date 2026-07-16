// Vercel Cron — daily automation sweep for every org that holds the
// Automation suite. Six pre-built, independently toggleable checks; each
// delivers via an org_notices banner and, where it's genuinely "busywork
// automated" rather than a passive alert, a real Task assigned to the right
// person. Runs once daily (Vercel Hobby cron ceiling — same constraint
// health.js's own cron already works within).
//
// Gated by CRON_SECRET (Vercel auto-attaches it as a Bearer token to its own
// cron-triggered requests once the env var exists) — unlike health.js this
// endpoint performs writes with no legitimate public/manual use, so it needs
// real gating rather than throttle-only safety.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function findSystemUser(admin, orgId) {
  const { data } = await admin.from('profiles').select('id').eq('org_id', orgId).eq('role', 'super_admin').limit(1).maybeSingle();
  return data?.id || null;
}

async function findSuiteHolder(admin, orgId, key, role) {
  const filter = role ? [{ key, role }] : [{ key }];
  const { data } = await admin.from('profiles').select('id').eq('org_id', orgId).contains('suites', filter).limit(1).maybeSingle();
  return data?.id || null;
}

// Avoids re-creating the same automated task every day while it's still
// open — dedupes on title + assignee, not just title, so the same alert for
// two different people (e.g. two managers) isn't collapsed into one.
async function ensureTask(admin, { orgId, title, description, assignedTo, createdBy, priority = 'medium' }) {
  if (!createdBy) return false;
  const { data: openDupe } = await admin.from('tasks').select('id, assigned_to').eq('org_id', orgId).eq('title', title).in('status', ['todo', 'in_progress', 'in_review']).limit(50);
  if ((openDupe || []).some((t) => t.assigned_to === assignedTo || (!t.assigned_to && !assignedTo))) return false;
  await admin.from('tasks').insert({ title, description, assigned_to: assignedTo || null, created_by: createdBy, priority, status: 'todo' });
  return true;
}

async function notice(admin, orgId, message) {
  await admin.from('org_notices').insert({ org_id: orgId, kind: 'automation', message });
}

async function logRun(admin, orgId, key, count, note = '') {
  await admin.from('automation_runs').insert({ org_id: orgId, key, count, note });
}

function enabledConfig(settings, key, defaults) {
  const row = (settings || []).find((s) => s.key === key);
  if (row && row.enabled === false) return null;
  return { ...defaults, ...(row?.config || {}) };
}

async function runLowStockAlert(admin, orgId, cfg, systemUser) {
  const { data: items } = await admin.from('stock_items').select('id, name, reorder_level').eq('org_id', orgId);
  if (!items?.length) return 0;
  const { data: levels } = await admin.from('stock_levels').select('item_id, quantity').in('item_id', items.map((i) => i.id));
  const onHand = {};
  (levels || []).forEach((l) => { onHand[l.item_id] = (onHand[l.item_id] || 0) + Number(l.quantity); });
  const low = items.filter((i) => (onHand[i.id] || 0) <= Number(i.reorder_level));
  if (!low.length) return 0;
  await notice(admin, orgId, `${low.length} stock item${low.length === 1 ? '' : 's'} at or below reorder level: ${low.slice(0, 5).map((i) => i.name).join(', ')}${low.length > 5 ? '…' : ''}.`);
  const mgr = await findSuiteHolder(admin, orgId, 'inventory', 'manager');
  await ensureTask(admin, {
    orgId, title: 'Reorder low-stock items', description: low.map((i) => i.name).join(', '),
    assignedTo: mgr, createdBy: systemUser, priority: 'high',
  });
  return low.length;
}

async function runOverdueInvoiceReminder(admin, orgId, cfg) {
  const graceDays = Number(cfg.graceDays ?? 3);
  const cutoff = new Date(Date.now() - graceDays * 86400000).toISOString().slice(0, 10);
  const { data: overdue } = await admin.from('trade_documents').select('id, doc_no, party_name, total, due_date')
    .eq('org_id', orgId).eq('doc_type', 'invoice').eq('status', 'issued').lt('due_date', cutoff);
  if (!overdue?.length) return 0;
  const total = overdue.reduce((s, d) => s + Number(d.total), 0);
  await notice(admin, orgId, `${overdue.length} invoice${overdue.length === 1 ? '' : 's'} overdue (₦${total.toLocaleString('en-NG')} total) — ${overdue.slice(0, 3).map((d) => d.doc_no).join(', ')}${overdue.length > 3 ? '…' : ''}.`);
  return overdue.length;
}

async function runNewLeadAutoTask(admin, orgId, cfg, systemUser) {
  const lookback = new Date(Date.now() - 26 * 3600000).toISOString();
  const { data: leads } = await admin.from('crm_contacts').select('id, name').eq('org_id', orgId).gte('created_at', lookback);
  if (!leads?.length) return 0;
  const owner = await findSuiteHolder(admin, orgId, 'crm');
  let created = 0;
  for (const lead of leads) {
    const title = `Follow up with ${lead.name}`;
    const ok = await ensureTask(admin, { orgId, title, description: 'New CRM contact — automatically flagged for follow-up.', assignedTo: owner, createdBy: systemUser, priority: 'medium' });
    if (ok) created += 1;
  }
  return created;
}

async function runTaskOverdueAlert(admin, orgId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: overdue } = await admin.from('tasks').select('id').eq('org_id', orgId).lt('due_date', today).in('status', ['todo', 'in_progress', 'in_review']);
  if (!overdue?.length) return 0;
  await notice(admin, orgId, `${overdue.length} task${overdue.length === 1 ? ' is' : 's are'} overdue.`);
  return overdue.length;
}

async function runLeavePendingReminder(admin, orgId, cfg) {
  const pendingDays = Number(cfg.pendingDays ?? 2);
  const cutoff = new Date(Date.now() - pendingDays * 86400000).toISOString();
  const { data: pending } = await admin.from('leave_requests').select('id').eq('status', 'pending').lt('created_at', cutoff);
  if (!pending?.length) return 0;
  await notice(admin, orgId, `${pending.length} leave request${pending.length === 1 ? ' has' : 's have'} been pending for more than ${pendingDays} day${pendingDays === 1 ? '' : 's'}.`);
  return pending.length;
}

async function runStockBookingExpiry(admin, orgId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: expired } = await admin.from('stock_reservations').select('id, reference').eq('org_id', orgId).eq('status', 'held').lt('hold_until', today);
  if (!expired?.length) return 0;
  await admin.from('stock_reservations').update({ status: 'expired', decided_at: new Date().toISOString() }).in('id', expired.map((e) => e.id));
  await notice(admin, orgId, `${expired.length} stock reservation${expired.length === 1 ? '' : 's'} passed their hold date and were released back to available stock.`);
  return expired.length;
}

async function runOrgAutomations(admin, orgId) {
  const { data: settings } = await admin.from('automation_settings').select('*').eq('org_id', orgId);
  const systemUser = await findSystemUser(admin, orgId);
  const summary = {};

  const cLow = enabledConfig(settings, 'low_stock_alert', {});
  if (cLow) summary.low_stock_alert = await runLowStockAlert(admin, orgId, cLow, systemUser);

  const cInv = enabledConfig(settings, 'overdue_invoice_reminder', { graceDays: 3 });
  if (cInv) summary.overdue_invoice_reminder = await runOverdueInvoiceReminder(admin, orgId, cInv);

  const cLead = enabledConfig(settings, 'new_lead_auto_task', {});
  if (cLead) summary.new_lead_auto_task = await runNewLeadAutoTask(admin, orgId, cLead, systemUser);

  const cTask = enabledConfig(settings, 'task_overdue_alert', {});
  if (cTask) summary.task_overdue_alert = await runTaskOverdueAlert(admin, orgId);

  const cLeave = enabledConfig(settings, 'leave_pending_reminder', { pendingDays: 2 });
  if (cLeave) summary.leave_pending_reminder = await runLeavePendingReminder(admin, orgId, cLeave);

  const cBooking = enabledConfig(settings, 'stock_booking_expiry', {});
  if (cBooking) summary.stock_booking_expiry = await runStockBookingExpiry(admin, orgId);

  for (const [key, count] of Object.entries(summary)) {
    await logRun(admin, orgId, key, count);
  }
  return summary;
}

export default async function handler(req, res) {
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Not configured' });
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const { data: profiles, error } = await admin.from('profiles').select('org_id, suites').not('suites', 'eq', '[]');
    if (error) return res.status(500).json({ error: error.message });

    const orgIds = [...new Set((profiles || [])
      .filter((p) => Array.isArray(p.suites) && p.suites.some((s) => s.key === 'automation'))
      .map((p) => p.org_id))];

    const results = [];
    for (const orgId of orgIds) {
      const summary = await runOrgAutomations(admin, orgId);
      results.push({ orgId, summary });
    }

    return res.status(200).json({ ok: true, orgsProcessed: results.length, results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
