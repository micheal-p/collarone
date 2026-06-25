// Vercel serverless function — privileged admin operations that require the
// Supabase SERVICE ROLE key. Runs server-side only; the key never reaches the
// browser. Set SUPABASE_SERVICE_KEY (and optionally SUPABASE_URL) in Vercel env.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const json = (res, status, obj) => res.status(status).json(obj);

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  if (!SERVICE_KEY) return json(res, 500, { message: 'Server not configured: SUPABASE_SERVICE_KEY missing.' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  // --- authenticate the caller and require System Admin ---
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(res, 401, { message: 'Authentication required.' });
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json(res, 401, { message: 'Invalid session.' });

  const { data: caller } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (!caller || caller.role !== 'super_admin') return json(res, 403, { message: 'System Admin access required.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { action } = body;

  try {
    if (action === 'create') {
      const { name, email, password, role = 'staff', jobTitle = '', department = '', suites = [] } = body;
      if (!name || !email || !password) return json(res, 400, { message: 'Name, email and password are required.' });
      if (password.length < 8) return json(res, 400, { message: 'Temporary password must be at least 8 characters.' });
      const cleanEmail = email.toLowerCase().trim();

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: cleanEmail, password, email_confirm: true, user_metadata: { name },
      });
      if (cErr) return json(res, /registered|exists/i.test(cErr.message) ? 409 : 400, { message: cErr.message });

      const row = {
        id: created.user.id, email: cleanEmail, name: name.trim(), job_title: jobTitle, department,
        role, suites: role === 'super_admin' ? [] : (Array.isArray(suites) ? suites : []),
        status: 'active', must_change_password: true,
      };
      const { data: profile, error: pErr } = await admin.from('profiles').insert(row).select().single();
      if (pErr) { await admin.auth.admin.deleteUser(created.user.id); return json(res, 400, { message: pErr.message }); }
      return json(res, 201, profile);
    }

    if (action === 'reset-password') {
      const { id, password } = body;
      if (!password || password.length < 8) return json(res, 400, { message: 'Temporary password must be at least 8 characters.' });
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json(res, 400, { message: error.message });
      await admin.from('profiles').update({ must_change_password: true }).eq('id', id);
      return json(res, 200, { ok: true });
    }

    if (action === 'set-status') {
      const { id, status } = body;
      if (!['active', 'disabled'].includes(status)) return json(res, 400, { message: 'Invalid status.' });
      if (id === user.id) return json(res, 400, { message: 'You cannot change your own account status.' });
      // Ban at the auth layer so the change takes effect immediately.
      await admin.auth.admin.updateUserById(id, { ban_duration: status === 'disabled' ? '876000h' : 'none' });
      const { data: profile, error } = await admin.from('profiles').update({ status }).eq('id', id).select().single();
      if (error) return json(res, 400, { message: error.message });
      return json(res, 200, profile);
    }

    return json(res, 400, { message: `Unknown action: ${action}` });
  } catch (e) {
    return json(res, 500, { message: e.message || 'Admin operation failed.' });
  }
}
