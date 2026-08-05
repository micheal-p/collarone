// Turnstile-gated front door for the anonymous public forms that otherwise go
// straight from the browser to a Supabase RPC (careers application, embed lead
// form) — where the database can't see the caller's IP and so can't tell a
// human from a script. This function verifies the Turnstile token, then makes
// the exact same RPC call with the anonymous key (preserving the SECURITY
// DEFINER logic and RLS), so nothing about the data path changes — only a bot
// check is added in front.
//
// The client only routes here when a Turnstile site key is configured; until
// then it uses the original direct-RPC path and this function is dormant.
import { createClient } from '@supabase/supabase-js';
import { verifyTurnstile, callerIp } from './_lib/turnstile.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_vLEdOSIwgkVRPgh1ZM9G0A_SHSZ3qc5';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  const check = await verifyTurnstile(body.turnstileToken, callerIp(req));
  if (!check.ok) return res.status(400).json({ message: check.error });

  const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    if (body.action === 'careers-apply') {
      const { data, error } = await sb.rpc('public_submit_application', {
        p_requisition_id: body.requisitionId,
        p_name: body.name, p_email: body.email, p_phone: body.phone || '',
        p_portfolio_url: body.portfolioUrl || '', p_cover_letter: body.coverLetter || '',
        p_years_experience: body.yearsExperience ?? null, p_expected_salary: body.expectedSalary ?? null,
        p_resume_path: body.resumePath || null,
      });
      if (error) return res.status(400).json({ message: error.message });
      return res.status(200).json({ applicationId: data });
    }

    if (body.action === 'embed-lead') {
      const { error } = await sb.rpc('public_submit_lead', {
        p_org_slug: body.orgSlug, p_name: body.name, p_email: body.email || '',
        p_phone: body.phone || '', p_message: body.message || '',
      });
      if (error) return res.status(400).json({ message: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ message: 'Unknown form action' });
  } catch (e) {
    return res.status(500).json({ message: e.message || 'Submission failed' });
  }
}
