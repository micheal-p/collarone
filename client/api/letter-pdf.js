// Serve an issued HR letter as a PDF.
//
//   POST { letterId }  (Bearer token)  → application/pdf
//
// Authorisation reuses the pattern from doc-download.js rather than
// reimplementing it: the letter row is fetched THROUGH THE CALLER'S OWN
// session, so the existing hr_letters policy decides. That policy already says
// "HR managers see all of their org's letters; an employee sees letters issued
// to them" — exactly the rule this endpoint needs, and one that cannot drift
// out of sync with the rest of the product because it is the same rule.
//
// The service role is used for one thing only, after entitlement is settled:
// reading the letterhead, which an ordinary employee cannot see (its policy is
// HR-manager-only) but which their own letter is obviously printed on.
import { createClient } from '@supabase/supabase-js';
import { renderLetterPdf, letterFilename } from './_lib/letterPdf.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  || 'sb_publishable_vLEdOSIwgkVRPgh1ZM9G0A_SHSZ3qc5';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  if (!SERVICE_KEY) return res.status(500).json({ message: 'Server not configured.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const letterId = String(body.letterId || '');
  if (!letterId) return res.status(400).json({ message: 'letterId is required.' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Authentication required.' });

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return res.status(401).json({ message: 'Invalid session.' });

  // RLS decides. Same answer for "not yours" and "does not exist", so this
  // cannot be used to discover whether a given letter id is real.
  const { data: letter } = await asUser.from('hr_letters')
    .select('*, employee:profiles!employee_id(id,name,job_title)')
    .eq('id', letterId).maybeSingle();
  if (!letter) return res.status(403).json({ message: 'You do not have access to this letter.' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  let letterhead = {};
  const { data: lh } = letter.letterhead_id
    ? await admin.from('hr_letterheads').select('*').eq('id', letter.letterhead_id).maybeSingle()
    : await admin.from('hr_letterheads').select('*').eq('org_id', letter.org_id).eq('is_default', true).maybeSingle();
  if (lh) letterhead = lh;

  try {
    const pdf = await renderLetterPdf({ letter, letterhead, employee: letter.employee || {} });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${letterFilename(letter)}"`);
    res.setHeader('Content-Length', pdf.length);
    // Never cached: a letter is a personal document, and a shared cache holding
    // one is exactly the leak the restricted visibility work just closed.
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).end(pdf);
  } catch (e) {
    return res.status(500).json({ message: e.message || 'Could not build the PDF.' });
  }
}
