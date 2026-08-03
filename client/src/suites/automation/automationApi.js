import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';

export const getSettings = () => apiGet('/automation/settings').then((d) => d.settings);
export const setSetting  = (key, enabled, config) => apiPost('/automation/settings', { key, enabled, config }).then((d) => d.setting);
export const getRuns     = () => apiGet('/automation/runs').then((d) => d.runs);

// Fixed catalog for v0 — pre-built practical checks, not a rule-builder.
// configFields drive the small inline inputs on each card (e.g. "remind
// after N days"); omit for automations with no tunable threshold.
export const AUTOMATIONS = [
  {
    key: 'low_stock_alert', name: 'Low-stock reorder alert', suite: 'Inventory',
    desc: 'Flags items at or below their reorder level and assigns a "Reorder" task to the inventory manager.',
  },
  {
    key: 'overdue_invoice_reminder', name: 'Overdue invoice reminder', suite: 'Trade Documents',
    desc: 'Flags issued invoices past their due date so they don’t get forgotten.',
    configFields: [
      { key: 'graceDays', label: 'Grace period (days)', type: 'number', default: 3 },
      { key: 'useAI', label: 'Draft the follow-up message with AI', type: 'checkbox', default: false, hint: 'Adds a drafted WhatsApp-style reminder to each follow-up task (OpenAI Batch, results land the next day, a human still sends it).' },
    ],
  },
  {
    key: 'new_lead_auto_task', name: 'New lead follow-up', suite: 'CRM',
    desc: 'Auto-creates a "Follow up with…" task for new contacts so no lead sits untouched.',
    configFields: [
      { key: 'useAI', label: 'Draft the follow-up message with AI', type: 'checkbox', default: false, hint: 'Adds a drafted WhatsApp-style opener to each follow-up task (OpenAI Batch, results land the next day, a human still sends it).' },
    ],
  },
  {
    key: 'task_overdue_alert', name: 'Overdue task alert', suite: 'Tasks',
    desc: 'A daily banner naming how many tasks have slipped past their due date.',
  },
  {
    key: 'leave_pending_reminder', name: 'Pending leave reminder', suite: 'Leave',
    desc: 'Nudges approvers when a leave request has sat pending too long.',
    configFields: [{ key: 'pendingDays', label: 'Remind after (days)', type: 'number', default: 2 }],
  },
  {
    key: 'stock_booking_expiry', name: 'Stock booking expiry', suite: 'Inventory',
    desc: 'Auto-releases stock reservations that passed their hold date, freeing them back to available stock.',
  },
];

export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

// ---- Custom rules ("when X happens / every Monday → do Y") -----------------
export const getRules = () => apiGet('/automation/rules').then((d) => d.rules);
export const createRule = (body) => apiPost('/automation/rules', body).then((d) => d.rule);
export const updateRule = (id, body) => apiPatch(`/automation/rules/${id}`, body).then((d) => d.rule);
export const deleteRule = (id) => apiDelete(`/automation/rules/${id}`);

// AI drafting (VPS endpoint; 'status' says whether the key is on)
import { supabase as _sb } from '../../lib/supabaseClient.js';
const aiCall = async (bodyObj) => {
  const { data: { session } } = await _sb.auth.getSession();
  const r = await fetch('/api/automation-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(bodyObj),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.message || 'AI drafting failed.'); e.status = r.status; throw e; }
  return d;
};
export const aiStatus = () => aiCall({ action: 'status' }).then((d) => Boolean(d.enabled)).catch(() => false);
export const aiDraftRule = (prompt) => aiCall({ action: 'draft', prompt }).then((d) => d.rule);

// Friendly names for the rule builder — mirror of EVENT_TRIGGERS in
// client/api/automation-ai.js; keep the two lists identical.
export const RULE_EVENTS = [
  { key: 'hr.hired', label: 'A new staff member joins' },
  { key: 'hr.bulk_imported', label: 'Staff are imported in bulk' },
  { key: 'crm.deal_won', label: 'A deal is marked Won' },
  { key: 'invoice.paid', label: 'An invoice gets paid' },
  { key: 'invoice.recurring_generated', label: 'A recurring invoice is drafted' },
  { key: 'payment.confirmed', label: 'A workspace payment lands' },
];
export const RULE_ACTIONS = [
  { key: 'task', label: 'Create a task' },
  { key: 'banner', label: 'Show a workspace banner' },
  { key: 'bell', label: 'Notify everyone (bell)' },
  { key: 'email', label: 'Email chosen staff' },
];
export const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
