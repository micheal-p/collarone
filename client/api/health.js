// Vercel serverless function — real health check, not a fabricated status.
// GET is safe to call anytime: the /status page, the Platform Admin
// dashboard, and Vercel's own once-a-day cron (vercel.json) all hit this.
//
// A once-a-day cron alone is too sparse to ever build a useful 90-day
// history or catch a same-day outage, and Vercel Cron only runs that
// infrequently on this plan — so every call to this endpoint opportunistically
// logs a row too, throttled to at most one every 5 minutes so normal traffic
// (not a script hammering this URL) is what drives the write rate.
import { createClient } from '@supabase/supabase-js';
import { sendBillingNotice } from './_lib/billingNotify.js';
import { runAutomationRules, periodOf, scheduleDue } from './_lib/automationRules.js';

import { readFileSync } from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const THROTTLE_MS = 5 * 60 * 1000;

// What's actually running. This used to be a hand-typed string and it sat ten
// days stale — during an incident it's the first thing anyone reads, and a
// wrong answer sends you looking in the wrong place. deploy/deploy.sh writes
// BUILD_ID next to the app on every deploy; read it once and cache.
let BUILD_ID;
function buildId() {
  if (BUILD_ID !== undefined) return BUILD_ID;
  try {
    BUILD_ID = readFileSync(new URL('../../BUILD_ID', import.meta.url), 'utf8').trim() || 'unknown';
  } catch {
    BUILD_ID = process.env.BUILD_ID || 'dev';
  }
  return BUILD_ID;
}

// Whether the nginx cache-header snippet actually got wired in. deploy.sh
// writes it; without this the only way to know was reading the deploy log,
// which needs GitHub auth, and this step had silently done nothing twice.
let NGINX_STATUS;
function nginxStatus() {
  if (NGINX_STATUS !== undefined) return NGINX_STATUS;
  try {
    NGINX_STATUS = readFileSync(new URL('../../NGINX_STATUS', import.meta.url), 'utf8').trim() || 'unknown';
  } catch {
    NGINX_STATUS = 'unknown';
  }
  return NGINX_STATUS;
}

// Dunning copy per lifecycle transition — one source for banner + email so the
// two channels never tell a customer different stories.
const DUNNING = {
  past_due: {
    subject: 'Your Collarone renewal is due',
    heading: 'Renewal due',
    body: `<p style="font-size:14px;line-height:1.6">Your Collarone subscription has reached its renewal date. Renew from your Billing page to keep full access — after the grace window your workspace goes read-only.</p>`,
    banner: 'Your subscription renewal is due. Renew from Billing to avoid your workspace going read-only.',
  },
  read_only: {
    subject: 'Your Collarone workspace is now read-only',
    heading: 'Workspace read-only',
    body: `<p style="font-size:14px;line-height:1.6">Your renewal is overdue, so your workspace has switched to read-only — your data is safe and visible, but changes are paused until you renew.</p>`,
    banner: 'Your subscription is overdue — your workspace is now read-only. Renew from Billing to make changes again.',
  },
  suspended: {
    subject: 'Your Collarone workspace has been suspended',
    heading: 'Workspace suspended',
    body: `<p style="font-size:14px;line-height:1.6">Your workspace has been suspended for an overdue renewal. Renewing restores everything exactly as you left it. Need help? WhatsApp us on 0814&nbsp;812&nbsp;8551.</p>`,
    banner: 'Your workspace has been suspended for an overdue payment. Renew to restore access — WhatsApp 0814 812 8551.',
  },
};

export default async function handler(req, res) {
  const startedAt = Date.now();
  let dbOk = false;
  const admin = SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) : null;

  try {
    if (admin) {
      const { error } = await admin.from('organizations').select('id').limit(1);
      dbOk = !error;
    }
  } catch {
    dbOk = false;
  }

  const responseMs = Date.now() - startedAt;
  const apiOk = true; // this function executed, so the API itself is up

  // The server being up is not the whole story: a bad deploy can crash inside
  // users' BROWSERS while api/db answer perfectly (the 161x "Unexpected
  // token '<'" night). Those crashes land in client_errors via /api/track —
  // fold the last hour's rate into the public status so the dashboard can't
  // say "operational" through a client-side incident. Threshold, not any
  // single error: one user's flaky extension shouldn't page anyone.
  let clientErrorsLastHour = 0;
  if (admin) {
    try {
      const { count } = await admin.from('client_errors')
        .select('id', { count: 'exact', head: true })
        .is('resolved_at', null)   // acknowledged noise stops counting
        // Errors thrown by somebody else's script inside our page (tagged in
        // track.js) must not move OUR status. Cloudflare's analytics beacon
        // failing on an old browser is not a Collarone outage, and telling
        // customers it is would be the false alarm that teaches them to
        // ignore the status page.
        .not('message', 'like', '[third-party]%')
        .gte('occurred_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
      clientErrorsLastHour = count || 0;
    } catch { /* counting must never break the health check itself */ }
  }
  // The watchdog's latest self-examination (runs every 30min from
  // server/index.js). Its findings ride the health JSON; a run that hasn't
  // happened for 45+ minutes is itself a finding (dead-man switch) — silence
  // must be detectable, not mistaken for health.
  let watchdog = null;
  if (admin) {
    try {
      const { data: run } = await admin.from('watchdog_runs')
        .select('ran_at, findings, findings_count')
        .order('ran_at', { ascending: false }).limit(1).maybeSingle();
      if (run) {
        watchdog = {
          lastRunAt: run.ran_at,
          findings: (run.findings || []).map((f) => f.kind),
          stale: Date.now() - new Date(run.ran_at).getTime() > 45 * 60 * 1000,
        };
      } else {
        watchdog = { lastRunAt: null, findings: [], stale: true };
      }
    } catch { /* health must answer regardless */ }
  }

  const CLIENT_ERROR_DEGRADED_AT = 10; // per hour, across all users
  // Public status degrades for what CUSTOMERS feel: crash floods, or the
  // watchdog seeing signups actively fail. Internal-only findings (stale
  // tickets, deploy failures) stay in the ops surfaces, not the public banner.
  const watchdogCustomerImpact = Boolean(watchdog?.findings?.includes('signup_failures'));
  const status = !dbOk ? 'down'
    : (clientErrorsLastHour >= CLIENT_ERROR_DEGRADED_AT || watchdogCustomerImpact) ? 'degraded'
    : 'operational';

  // Error spikes become PERMANENT history, not just a live banner: open an
  // app_bug incident when the rate crosses the line, close it when calm
  // returns. The 03 Aug flood (161 crashes) never showed on the status page
  // because nothing recorded it — the July incident had been written in by
  // hand. The status_checks trigger deliberately ignores app_bug incidents
  // (status_incident_auto_appbug.sql), so a healthy server check can't close
  // one out from under us.
  if (admin) {
    try {
      const { data: openBug } = await admin.from('status_incidents')
        .select('id, started_at').eq('kind', 'app_bug').is('resolved_at', null)
        .order('started_at', { ascending: false }).limit(1).maybeSingle();
      if (clientErrorsLastHour >= CLIENT_ERROR_DEGRADED_AT && !openBug) {
        await admin.from('status_incidents').insert({
          kind: 'app_bug',
          notes: 'Elevated rate of in-app errors detected automatically. Servers are answering normally; the client-side error rate crossed the alerting threshold.',
        });
      } else if (clientErrorsLastHour < CLIENT_ERROR_DEGRADED_AT && openBug) {
        await admin.from('status_incidents').update({
          resolved_at: new Date().toISOString(),
          duration_sec: Math.round((Date.now() - new Date(openBug.started_at).getTime()) / 1000),
        }).eq('id', openBug.id);
      }
    } catch { /* incident bookkeeping must never break the health check */ }
  }

  if (admin) {
    try {
      const { data: last } = await admin.from('status_checks').select('checked_at').order('checked_at', { ascending: false }).limit(1).maybeSingle();
      const dueForCheck = !last || Date.now() - new Date(last.checked_at).getTime() > THROTTLE_MS;
      if (dueForCheck) {
        await admin.from('status_checks').insert({ api_ok: apiOk, db_ok: dbOk, response_ms: responseMs });
        // Piggyback on the same throttle: promo-trial expiry. An org whose
        // trial window has lapsed gets suspended (blocks login with the
        // pay-to-continue message) and a payment-reminder banner queued for
        // when they do pay and come back.
        const { data: expired } = await admin.from('organizations')
          .update({ status: 'suspended' })
          .lt('trial_ends_at', new Date().toISOString())
          .eq('status', 'active')
          .select('id, name, trial_ends_at');
        for (const org of expired || []) {
          // banner + email in one call; dedupe key makes it once per trial
          await sendBillingNotice(admin, {
            orgId: org.id, kind: 'trial_expired',
            dedupeKey: `${org.id}:trial_expired:${org.trial_ends_at}`,
            subject: 'Your Collarone free trial has ended',
            heading: 'Trial ended',
            bodyHtml: `<p style="font-size:14px;line-height:1.6">The free trial for <strong>${String(org.name || 'your workspace').replace(/</g, '&lt;')}</strong> has ended. Complete your activation payment to pick up right where you left off — everything is saved. Questions? WhatsApp us on 0814&nbsp;812&nbsp;8551.</p>`,
            bannerMessage: 'Your free trial has ended. Complete your activation payment to keep using Collarone — WhatsApp us on 0814 812 8551.',
          });
        }

        // Proactive renewal reminder — 7 days before the period ends, email the
        // owner the honest best-tier amount for what they actually run. Runs
        // regardless of PAYWALL_ENFORCE (reminding is always safe; enforcing
        // isn't). Dedupe key = org + period, so one nudge per billing period.
        const FOUNDING = '00000000-0000-0000-0000-000000000001';
        const { data: dueSoon } = await admin.from('organizations')
          .select('id, name, current_period_end, rate_card')
          .eq('status', 'active')
          .gt('current_period_end', new Date().toISOString())
          .lt('current_period_end', new Date(Date.now() + 7 * 86400000).toISOString())
          .neq('id', FOUNDING).limit(50);
        for (const org of dueSoon || []) {
          // live seat + suite counts, same definitions request_renewal uses
          const { data: members } = await admin.from('profiles')
            .select('role, status, suites').eq('org_id', org.id);
          const seats = (members || []).filter((m) => m.status === 'active' && m.role !== 'super_admin').length;
          const suiteKeys = new Set();
          for (const m of members || []) for (const s of (Array.isArray(m.suites) ? m.suites : [])) if (s?.key) suiteKeys.add(s.key);
          let rc = org.rate_card;
          if (!rc) ({ data: rc } = await admin.rpc('current_published_rate_card'));
          const { data: amountKobo } = rc
            ? await admin.rpc('best_plan_kobo', { p_rate_card: rc, p_seats: seats, p_suites: suiteKeys.size, p_months: 1 })
            : { data: null };
          const dueDate = new Date(org.current_period_end);
          const dateStr = dueDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
          const amountStr = amountKobo ? `₦${(Number(amountKobo) / 100).toLocaleString('en-NG')}` : null;
          await sendBillingNotice(admin, {
            orgId: org.id, kind: 'renewal_due',
            dedupeKey: `${org.id}:renewal_due:${org.current_period_end}`,
            subject: `Your Collarone renewal is coming up${amountStr ? ` — ${amountStr}/month` : ''}`,
            heading: 'Renewal coming up',
            bodyHtml: `<p style="font-size:14px;line-height:1.6">Your Collarone subscription renews on <strong>${dateStr}</strong>${amountStr ? ` — about <strong>${amountStr}/month</strong> for ${suiteKeys.size} suite${suiteKeys.size === 1 ? '' : 's'} and ${seats} staff (always the cheapest plan for what you run)` : ''}. Renew from your Billing page — monthly, or 12 months at 15% off.</p>`,
            bannerMessage: `Your subscription renews on ${dateStr}. Renew from Billing — monthly, or 12 months at 15% off.`,
          });
        }

        // Recurring invoices: re-raise any due this period as ready-to-send
        // drafts (idempotent per period inside the RPC; notices + feed events
        // are written there too). Piggybacks the same throttle as everything
        // else here so it works for every org, not just automation-suite ones.
        await admin.rpc('generate_recurring_invoices').then(() => {}, () => {});

        // Org-built automation rules (event rules drain their cursor;
        // schedules stamp their period) — caps + fences inside.
        await runAutomationRules(admin);

        // Recurring tasks: sources re-raise themselves as fresh todos each
        // period (same stamp idempotency as recurring invoices; clones never
        // recur). Cheap when nothing is due.
        try {
          const nowD = new Date();
          const { data: recur } = await admin.from('tasks')
            .select('id, org_id, title, description, priority, assigned_to, created_by, recur_every, recur_dow, recur_dom, recur_last_period')
            .not('recur_every', 'is', null).is('recur_source_id', null).limit(300);
          for (const t of recur || []) {
            const sched = { every: t.recur_every, dow: t.recur_dow ?? 1, dom: t.recur_dom ?? 1 };
            const period = periodOf(sched, nowD);
            if (!scheduleDue(sched, nowD) || t.recur_last_period === period) continue;
            await admin.from('tasks').insert({
              org_id: t.org_id, title: t.title, description: t.description, priority: t.priority,
              assigned_to: t.assigned_to, created_by: t.created_by, status: 'todo',
              due_date: nowD.toISOString().slice(0, 10), recur_source_id: t.id,
            });
            await admin.from('tasks').update({ recur_last_period: period }).eq('id', t.id);
          }
        } catch { /* never break health */ }

        // Document expiry: contracts/licences with expires_at within 14 days
        // raise a banner + spine event once per expiry (outbox dedupe).
        try {
          const soon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
          const { data: expiring } = await admin.from('documents')
            .select('id, org_id, name, expires_at')
            .not('expires_at', 'is', null).lte('expires_at', soon)
            .gte('expires_at', new Date().toISOString().slice(0, 10)).limit(100);
          for (const doc of expiring || []) {
            const { data: claim } = await admin.from('notification_outbox').upsert(
              { org_id: doc.org_id, kind: 'document_expiring', dedupe_key: `${doc.id}:expiring:${doc.expires_at}` },
              { onConflict: 'dedupe_key', ignoreDuplicates: true },
            ).select('id');
            if (!claim?.[0]) continue;
            await admin.from('org_notices').insert({
              org_id: doc.org_id, kind: 'automation',
              message: `Document "${doc.name}" expires on ${doc.expires_at} — renew or replace it in Documents.`,
            }).then(() => {}, () => {});
            await emitOrgEvent(admin, doc.org_id, 'document.expiring', { documentId: doc.id, name: doc.name, expiresAt: doc.expires_at });
            await admin.from('notification_outbox').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', claim[0].id).then(() => {}, () => {});
          }
        } catch { /* never break health */ }

        // Drain the "someone is waiting on you" queue: task assigned, leave
        // submitted, leave decided. Triggers write the rows (notify_events.sql);
        // this sends them through the shared sender.
        //
        // When email is off, rows are marked 'skipped' rather than left
        // pending. Otherwise switching a key on months later would fire a
        // backlog of stale news at everybody, which is worse than never having
        // sent it — a leave decision from March is not news in August.
        try {
          const { emailEnabled: nOn, sendMail: nSend, wrap: nWrap, esc: nEsc } = await import('./_lib/email.js');
          const { data: queued } = await admin.from('notification_outbox')
            .select('id, kind, email_to, subject, body')
            .eq('status', 'claimed')
            .in('kind', ['task_assigned', 'leave_submitted', 'leave_decided', 'visitor_arrived'])
            .limit(200);
          for (const n of queued || []) {
            if (!nOn() || !n.email_to) {
              await admin.from('notification_outbox').update({ status: 'skipped', error: nOn() ? 'no address' : 'email off' })
                .eq('id', n.id).then(() => {}, () => {});
              continue;
            }
            try {
              await nSend({
                to: n.email_to,
                subject: n.subject || 'Collarone',
                html: nWrap(n.subject || 'Collarone', `<p style="font-size:14px;line-height:1.6">${nEsc(n.body || '')}</p>`),
              });
              await admin.from('notification_outbox').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', n.id);
            } catch (e) {
              await admin.from('notification_outbox').update({ status: 'failed', error: String(e.message).slice(0, 300) })
                .eq('id', n.id).then(() => {}, () => {});
            }
          }
        } catch { /* never break health */ }

        // Chat @mention delivery: bell is instant via the spine; this sweep
        // adds email (and WhatsApp when the channel exists) through the same
        // shared sender. Marks messages notified either way so the queue
        // drains — a mention from before the key existed is stale news.
        try {
          const { emailEnabled: chatMailOn, sendMail: chatSend, wrap: chatWrap, esc: chatEsc, FROM_ADDR: chatFrom } = await import('./_lib/email.js');
          const { data: pending } = await admin.from('org_chat_messages')
            .select('id, org_id, room, body, mentions, author:profiles!author_id(name)')
            .eq('notified', false).not('mentions', 'eq', '{}').limit(20);
          for (const msg of pending || []) {
            if (chatMailOn()) {
              const { data: people } = await admin.from('profiles')
                .select('email, name').in('id', msg.mentions).eq('org_id', msg.org_id).eq('status', 'active');
              for (const p of people || []) {
                await chatSend({
                  to: p.email, from: `Collarone <${chatFrom}>`,
                  subject: `${msg.author?.name || 'A teammate'} mentioned you in team chat`,
                  html: chatWrap('You were mentioned', `
                    <p style="font-size:14px;line-height:1.6">Hi ${chatEsc(p.name || 'there')},</p>
                    <p style="font-size:14px;line-height:1.6"><strong>${chatEsc(msg.author?.name || 'A teammate')}</strong> mentioned you in <strong>#${chatEsc(msg.room === 'general' ? 'General' : 'your department room')}</strong>:</p>
                    <p style="font-size:14px;line-height:1.6;background:#f6f4ee;border-radius:10px;padding:10px 14px">${chatEsc(msg.body.slice(0, 300))}</p>
                    <p style="margin:18px 0"><a href="https://collarone.app/chat" style="background:#FF5B1F;color:#fff;text-decoration:none;padding:12px 22px;border-radius:100px;font-weight:700;font-size:14px">Open team chat</a></p>`),
                }).catch(() => {});
              }
            }
            await admin.from('org_chat_messages').update({ notified: true }).eq('id', msg.id);
          }
        } catch { /* chat notify must never break health */ }

        // Renewal dunning ladder (active -> past_due -> read_only -> suspended).
        // Only runs when the operator has explicitly switched enforcement on —
        // off by default so no live org is ever auto-suspended unwatched.
        if (process.env.PAYWALL_ENFORCE === 'true') {
          const { data: moved } = await admin.rpc('advance_billing_lifecycle');
          if (moved?.length) {
            // period end per org → the dedupe key, so each billing period can
            // notify once per rung even across repeated cron fires
            const { data: orgRows } = await admin.from('organizations')
              .select('id, current_period_end').in('id', moved.map((m) => m.id));
            const periodOf = Object.fromEntries((orgRows || []).map((o) => [o.id, o.current_period_end || 'na']));
            for (const row of moved) {
              const copy = DUNNING[row.to_status];
              if (!copy) continue;
              await sendBillingNotice(admin, {
                orgId: row.id, kind: row.to_status,
                dedupeKey: `${row.id}:${row.to_status}:${periodOf[row.id]}`,
                subject: copy.subject, heading: copy.heading,
                bodyHtml: copy.body, bannerMessage: copy.banner,
              });
            }
          }
        }
      }
    } catch {
      // never let logging history block reporting live status
    }
  }

  return res.status(200).json({ status, apiOk, dbOk, responseMs, clientErrorsLastHour, watchdog, build: buildId(), nginx: nginxStatus(), checkedAt: new Date().toISOString() });
}
