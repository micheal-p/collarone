// Executor for org-built automation rules ("when X happens / every Monday →
// do Y"). Runs from the throttled health path — cheap when nothing is due.
//
// Fences (enforced HERE, server-side, regardless of what the UI allowed):
//   • actions: task / banner / bell / email — email only to the org's own
//     active staff, resolved at send time;
//   • event rules can't listen to 'automation.%' (their own output) → no loops;
//   • ≤ RULES_PER_ORG rules considered per org, ≤ ACTIONS_PER_DAY per rule;
//   • every action lands inside the rule's own org. Never throws.
import { emailEnabled, sendResend, wrap, esc, FROM_ADDR } from './email.js';
import { emitOrgEvent } from './events.js';

const RULES_PER_ORG = 25;
const ACTIONS_PER_DAY = 50;
const EVENTS_PER_TICK = 20;

// {placeholders} filled from the event payload — {party}, {docNo}, {name}...
const fill = (tpl, payload = {}) =>
  String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (payload[k] !== undefined ? String(payload[k]) : `{${k}}`));

export const periodOf = (schedule, now) => {
  const every = schedule?.every;
  if (every === 'day') return now.toISOString().slice(0, 10);
  if (every === 'week') {
    // ISO-ish week stamp: year + week number
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const week = Math.ceil((((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  return now.toISOString().slice(0, 7); // month
};

export const scheduleDue = (schedule, now) => {
  const every = schedule?.every;
  if (every === 'day') return true;
  if (every === 'week') return now.getDay() === Number(schedule.dow ?? 1);
  if (every === 'month') return now.getDate() >= Math.min(Number(schedule.dom ?? 1), 28);
  return false;
};

async function runAction(admin, rule, payload) {
  const cfg = rule.action_config || {};
  if (rule.action_kind === 'task') {
    // assignee must be in the rule's org (re-checked — the UI list can be stale)
    let assignedTo = null;
    if (cfg.assigneeId) {
      const { data: p } = await admin.from('profiles').select('id').eq('id', cfg.assigneeId).eq('org_id', rule.org_id).maybeSingle();
      assignedTo = p?.id || null;
    }
    await admin.from('tasks').insert({
      org_id: rule.org_id, created_by: rule.created_by, assigned_to: assignedTo,
      title: fill(cfg.title || rule.name, payload).slice(0, 200),
      description: fill(cfg.description || '', payload).slice(0, 2000),
      priority: ['low', 'medium', 'high', 'urgent'].includes(cfg.priority) ? cfg.priority : 'medium',
      status: 'todo',
    });
  } else if (rule.action_kind === 'banner') {
    await admin.from('org_notices').insert({
      org_id: rule.org_id, kind: 'automation', message: fill(cfg.message || rule.name, payload).slice(0, 500),
    });
  } else if (rule.action_kind === 'bell') {
    await emitOrgEvent(admin, rule.org_id, 'automation.notice', { message: fill(cfg.message || rule.name, payload).slice(0, 300), rule: rule.name });
  } else if (rule.action_kind === 'email') {
    if (!emailEnabled()) return; // channel not switched on yet — skip silently
    const ids = (Array.isArray(cfg.recipientIds) ? cfg.recipientIds : []).slice(0, 10);
    if (!ids.length) return;
    const { data: recips } = await admin.from('profiles')
      .select('email, name').in('id', ids).eq('org_id', rule.org_id).eq('status', 'active');
    for (const r of recips || []) {
      await sendResend({
        to: r.email, from: `Collarone <${FROM_ADDR}>`,
        subject: fill(cfg.subject || rule.name, payload).slice(0, 150),
        html: wrap(fill(cfg.subject || rule.name, payload), `
          <p style="font-size:14px;line-height:1.6">Hi ${esc(r.name || 'there')},</p>
          <p style="font-size:14px;line-height:1.6">${esc(fill(cfg.message || '', payload))}</p>
          <p style="font-size:12px;color:#889">Sent by your workspace automation "${esc(rule.name)}".</p>`),
      }).catch(() => {});
    }
  }
}

export async function runAutomationRules(admin) {
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const { data: rules } = await admin.from('org_automation_rules')
      .select('*').eq('enabled', true).limit(500);
    if (!rules?.length) return;

    // respect the per-org rule cap deterministically (oldest first)
    const byOrg = {};
    for (const r of rules.sort((a, b) => a.created_at < b.created_at ? -1 : 1)) {
      (byOrg[r.org_id] = byOrg[r.org_id] || []).push(r);
    }

    for (const orgRules of Object.values(byOrg)) {
      for (const rule of orgRules.slice(0, RULES_PER_ORG)) {
        try {
          const spent = rule.runs_date === today ? rule.runs_today : 0;
          if (spent >= ACTIONS_PER_DAY) continue;
          let ran = 0;

          if (rule.trigger_kind === 'event' && rule.event_type && !rule.event_type.startsWith('automation.')) {
            const { data: events } = await admin.from('org_events')
              .select('id, payload, created_at').eq('org_id', rule.org_id).eq('type', rule.event_type)
              .gt('created_at', rule.event_cursor).order('created_at', { ascending: true })
              .limit(Math.min(EVENTS_PER_TICK, ACTIONS_PER_DAY - spent));
            for (const ev of events || []) {
              await runAction(admin, rule, ev.payload || {});
              ran++;
              await admin.from('org_automation_rules').update({ event_cursor: ev.created_at }).eq('id', rule.id);
            }
          } else if (rule.trigger_kind === 'schedule' && rule.schedule) {
            const period = periodOf(rule.schedule, now);
            if (scheduleDue(rule.schedule, now) && rule.last_period !== period) {
              await runAction(admin, rule, {});
              ran++;
              await admin.from('org_automation_rules').update({ last_period: period }).eq('id', rule.id);
            }
          }

          if (ran > 0) {
            await admin.from('org_automation_rules')
              .update({ runs_date: today, runs_today: spent + ran, updated_at: now.toISOString() })
              .eq('id', rule.id);
          }
        } catch { /* one bad rule never blocks the rest */ }
      }
    }
  } catch { /* never break the caller */ }
}
