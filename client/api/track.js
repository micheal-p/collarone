// Vercel serverless function — records an anonymous page view for the
// Platform Admin analytics page. Deliberately no auth, no cookies, no IP
// storage: just a path and the country Vercel's edge already resolved for
// this request (x-vercel-ip-country), which is the only reason this needs
// to be a function instead of a direct browser->Supabase insert.
//
// The insert is awaited before responding — the container can be frozen the
// instant the response flushes, so anything fired-and-forgotten after
// res.end() is not reliably delivered. The frontend beacon itself doesn't
// wait on this either way (see App.jsx's usePageViewTracking), so the extra
// round-trip here costs the visitor nothing.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!SERVICE_KEY) return res.status(204).end();
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const path = String(body.path || '/').slice(0, 200);
    const country = (req.headers['x-vercel-ip-country'] || 'XX').toString().slice(0, 2).toUpperCase();
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    if (body.orgSlug) {
      // a customer's public website page — this is THEIR traffic, org-scoped,
      // surfaced back to them in the Website builder's Insights tab
      const { data: org } = await admin.from('organizations').select('id').eq('slug', String(body.orgSlug).slice(0, 60)).maybeSingle();
      if (org) {
        await admin.from('site_visits').insert({ org_id: org.id, page: path, country });
      } else {
        // unknown/renamed slug — don't lose the visit entirely
        await admin.from('page_views').insert({ path: `/site/${String(body.orgSlug).slice(0, 60)}:${path}`.slice(0, 200), country });
      }
    } else {
      await admin.from('page_views').insert({ path, country });
    }
  } catch {
    // best-effort only — never surface a tracking failure to the visitor
  }
  return res.status(204).end();
}
