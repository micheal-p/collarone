// AI rule drafting — "describe the automation, we set it up". VPS-only
// (.vercelignore) like the job-wall AI. The model only ever PROPOSES into the
// same fenced rule structure the manual builder uses; the proposal is
// validated server-side against the trigger/action whitelists and the org's
// own staff before it's returned, and the user still reviews + saves it
// themselves. Until OPENAI_API_KEY/OPENAI_MODEL are set, 'status' reports
// disabled and the UI shows the manual builder only.
//
//   POST { action: 'status' }                 → { enabled }
//   POST { action: 'draft', prompt } (Bearer) → { rule } — a validated proposal
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL;
const AI_ENABLED = Boolean(OPENAI_API_KEY && OPENAI_MODEL);

const json = (res, s, o) => res.status(s).json(o);

// Mirrored in the Automation suite UI — keep the two lists identical.
const EVENT_TRIGGERS = ['hr.hired', 'hr.bulk_imported', 'crm.deal_won', 'invoice.paid', 'invoice.recurring_generated', 'payment.confirmed'];
const ACTIONS = ['task', 'banner', 'bell', 'email'];

function validateRule(raw, staffIds) {
  const r = typeof raw === 'object' && raw ? raw : {};
  const out = { name: String(r.name || '').slice(0, 80).trim() || 'My automation' };

  if (r.trigger_kind === 'event' && EVENT_TRIGGERS.includes(r.event_type)) {
    out.trigger_kind = 'event'; out.event_type = r.event_type; out.schedule = null;
  } else if (r.trigger_kind === 'schedule' && ['day', 'week', 'month'].includes(r.schedule?.every)) {
    out.trigger_kind = 'schedule'; out.event_type = null;
    out.schedule = { every: r.schedule.every };
    if (r.schedule.every === 'week') out.schedule.dow = Math.min(6, Math.max(0, Number(r.schedule.dow ?? 1)));
    if (r.schedule.every === 'month') out.schedule.dom = Math.min(28, Math.max(1, Number(r.schedule.dom ?? 1)));
  } else return null;

  if (!ACTIONS.includes(r.action_kind)) return null;
  out.action_kind = r.action_kind;
  const c = r.action_config || {};
  if (r.action_kind === 'task') {
    out.action_config = {
      title: String(c.title || out.name).slice(0, 200),
      description: String(c.description || '').slice(0, 2000),
      priority: ['low', 'medium', 'high', 'urgent'].includes(c.priority) ? c.priority : 'medium',
      assigneeId: staffIds.has(c.assigneeId) ? c.assigneeId : null,
    };
  } else if (r.action_kind === 'email') {
    out.action_config = {
      subject: String(c.subject || out.name).slice(0, 150),
      message: String(c.message || '').slice(0, 1000),
      recipientIds: (Array.isArray(c.recipientIds) ? c.recipientIds : []).filter((id) => staffIds.has(id)).slice(0, 10),
    };
  } else {
    out.action_config = { message: String(c.message || out.name).slice(0, 500) };
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  if (body.action === 'status') return json(res, 200, { enabled: AI_ENABLED });
  if (!AI_ENABLED) return json(res, 400, { message: 'AI drafting is not switched on yet — build the rule manually below.' });
  if (!SERVICE_KEY) return json(res, 500, { message: 'Server not configured.' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(res, 401, { message: 'Authentication required.' });
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json(res, 401, { message: 'Invalid session.' });
  const { data: caller } = await admin.from('profiles').select('org_id, role, suites').eq('id', user.id).single();
  const isAutoManager = caller && (caller.role === 'super_admin' ||
    (Array.isArray(caller.suites) && caller.suites.some((s) => s.key === 'automation' && s.role === 'manager')));
  if (!isAutoManager) return json(res, 403, { message: 'Automation manager access required.' });

  if (body.action !== 'draft') return json(res, 400, { message: 'Unknown action.' });
  const prompt = String(body.prompt || '').slice(0, 600).trim();
  if (prompt.length < 8) return json(res, 400, { message: 'Describe the automation in a sentence or two.' });

  try {
    const { data: staff } = await admin.from('profiles')
      .select('id, name, job_title').eq('org_id', caller.org_id).eq('status', 'active').limit(80);
    const staffIds = new Set((staff || []).map((s) => s.id));

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You turn a plain-English description of a business automation into ONE JSON rule. Keys: ' +
              'name (short label), trigger_kind ("event" or "schedule"), ' +
              `event_type (only when event; one of ${EVENT_TRIGGERS.join(', ')} — hr.hired="a new staff joins", crm.deal_won="a deal is won", invoice.paid="an invoice gets paid", invoice.recurring_generated="a recurring invoice is drafted", payment.confirmed="a workspace payment lands", hr.bulk_imported="staff are bulk imported"), ` +
              'schedule (only when schedule: {every:"day"|"week"|"month", dow:0-6 Sunday=0 for week, dom:1-28 for month}), ' +
              `action_kind (one of ${ACTIONS.join(', ')} — task creates a to-do, banner shows a workspace notice, bell notifies everyone, email emails chosen staff), ` +
              'action_config: for task {title, description, priority(low|medium|high|urgent), assigneeId — pick from the staff list ONLY if the description clearly names them}, ' +
              'for banner/bell {message}, for email {subject, message, recipientIds[] from the staff list}. ' +
              'Template placeholders like {name} {title} {party} {docNo} {total} {valueNaira} are filled from the triggering event — use them where natural. ' +
              `Staff list (id · name · title): ${(staff || []).map((s) => `${s.id} · ${s.name} · ${s.job_title || ''}`).join(' | ') || 'none'}. ` +
              'If the request cannot be expressed with these triggers/actions, return {"impossible": true, "why": "<one short sentence>"}.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 400,
        temperature: 0.2,
      }),
    });
    if (!r.ok) throw new Error('ai_failed');
    const data = await r.json();
    const raw = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    if (raw.impossible) return json(res, 422, { message: raw.why || "That one can't be built with the available triggers and actions yet." });
    const rule = validateRule(raw, staffIds);
    if (!rule) return json(res, 422, { message: "Couldn't shape that into a rule — try describing the trigger and the action more plainly." });
    return json(res, 200, { rule });
  } catch {
    return json(res, 502, { message: 'AI drafting hiccuped — try again, or build it manually below.' });
  }
}
