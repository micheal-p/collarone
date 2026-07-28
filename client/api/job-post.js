// Community Job Wall — write endpoint. Posters REGISTER once (a lightweight
// job-board account: no org/plan/payment) then post freely — the spam gate and
// the lead capture (posters = employers = ICP). Reads are public via RLS; writes
// go through the service role. 'structure' and 'create' require the poster's
// Bearer token; 'register' and 'report' are open. Actions:
//
//   POST { action: 'register', name, email, phone, company, password }
//     → creates the job-board account (auto-confirmed). Frontend then signs in.
//   POST { action: 'structure', raw }                       (Bearer)
//     → AI turns pasted WhatsApp job text into structured fields + a spam score,
//       for the poster to eyeball before publishing. No DB write. Falls back to
//       "put it all in the description" when AI isn't configured.
//   POST { action: 'create', title, company, location, payText, description,
//          applyMethod, applyContact, source, posterContact }
//     → publishes a post: slug, 21-day expiry (table default), quarantined to
//       'hidden' if it looks like spam. Returns { slug, url }.
//   POST { action: 'report', slug, reason }
//     → flags a post; auto-hides at 3 reports.
//
// Uses the app's existing OpenAI setup (same OPENAI_API_KEY/OPENAI_MODEL as
// ai-letter.js) rather than adding a second AI provider — one convention.
// NOTE: real per-IP rate-limiting is a v1.1 TODO (needs a store); today the
// guards are AI spam-scoring + reports + quarantine + length caps.
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL;
const AI_ENABLED = Boolean(OPENAI_API_KEY && OPENAI_MODEL);

const json = (res, s, o) => res.status(s).json(o);
const clean = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'job';
const rand = () => Math.random().toString(36).slice(2, 8);

// Server-side scam heuristic — runs on the FINAL content at publish time so the
// spam gate can't be bypassed by a client sending spam_score:0 or using the
// form path. Cheap, no AI call. Nigerian job-scam markers score high.
function spamHeuristic(text) {
  const t = String(text || '').toLowerCase();
  // "no registration fee" / "we don't charge a fee" / "beware of anyone asking
  // for a fee" are anti-scam REASSURANCES — the opposite of a scam. Never flag
  // on a fee phrase that has a negation word near it.
  const feeDemand = /\b(registration|application|sign[-\s]?up|activation|processing|screening)\s+fee\b/;
  const negatedFee = /\b(no|not|without|don'?t|won'?t|never|zero|free|beware|avoid)\b[\s\S]{0,24}\bfee\b/;
  const strong = [
    /pay(ing)?\s+(a\s+)?(fee|money|₦|naira)\s+(to|before)\s+(apply|start|get|join)/,
    /pay\s+(before|first|to)\s+(you\s+)?(apply|start|resume|begin)/,
    /send\s+(₦|naira|money|airtime|recharge)/,
  ];
  if (feeDemand.test(t) && !negatedFee.test(t)) return 0.9;
  if (strong.some((r) => r.test(t))) return 0.9;
  const weak = [/no experience (needed|required)/, /earn\s+₦?\s?\d[\d,]*\s*(daily|weekly|per\s*day|a\s*day)/, /work\s+from\s+home.*earn/, /urgent(ly)?\s+(hiring|needed)!/];
  const w = weak.filter((r) => r.test(t)).length;
  return w >= 2 ? 0.75 : w === 1 ? 0.5 : 0;
}

// Reporter identity for dedup. Tries the real client IP (proxy sets x-forwarded-for
// or x-real-ip); when none is available it falls back to the user-agent so
// header-less requests don't all collapse to a single 'unknown' reporter.
const clientIpHash = (req) => {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.headers['x-real-ip'] || req.socket?.remoteAddress || '';
  const fp = ip || String(req.headers['user-agent'] || '') || 'unknown';
  return crypto.createHash('sha256').update(fp).digest('hex').slice(0, 32);
};

async function aiStructure(raw) {
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
            'You clean up Nigerian job adverts pasted from WhatsApp into structured JSON. Return ONLY a JSON object with keys: ' +
            'is_job (boolean — false if the text is not actually a job advert), title (string), company (string), location (string), ' +
            'pay_text (string, e.g. "₦150,000/month" or "" if none), description (string — a tidied 1–3 sentence summary of the role and requirements), ' +
            'apply_method (one of "whatsapp","phone","email","link"), apply_contact (the number/email/URL to apply, or ""), ' +
            'spam_score (number 0–1: how likely this is spam or a scam — "pay to apply", "registration fee", vague get-rich promises score high). ' +
            'Keep the poster\'s facts; do not invent a company or pay. Nigerian business register.',
        },
        { role: 'user', content: raw },
      ],
      max_tokens: 500,
      temperature: 0.2,
    }),
  });
  if (!r.ok) throw new Error('ai_failed');
  const data = await r.json();
  return JSON.parse(data.choices?.[0]?.message?.content || '{}');
}

// Resolve the logged-in poster from their Bearer token, creating their
// job_posters row on first post if needed. Returns null when not authenticated.
async function authPoster(admin, req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return null;
  let { data: poster } = await admin.from('job_posters').select('id, email, phone, status, daily_limit').eq('id', user.id).maybeSingle();
  if (!poster) {
    const m = user.user_metadata || {};
    await admin.from('job_posters').insert({ id: user.id, name: m.name || '', email: user.email || '', phone: m.phone || '', company: m.company || '', role: m.role || '', website: m.website || '', about: m.about || '' });
    poster = { id: user.id, email: user.email || '', phone: m.phone || '', status: 'pending', daily_limit: 10 };
  }
  return poster;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  if (!SERVICE_KEY) return json(res, 500, { message: 'Server not configured.' });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { action } = body;

  try {
    // ---- platform-admin moderation (approve/reject posters) -----------------
    if (action === 'admin-list-posters' || action === 'admin-set-poster') {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) return json(res, 401, { message: 'Authentication required.' });
      const { data: { user } } = await admin.auth.getUser(token);
      if (!user) return json(res, 401, { message: 'Invalid session.' });
      const { data: pa } = await admin.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
      if (!pa) return json(res, 403, { message: 'Platform admins only.' });

      if (action === 'admin-list-posters') {
        const { data } = await admin.from('job_posters')
          .select('id, name, email, phone, company, role, website, about, status, mode, daily_limit, created_at')
          .order('created_at', { ascending: false }).limit(200);
        return json(res, 200, { posters: data || [] });
      }
      const status = ['pending', 'approved', 'suspended', 'rejected'].includes(body.status) ? body.status : null;
      if (!body.posterId || !status) return json(res, 400, { message: 'Bad request.' });
      await admin.from('job_posters').update({ status }).eq('id', body.posterId);
      return json(res, 200, { ok: true });
    }

    // ---- register a job-board account (open; starts PENDING approval) --------
    if (action === 'register') {
      const email = clean(body.email, 200).toLowerCase();
      const password = String(body.password || '');
      const name = clean(body.name, 120);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { message: 'Enter a valid email address.' });
      if (password.length < 6) return json(res, 400, { message: 'Password must be at least 6 characters.' });
      if (name.length < 2) return json(res, 400, { message: 'Enter your name.' });
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { name, phone: clean(body.phone, 40), company: clean(body.company, 120), role: clean(body.role, 80), website: clean(body.website, 200), about: clean(body.about, 600), poster: true },
      });
      if (cErr) {
        if (/registered|already|exists/i.test(cErr.message)) return json(res, 409, { message: 'That email is already registered — log in to post.' });
        return json(res, 500, { message: 'Could not create your account — try again.' });
      }
      await admin.from('job_posters').insert({
        id: created.user.id, name, email, phone: clean(body.phone, 40), company: clean(body.company, 120),
        role: clean(body.role, 80), website: clean(body.website, 200), about: clean(body.about, 600),
      });
      return json(res, 200, { ok: true, pending: true, message: 'Account created. You can post once the Collarone team approves you (usually within a day).' });
    }

    // ---- structure pasted text (Bearer + approved; no DB write) -------------
    if (action === 'structure') {
      const poster = await authPoster(admin, req);
      if (!poster) return json(res, 401, { message: 'Register or log in to post a job.' });
      if (poster.status !== 'approved') return json(res, 403, { message: poster.status === 'pending' ? 'Your account is still awaiting approval.' : 'Your posting account is not active.' });
      const raw = clean(body.raw, 4000);
      if (raw.length < 15) return json(res, 400, { message: 'Paste the job text first.' });
      if (!AI_ENABLED) {
        return json(res, 200, { fields: { title: '', company: '', location: '', payText: '', description: raw, applyMethod: 'whatsapp', applyContact: '', spamScore: 0 }, aiUsed: false });
      }
      try {
        const s = await aiStructure(raw);
        if (s.is_job === false) return json(res, 200, { notAJob: true });
        return json(res, 200, {
          aiUsed: true,
          fields: {
            title: clean(s.title, 120), company: clean(s.company, 120), location: clean(s.location, 120),
            payText: clean(s.pay_text, 60), description: clean(s.description, 2000),
            applyMethod: ['whatsapp', 'phone', 'email', 'link'].includes(s.apply_method) ? s.apply_method : 'whatsapp',
            applyContact: clean(s.apply_contact, 200), spamScore: Math.max(0, Math.min(1, Number(s.spam_score) || 0)),
          },
        });
      } catch {
        // AI hiccup — let them post via the form with the raw text prefilled
        return json(res, 200, { fields: { title: '', company: '', location: '', payText: '', description: raw, applyMethod: 'whatsapp', applyContact: '', spamScore: 0 }, aiUsed: false });
      }
    }

    // ---- publish (Bearer + approved + daily cap) ----------------------------
    if (action === 'create') {
      const poster = await authPoster(admin, req);
      if (!poster) return json(res, 401, { message: 'Register or log in to post a job.' });
      if (poster.status !== 'approved') return json(res, 403, { message: poster.status === 'pending' ? 'Your account is still awaiting approval.' : 'Your posting account is not active.' });

      // free-mode daily cap: posts since Lagos midnight (Nigeria is UTC+1, no DST)
      const lagosOffset = 60 * 60 * 1000;
      const since = new Date(Math.floor((Date.now() + lagosOffset) / 86400000) * 86400000 - lagosOffset).toISOString();
      const { count, error: capErr } = await admin.from('job_wall_posts')
        .select('id', { count: 'exact', head: true }).eq('poster_id', poster.id).gte('created_at', since);
      if (capErr) return json(res, 503, { message: 'Could not check your daily limit — try again in a moment.' }); // fail closed
      const limit = poster.daily_limit || 10;
      if ((count || 0) >= limit) return json(res, 429, { message: `You've reached your ${limit} posts for today — try again tomorrow.` });

      const title = clean(body.title, 120);
      const description = clean(body.description, 2000);
      if (title.length < 3) return json(res, 400, { message: 'Give the job a title.' });
      if (description.length < 15) return json(res, 400, { message: 'Add a few words about the job.' });

      const applyMethod = ['whatsapp', 'phone', 'email', 'link'].includes(body.applyMethod) ? body.applyMethod : 'whatsapp';
      // server heuristic on the FINAL content wins over any client value — the
      // quarantine can't be bypassed by sending spamScore:0 or via the form path
      const serverScore = spamHeuristic(`${title} ${description} ${clean(body.applyContact, 200)} ${clean(body.company, 120)}`);
      const spamScore = Math.max(serverScore, Math.max(0, Math.min(1, Number(body.spamScore) || 0)));
      // quarantine obvious spam/scams — inserted but not shown until reviewed
      const status = spamScore >= 0.7 ? 'hidden' : 'live';
      const slug = `${slugify(title)}-${rand()}`;

      const { data: post, error } = await admin.from('job_wall_posts').insert({
        slug, title, company: clean(body.company, 120), location: clean(body.location, 120),
        pay_text: clean(body.payText, 60), description,
        apply_method: applyMethod, apply_contact: clean(body.applyContact, 200),
        source: body.source === 'paste' ? 'paste' : 'form', status, spam_score: spamScore,
        poster_id: poster.id,
      }).select('slug, expires_at, status').single();
      if (error) return json(res, 500, { message: 'Could not post the job — try again.' });

      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      return json(res, 200, {
        slug: post.slug,
        url: `${proto}://${host}/jobs/${post.slug}`,
        expiresAt: post.expires_at,
        quarantined: post.status === 'hidden',
      });
    }

    // ---- report -------------------------------------------------------------
    // Open (no login), but deduped by reporter IP so one person can't hide a post
    // by spamming reports: each IP counts once, and report_count is the true
    // distinct count (recounted, not read-then-incremented). Auto-hide at 3
    // DISTINCT reporters — reversible by the platform admin.
    if (action === 'report') {
      const slug = clean(body.slug, 60);
      const { data: post } = await admin.from('job_wall_posts').select('id').eq('slug', slug).maybeSingle();
      if (!post) return json(res, 404, { message: 'Post not found.' });
      await admin.from('job_wall_reports')
        .upsert({ post_id: post.id, reporter_ip: clientIpHash(req), reason: clean(body.reason, 300) }, { onConflict: 'post_id,reporter_ip', ignoreDuplicates: true });
      const { count, error: rcErr } = await admin.from('job_wall_reports').select('id', { count: 'exact', head: true }).eq('post_id', post.id);
      if (rcErr || count == null) return json(res, 200, { ok: true }); // report saved; don't overwrite the count with a bad read
      await admin.from('job_wall_posts').update({ report_count: count, ...(count >= 3 ? { status: 'hidden' } : {}) }).eq('id', post.id);
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { message: 'Unknown action.' });
  } catch (e) {
    return json(res, 500, { message: e.message || 'Job wall error.' });
  }
}
