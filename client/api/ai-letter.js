// ============================================================================
// Collarone AI — letter drafting endpoint.
//
// The HR Letters composer calls this when the user clicks "Write with
// Collarone AI". Env-gated exactly like the email channel (send-email.js):
// it switches on only when OPENAI_API_KEY and OPENAI_MODEL are both set. Until
// then `{ action: 'status' }` reports { enabled: false } and the UI hides the
// button, so nothing advertises a feature the deployment can't deliver.
//
// Uses the synchronous Chat Completions endpoint (not the Batch API that
// automations-run.js uses) — a person is waiting on this draft, not a cron.
//
// CONTRACT (client/src/suites/hr/lettersApi.js):
//   POST /api/ai-letter
//   { action: 'status' }                      -> { enabled: boolean }
//   { letterType, letterTypeLabel, employeeName, jobTitle, department,
//     startDate, companyName, tone, instructions }  (Bearer <supabase jwt>)
//     -> 200 { body: '<plain-text letter body>' } | 4xx/5xx { error }
// ============================================================================
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// Not defaulted — must match a model id the account actually exposes.
const OPENAI_MODEL = process.env.OPENAI_MODEL;
const AI_ENABLED = Boolean(OPENAI_API_KEY && OPENAI_MODEL);

const clean = (s, max) => String(s || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

function buildPrompt(ctx) {
  const label = clean(ctx.letterTypeLabel || ctx.letterType || 'company letter', 60);
  const lines = [
    `Draft a ${label} for a Nigerian company.`,
    ctx.companyName && `Company (the sender): ${clean(ctx.companyName, 120)}.`,
    ctx.employeeName && `Employee (the subject): ${clean(ctx.employeeName, 120)}.`,
    ctx.jobTitle && `Job title: ${clean(ctx.jobTitle, 120)}.`,
    ctx.department && `Department: ${clean(ctx.department, 120)}.`,
    ctx.startDate && `Start date: ${clean(ctx.startDate, 40)}.`,
    ctx.instructions && `Additional instructions from HR: ${clean(ctx.instructions, 600)}.`,
  ].filter(Boolean);
  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  // Status probe — no auth, no spend. Lets the UI hide the button when off.
  if (body.action === 'status') return res.status(200).json({ enabled: AI_ENABLED });

  if (!AI_ENABLED) {
    return res.status(501).json({ error: 'Collarone AI is not switched on yet — write the letter manually or use a template for now.' });
  }
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Server not configured.' });

  // Authenticate the caller — this endpoint is publicly reachable and spends
  // AI credits, so never draft for an anonymous request.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session.' });

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an HR officer drafting formal Nigerian business correspondence. Return ONLY the letter body — from the salutation ("Dear ...,") through the closing ("Yours faithfully,") — with no letterhead, no date line, no subject line, and no placeholder brackets. Keep it under 400 words in a professional Nigerian business register.',
          },
          { role: 'user', content: buildPrompt(body) },
        ],
        max_tokens: 700,
        temperature: 0.6,
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(502).json({ error: `Collarone AI could not draft the letter right now (${r.status}). Try again or write it manually.`, detail: detail.slice(0, 200) });
    }
    const data = await r.json();
    const draft = data.choices?.[0]?.message?.content?.trim();
    if (!draft) return res.status(502).json({ error: 'Collarone AI returned an empty draft — try again or write manually.' });
    return res.status(200).json({ body: draft });
  } catch (e) {
    return res.status(502).json({ error: 'Collarone AI is unavailable right now — you can still write the letter manually.' });
  }
}
