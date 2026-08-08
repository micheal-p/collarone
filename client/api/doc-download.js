// One authorised download route for every private file in the product.
//
// The problem it solves: storage_tenant_isolation.sql scopes bucket reads by
// ORGANISATION and nothing else. So any authenticated employee could sign a URL
// for any object in their company's folder — including colleagues' warning
// letters, query letters, disciplinary attachments and filed invoices. Walled
// off from other companies, wide open to the person sitting next to you. The
// Documents suite is sold on "control who sees what", which made this the
// module's central promise and its central hole.
//
// How authorisation works here — deliberately NOT reimplemented.
// Every one of these files already has a row in a table with correct
// row-level policies (a letter belongs to an employee, a document has
// org/restricted visibility and a grant list, a report belongs to a task in
// your department). So instead of writing a second, drifting copy of those
// rules in JavaScript, this route asks the database the same question the UI
// would: it queries the owning table THROUGH THE CALLER'S OWN JWT, with RLS
// switched on. If the caller cannot see the row, they cannot have the file.
// The service role is used for exactly one thing afterwards — minting the
// signed URL — and never to decide who is allowed.
//
//   POST { bucket, path }  (Bearer token)
//     → { url }  a 60-second signed URL
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  || 'sb_publishable_vLEdOSIwgkVRPgh1ZM9G0A_SHSZ3qc5';

const json = (res, status, obj) => res.status(status).json(obj);

// bucket -> how to prove the caller is entitled to a file at `path`.
// Each probe runs as the CALLER, so RLS is the actual gate.
const PROBES = {
  'employee-documents': async (db, path) =>
    (await db.from('employee_documents').select('id').eq('file_path', path).maybeSingle()).data,
  'hr-letters': async (db, path) =>
    (await db.from('hr_letters').select('id').eq('file_path', path).maybeSingle()).data,
  'org-documents': async (db, path) =>
    (await db.from('documents').select('id').eq('file_path', path).maybeSingle()).data,
  'candidate-resumes': async (db, path) =>
    (await db.from('candidates').select('id').eq('resume_path', path).maybeSingle()).data,
  // Attachments live inside a jsonb array on the report, so match by
  // containment rather than equality. RLS on task_reports still decides.
  'task-attachments': async (db, path) =>
    (await db.from('task_reports').select('id')
      .contains('attachments', JSON.stringify([{ path }])).limit(1).maybeSingle()).data,
  'finance-receipts': async (db, path) =>
    (await db.from('expenses').select('id').eq('receipt_path', path).maybeSingle()).data,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  if (!SERVICE_KEY) return json(res, 500, { message: 'Server not configured.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const bucket = String(body.bucket || '');
  const path = String(body.path || '');
  if (!PROBES[bucket]) return json(res, 400, { message: 'Unknown file store.' });
  if (!path || path.includes('..')) return json(res, 400, { message: 'Bad file path.' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(res, 401, { message: 'Authentication required.' });

  // As the caller: anon key + their JWT, so every policy applies to this query.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json(res, 401, { message: 'Invalid session.' });

  let row = null;
  try { row = await PROBES[bucket](asUser, path); } catch { row = null; }
  // Same answer for "does not exist" and "not yours" — otherwise this route
  // becomes an oracle for which files exist in a company.
  if (!row) return json(res, 403, { message: 'You do not have access to this file.' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return json(res, 502, { message: 'Could not prepare the download.' });
  return json(res, 200, { url: data.signedUrl });
}
