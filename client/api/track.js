// Vercel serverless function — records an anonymous page view for the
// Platform Admin analytics page. Deliberately no auth, no cookies, no IP
// storage: just a path and the country Vercel's edge already resolved for
// this request (x-vercel-ip-country), which is the only reason this needs
// to be a function instead of a direct browser->Supabase insert. Fire-and-
// forget — never let a tracking failure surface to the visitor.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.status(204).end(); // respond immediately; the visitor never waits on this
  if (!SERVICE_KEY) return;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const path = String(body.path || '/').slice(0, 200);
    const country = (req.headers['x-vercel-ip-country'] || 'XX').toString().slice(0, 2).toUpperCase();
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await admin.from('page_views').insert({ path, country });
  } catch {
    // best-effort only
  }
}
