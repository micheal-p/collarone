// AI onboarding — "describe your business in a sentence, we set the workspace
// up". VPS-only (.vercelignore) and key-agnostic like the other AI endpoints:
// until OPENAI_API_KEY/OPENAI_MODEL exist, 'status' reports disabled and the
// setup checklist simply doesn't show the panel.
//
// The model only ever PROPOSES; the proposal is validated here against hard
// caps and the same BULK_SAFE fence as every other bulk path, the owner
// reviews it in the UI, and 'apply' re-validates before writing. Deliberately
// creates NO people — fake staff would consume seat credits and pollute a
// real workspace.
//
//   POST { action: 'status' }                  → { enabled }
//   POST { action: 'plan', prompt }   (Bearer, owner) → { plan }
//   POST { action: 'apply', plan }    (Bearer, owner) → { created }
import { createClient } from '@supabase/supabase-js';
import { emitOrgEvent } from './_lib/events.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL;
const AI_ENABLED = Boolean(OPENAI_API_KEY && OPENAI_MODEL);

const json = (res, s, o) => res.status(s).json(o);

// Mirror of BULK_SAFE_SUITES in client/src/config/suites.js — templates may
// only carry everyday suites; money/PII suites stay person-by-person.
const BULK_SAFE = ['leave', 'tasks', 'visitors', 'attendance', 'projects', 'crm', 'inventory', 'it-assets'];
const ALL_SUITES = ['hr', 'leave', 'tasks', 'visitors', 'payroll', 'attendance', 'benefits', 'it-assets', 'procurement', 'inventory', 'finance', 'projects', 'documents', 'crm', 'trade-docs', 'automation'];

function validatePlan(raw) {
  const r = typeof raw === 'object' && raw ? raw : {};
  const seenCodes = new Set();
  const departments = (Array.isArray(r.departments) ? r.departments : []).slice(0, 10).map((d) => {
    const name = String(d?.name || '').trim().slice(0, 40);
    let code = String(d?.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!name || !code || seenCodes.has(code)) return null;
    seenCodes.add(code);
    const template = [...new Set((Array.isArray(d.template) ? d.template : []).filter((k) => BULK_SAFE.includes(k)))]
      .map((k) => ({ key: k, role: k === 'visitors' ? 'staff' : 'member' }));
    return { name, code, template };
  }).filter(Boolean);

  const seenKeys = new Set();
  const leaveTypes = (Array.isArray(r.leaveTypes) ? r.leaveTypes : []).slice(0, 6).map((t) => {
    const name = String(t?.name || '').trim().slice(0, 40);
    const key = String(t?.key || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    const days = Math.min(60, Math.max(0, Number(t?.defaultDays) || 0));
    if (!name || !key || seenKeys.has(key)) return null;
    seenKeys.add(key);
    return { name, key, defaultDays: days, paid: t?.paid !== false };
  }).filter(Boolean);

  const suggestedSuites = [...new Set((Array.isArray(r.suggestedSuites) ? r.suggestedSuites : []).filter((k) => ALL_SUITES.includes(k)))].slice(0, 8);
  const summary = String(r.summary || '').slice(0, 300);
  if (!departments.length && !leaveTypes.length) return null;
  return { departments, leaveTypes, suggestedSuites, summary };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  if (body.action === 'status') return json(res, 200, { enabled: AI_ENABLED });
  if (!AI_ENABLED) return json(res, 400, { message: 'AI setup is not switched on yet.' });
  if (!SERVICE_KEY) return json(res, 500, { message: 'Server not configured.' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(res, 401, { message: 'Authentication required.' });
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json(res, 401, { message: 'Invalid session.' });
  const { data: caller } = await admin.from('profiles').select('org_id, role').eq('id', user.id).single();
  if (!caller || caller.role !== 'super_admin') return json(res, 403, { message: 'Workspace owner access required.' });

  if (body.action === 'plan') {
    const prompt = String(body.prompt || '').slice(0, 500).trim();
    if (prompt.length < 8) return json(res, 400, { message: 'Describe the business in a sentence or two.' });
    try {
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
                'You set up a Nigerian business workspace from a one-line description. Return ONLY JSON: ' +
                'summary (one warm sentence about what you set up), ' +
                'departments (3-7 realistic for THIS business: {name, code (short uppercase), template: array of everyday suite keys this department\'s staff should use, ' +
                `chosen from ${BULK_SAFE.join(', ')} — e.g. sales teams get crm+tasks, field/ops teams get attendance+leave+tasks, store teams get inventory+tasks}), ` +
                'leaveTypes (0-4 EXTRA leave types beyond the standard annual/sick/maternity set, only if this business genuinely needs them: {name, key, defaultDays, paid} — e.g. schools: mid-term break cover; logistics: route rest days. Usually return [] — do not invent), ' +
                `suggestedSuites (3-8 suite keys from ${ALL_SUITES.join(', ')} that fit this business best, most valuable first). ` +
                'Nigerian business context; keep names plain.',
            },
            { role: 'user', content: prompt },
          ],
          max_tokens: 600,
          temperature: 0.3,
        }),
      });
      if (!r.ok) throw new Error('ai_failed');
      const data = await r.json();
      const plan = validatePlan(JSON.parse(data.choices?.[0]?.message?.content || '{}'));
      if (!plan) return json(res, 422, { message: "Couldn't shape a setup from that — try adding what the business does and who works in it." });
      return json(res, 200, { plan });
    } catch {
      return json(res, 502, { message: 'AI setup hiccuped — try again in a moment.' });
    }
  }

  if (body.action === 'apply') {
    // Re-validate — never trust the round-trip through the browser.
    const plan = validatePlan(body.plan);
    if (!plan) return json(res, 400, { message: 'Nothing valid to apply.' });
    const orgId = caller.org_id;
    let depts = 0; let types = 0;
    for (const d of plan.departments) {
      const { error } = await admin.from('departments')
        .insert({ org_id: orgId, name: d.name, code: d.code, access_suites: d.template });
      if (!error) depts++; // duplicates (code exists) just skip
    }
    for (const t of plan.leaveTypes) {
      const { error } = await admin.from('leave_types')
        .insert({ org_id: orgId, key: t.key, name: t.name, default_days: t.defaultDays, paid: t.paid, sort: 90 });
      if (!error) types++;
    }
    await emitOrgEvent(admin, orgId, 'org.ai_setup', { departments: depts, leaveTypes: types }, user.id);
    return json(res, 200, { created: { departments: depts, leaveTypes: types } });
  }

  return json(res, 400, { message: 'Unknown action.' });
}
