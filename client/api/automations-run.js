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
// Both required for AI drafting; unset = that whole feature no-ops (the rest
// of the automation sweep still runs fine without it). OPENAI_MODEL is
// intentionally not defaulted here — it must match whatever model id your
// OpenAI account actually exposes, which this codebase has no way to verify.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL;
const AI_ENABLED = Boolean(OPENAI_API_KEY && OPENAI_MODEL);

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
// Returns the created task row (so callers can link an AI draft to it), or
// null if it was skipped (dedupe, or no valid creator).
async function ensureTask(admin, { orgId, title, description, assignedTo, createdBy, priority = 'medium' }) {
  if (!createdBy) return null;
  const { data: openDupe } = await admin.from('tasks').select('id, assigned_to').eq('org_id', orgId).eq('title', title).in('status', ['todo', 'in_progress', 'in_review']).limit(50);
  if ((openDupe || []).some((t) => t.assigned_to === assignedTo || (!t.assigned_to && !assignedTo))) return null;
  const { data } = await admin.from('tasks').insert({ title, description, assigned_to: assignedTo || null, created_by: createdBy, priority, status: 'todo', org_id: orgId }).select().single();
  return data || null;
}

async function notice(admin, orgId, message) {
  await admin.from('org_notices').insert({ org_id: orgId, kind: 'automation', message });
}

async function logRun(admin, orgId, key, count, note = '') {
  await admin.from('automation_runs').insert({ org_id: orgId, key, count, note });
}

// OFF BY DEFAULT. This used to treat a MISSING settings row as enabled, so
// the moment a company added the Automation suite all six checks started
// firing banners and creating tasks nobody had asked for. Software that begins
// by nagging gets switched off wholesale, and then the checks the customer
// actually wanted are off too. An explicit `enabled: true` is now required.
function enabledConfig(settings, key, defaults) {
  const row = (settings || []).find((s) => s.key === key);
  if (!row || row.enabled !== true) return null;
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

async function queueAiDraft(admin, { orgId, kind, subjectId, subjectLabel, context }) {
  await admin.from('ai_draft_requests').insert({ org_id: orgId, kind, subject_id: subjectId, subject_label: subjectLabel, context });
}

async function runOverdueInvoiceReminder(admin, orgId, cfg, systemUser) {
  const graceDays = Number(cfg.graceDays ?? 3);
  const cutoff = new Date(Date.now() - graceDays * 86400000).toISOString().slice(0, 10);
  const { data: overdue } = await admin.from('trade_documents').select('id, doc_no, party_name, total, due_date')
    .eq('org_id', orgId).eq('doc_type', 'invoice').eq('status', 'issued').lt('due_date', cutoff);
  if (!overdue?.length) return 0;
  const total = overdue.reduce((s, d) => s + Number(d.total), 0);
  await notice(admin, orgId, `${overdue.length} invoice${overdue.length === 1 ? '' : 's'} overdue (₦${total.toLocaleString('en-NG')} total) — ${overdue.slice(0, 3).map((d) => d.doc_no).join(', ')}${overdue.length > 3 ? '…' : ''}.`);

  // Opt-in: also spins up a per-invoice follow-up task, and — if AI
  // drafting is configured — queues a drafted message to attach to it once
  // the batch comes back (see collectCompletedBatches).
  if (cfg.useAI && AI_ENABLED) {
    const owner = (await findSuiteHolder(admin, orgId, 'trade-docs', 'manager')) || (await findSuiteHolder(admin, orgId, 'trade-docs'));
    for (const inv of overdue) {
      const task = await ensureTask(admin, {
        orgId, title: `Follow up: invoice ${inv.doc_no} overdue`,
        description: `${inv.party_name || 'Customer'} — ₦${Number(inv.total).toLocaleString('en-NG')}, due ${inv.due_date}.`,
        assignedTo: owner, createdBy: systemUser, priority: 'medium',
      });
      if (task) {
        await queueAiDraft(admin, {
          orgId, kind: 'invoice_reminder', subjectId: inv.id, subjectLabel: inv.doc_no,
          context: { taskId: task.id, docNo: inv.doc_no, partyName: inv.party_name, total: inv.total, dueDate: inv.due_date },
        });
      }
    }
  }
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
    const task = await ensureTask(admin, { orgId, title, description: 'New CRM contact — automatically flagged for follow-up.', assignedTo: owner, createdBy: systemUser, priority: 'medium' });
    if (task) {
      created += 1;
      if (cfg.useAI && AI_ENABLED) {
        await queueAiDraft(admin, { orgId, kind: 'lead_followup', subjectId: lead.id, subjectLabel: lead.name, context: { taskId: task.id, leadName: lead.name } });
      }
    }
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

  // A check that throws must NOT be reported as "found 0" — a broken query and
  // a clean bill of health looked identical, which is how a silently failing
  // automation goes unnoticed for weeks. Failures are recorded as such.
  const guard = async (key, fn) => {
    try { return await fn(); }
    catch (e) {
      summary[`${key}_error`] = String(e.message).slice(0, 200);
      await admin.from('automation_runs')
        .insert({ org_id: orgId, key, count: 0, note: `failed: ${String(e.message).slice(0, 200)}` })
        .then(() => {}, () => {});
      return null;
    }
  };

  const cLow = enabledConfig(settings, 'low_stock_alert', {});
  if (cLow) summary.low_stock_alert = await guard('low_stock_alert', () => runLowStockAlert(admin, orgId, cLow, systemUser));

  const cInv = enabledConfig(settings, 'overdue_invoice_reminder', { graceDays: 3 });
  if (cInv) summary.overdue_invoice_reminder = await guard('overdue_invoice_reminder', () => runOverdueInvoiceReminder(admin, orgId, cInv, systemUser));

  const cLead = enabledConfig(settings, 'new_lead_auto_task', {});
  if (cLead) summary.new_lead_auto_task = await guard('new_lead_auto_task', () => runNewLeadAutoTask(admin, orgId, cLead, systemUser));

  const cTask = enabledConfig(settings, 'task_overdue_alert', {});
  if (cTask) summary.task_overdue_alert = await guard('task_overdue_alert', () => runTaskOverdueAlert(admin, orgId));

  const cLeave = enabledConfig(settings, 'leave_pending_reminder', { pendingDays: 2 });
  if (cLeave) summary.leave_pending_reminder = await guard('leave_pending_reminder', () => runLeavePendingReminder(admin, orgId, cLeave));

  const cBooking = enabledConfig(settings, 'stock_booking_expiry', {});
  if (cBooking) summary.stock_booking_expiry = await guard('stock_booking_expiry', () => runStockBookingExpiry(admin, orgId));

  for (const [key, count] of Object.entries(summary)) {
    await logRun(admin, orgId, key, count);
  }
  return summary;
}

// ---- OpenAI Batch API — async, cost-optimised, matches a once-daily cron ----
async function openaiUploadBatchFile(jsonlContent) {
  const form = new FormData();
  form.append('purpose', 'batch');
  form.append('file', new Blob([jsonlContent], { type: 'application/jsonl' }), 'batch.jsonl');
  const res = await fetch('https://api.openai.com/v1/files', {
    method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`OpenAI file upload failed: ${res.status} ${await res.text()}`);
  return (await res.json()).id;
}

async function openaiCreateBatch(fileId) {
  const res = await fetch('https://api.openai.com/v1/batches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input_file_id: fileId, endpoint: '/v1/chat/completions', completion_window: '24h' }),
  });
  if (!res.ok) throw new Error(`OpenAI batch create failed: ${res.status} ${await res.text()}`);
  return (await res.json()).id;
}

async function openaiGetBatch(batchId) {
  const res = await fetch(`https://api.openai.com/v1/batches/${batchId}`, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });
  if (!res.ok) throw new Error(`OpenAI batch fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function openaiDownloadFile(fileId) {
  const res = await fetch(`https://api.openai.com/v1/files/${fileId}/content`, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });
  if (!res.ok) throw new Error(`OpenAI file download failed: ${res.status} ${await res.text()}`);
  return res.text();
}

function buildDraftPrompt(row) {
  const c = row.context || {};
  if (row.kind === 'invoice_reminder') {
    return `Write a short, polite WhatsApp-style payment reminder to ${c.partyName || 'the customer'} about overdue invoice ${c.docNo}, amount ₦${Number(c.total || 0).toLocaleString('en-NG')}, due ${c.dueDate}. Under 60 words, friendly but firm, no subject line, no placeholders.`;
  }
  if (row.kind === 'lead_followup') {
    return `Write a short, warm WhatsApp-style follow-up message to a new business lead named ${c.leadName}, thanking them for their interest and asking one specific question to move the conversation forward. Under 50 words, no subject line, no placeholders.`;
  }
  return '';
}

// Step 1 of each run: apply any drafts OpenAI finished since yesterday
// before evaluating today's checks — batch jobs are async (up to 24h), so
// this is a genuinely next-day, eventually-consistent flow, not a bug.
async function collectCompletedBatches(admin) {
  const { data: batched } = await admin.from('ai_draft_requests').select('batch_id').eq('status', 'batched').not('batch_id', 'is', null);
  const batchIds = [...new Set((batched || []).map((r) => r.batch_id))];

  for (const batchId of batchIds) {
    let batch;
    try { batch = await openaiGetBatch(batchId); } catch { continue; }
    if (batch.status === 'failed' || batch.status === 'expired' || batch.status === 'cancelled') {
      await admin.from('ai_draft_requests').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('batch_id', batchId);
      continue;
    }
    if (batch.status !== 'completed' || !batch.output_file_id) continue;

    let content;
    try { content = await openaiDownloadFile(batch.output_file_id); } catch { continue; }

    for (const line of content.split('\n').filter(Boolean)) {
      let parsed;
      try { parsed = JSON.parse(line); } catch { continue; }
      const draftText = parsed.response?.body?.choices?.[0]?.message?.content?.trim();
      if (!draftText) continue;

      const { data: reqRow } = await admin.from('ai_draft_requests').select('*').eq('id', parsed.custom_id).maybeSingle();
      if (!reqRow) continue;

      await admin.from('ai_draft_requests').update({ status: 'done', draft_text: draftText, completed_at: new Date().toISOString() }).eq('id', reqRow.id);

      const taskId = reqRow.context?.taskId;
      if (taskId) {
        const { data: task } = await admin.from('tasks').select('description').eq('id', taskId).maybeSingle();
        if (task) {
          await admin.from('tasks').update({ description: `${task.description}\n\nAI-drafted message:\n${draftText}` }).eq('id', taskId);
        }
      }
    }
  }
}

// Step 3 of each run: bundle everything queued today into ONE batch job
// (cheaper than one request per org) rather than submitting per-org.
async function submitPendingBatch(admin) {
  const { data: pending } = await admin.from('ai_draft_requests').select('*').eq('status', 'pending').limit(200);
  if (!pending?.length) return;

  const lines = pending.map((r) => JSON.stringify({
    custom_id: r.id, method: 'POST', url: '/v1/chat/completions',
    body: { model: OPENAI_MODEL, messages: [{ role: 'user', content: buildDraftPrompt(r) }], max_tokens: 150 },
  }));

  try {
    const fileId = await openaiUploadBatchFile(lines.join('\n'));
    const batchId = await openaiCreateBatch(fileId);
    await admin.from('ai_draft_requests').update({ status: 'batched', batch_id: batchId }).in('id', pending.map((r) => r.id));
  } catch {
    // Left as 'pending' — picked up and retried on tomorrow's run rather
    // than failing the whole cron tick over an OpenAI-side hiccup.
  }
}

export default async function handler(req, res) {
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Not configured' });
  // FAIL CLOSED. This was `if (secret && ...)`, which skipped the check
  // entirely whenever CRON_SECRET was unset — and it was never set on the box,
  // so this write endpoint was open to anyone who knew the URL, writing tasks
  // and notices into EVERY tenant. A missing secret is a misconfiguration, not
  // permission: refuse, and say so distinctly so it's obvious in the logs.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'Automation sweep is not configured (CRON_SECRET unset).' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    if (AI_ENABLED) await collectCompletedBatches(admin).catch(() => {});

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

    if (AI_ENABLED) await submitPendingBatch(admin).catch(() => {});

    return res.status(200).json({ ok: true, orgsProcessed: results.length, results, aiEnabled: AI_ENABLED });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
