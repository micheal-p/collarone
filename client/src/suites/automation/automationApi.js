import { apiGet, apiPost } from '../../api/client.js';

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
    configFields: [{ key: 'graceDays', label: 'Grace period (days)', type: 'number', default: 3 }],
  },
  {
    key: 'new_lead_auto_task', name: 'New lead follow-up', suite: 'CRM',
    desc: 'Auto-creates a "Follow up with…" task for new contacts so no lead sits untouched.',
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
