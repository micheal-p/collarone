// API handler, mounted by server/index.js on the VPS — records an anonymous
// page view for the Platform Admin analytics page, and files Content-Security-
// Policy violation reports. Deliberately no auth, no cookies, no IP storage:
// just a path and the country the edge in front of us already resolved, which
// is the only reason this needs to be a handler rather than a direct
// browser->Supabase insert.
//
// That country came from Vercel's edge until this moved to nginx behind
// Cloudflare, after which the header simply stopped arriving and every row was
// filed as "XX" without anything failing. _lib/callerCountry.js now owns
// reading it, for that reason.
//
// The insert is awaited before responding — the container can be frozen the
// instant the response flushes, so anything fired-and-forgotten after
// res.end() is not reliably delivered. The frontend beacon itself doesn't
// wait on this either way (see App.jsx's usePageViewTracking), so the extra
// round-trip here costs the visitor nothing.
import { createClient } from '@supabase/supabase-js';
import { callerCountry, callerCity } from './_lib/callerCountry.js';
import { deviceClass, referrerHost } from './_lib/visitorSignals.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!SERVICE_KEY) return res.status(204).end();
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const path = String(body.path || '/').slice(0, 200);
    // 'XX' stays the stored value for "we don't know", which is what every row
    // has said since the Vercel header stopped arriving. See _lib/callerCountry.js.
    const country = callerCountry(req) || 'XX';
    // Anonymous dimensions, see _lib/visitorSignals.js: a device CLASS and a
    // referring HOST are stored, the user agent and full referrer URL are not.
    const device = deviceClass(req.headers['user-agent']);
    const referrer = referrerHost(body.referrer);
    const city = callerCity(req) || null;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // A Content-Security-Policy violation, posted by the browser itself to the
    // policy's report-uri. Recorded so the Report-Only policy finally collects
    // evidence: until now it shipped a real policy, logged what it WOULD block
    // to nobody, and could therefore never be promoted to enforcing with any
    // confidence.
    //
    // Tagged `[csp]` and excluded from the degraded threshold in health.js, for
    // the same reason `[third-party]` is: a policy missing one font host would
    // otherwise fire thousands of reports and tell every customer we were down.
    // A violation is something to fix, not an outage.
    const cspReport = body['csp-report'] || (Array.isArray(body) && body[0]?.body) || null;
    if (cspReport) {
      const directive = String(cspReport['effective-directive'] || cspReport['violated-directive'] || cspReport.effectiveDirective || 'unknown').slice(0, 60);
      const blocked = String(cspReport['blocked-uri'] || cspReport.blockedURL || 'unknown').slice(0, 300);
      const docUri = String(cspReport['document-uri'] || cspReport.documentURL || '');
      // A CSP report carries no body.path, so the generic `path` above would
      // record every violation as "/". The page is in document-uri instead.
      let cspPath = path;
      try { if (docUri) cspPath = new URL(docUri).pathname.slice(0, 200); } catch { /* keep the default */ }
      await admin.from('client_errors').insert({
        message: `[csp] ${directive} blocked ${blocked}`.slice(0, 480),
        stack: docUri.slice(0, 3000) || null,
        path: cspPath,
        user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
      });
      return res.status(204).end();
    }

    if (body.type === 'client_error') {
      // a real crash in someone's browser — the uptime checks can't see these,
      // so this is the only record that it happened
      const stack = String(body.stack || '').slice(0, 3000);

      // Third-party scripts crash in our page and we cannot fix them. Cloudflare's
      // own analytics beacon, injected automatically because the domain is
      // proxied, throws `t.entries.at is not a function` on browsers too old for
      // Array.prototype.at. Nothing of ours is broken, but the row still landed
      // in the inbox AND counted toward the ten-an-hour threshold that flips the
      // PUBLIC status page to degraded — so somebody else's bug, on somebody
      // else's script, could tell your customers you were having an outage.
      //
      // Tagged rather than dropped: still visible to us (a third-party script
      // breaking for real users is worth knowing), but excluded from the health
      // threshold in client/api/health.js, which cannot count what it cannot fix.
      const THIRD_PARTY = /cloudflareinsights\.com|googletagmanager\.com|google-analytics\.com|hotjar\.com|facebook\.net|clarity\.ms/i;
      const isOurs = !stack || /collarone\.app|\/assets\//.test(stack);
      const thirdParty = THIRD_PARTY.test(stack) && !isOurs;

      await admin.from('client_errors').insert({
        message: (thirdParty ? '[third-party] ' : '') + String(body.message || 'Unknown error').slice(0, 480),
        stack: stack || null,
        path,
        user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
      });
      return res.status(204).end();
    }

    if (body.orgSlug) {
      // a customer's public website page — this is THEIR traffic, org-scoped,
      // surfaced back to them in the Website builder's Insights tab
      const { data: org } = await admin.from('organizations').select('id').eq('slug', String(body.orgSlug).slice(0, 60)).maybeSingle();
      if (org) {
        await admin.from('site_visits').insert({ org_id: org.id, page: path, country });
      } else {
        // unknown/renamed slug — don't lose the visit entirely
        await admin.from('page_views').insert({ path: `/site/${String(body.orgSlug).slice(0, 60)}:${path}`.slice(0, 200), country, device, referrer, city });
      }
    } else {
      await admin.from('page_views').insert({ path, country, device, referrer, city });
    }
  } catch {
    // best-effort only — never surface a tracking failure to the visitor
  }
  return res.status(204).end();
}
