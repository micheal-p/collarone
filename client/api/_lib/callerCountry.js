// Which country the request came from, according to the edge in front of us.
//
// THE BUG THIS EXISTS TO STOP HAPPENING TWICE
//
// Three call sites read `x-vercel-ip-country` directly. That header is set by
// Vercel's edge, and Collarone stopped being served by Vercel when it moved to
// nginx on the VPS behind Cloudflare. The header has not arrived since. So:
//
//   * every analytics page view has been filed under country "XX", and
//   * the Nigeria-only payroll gate in admin.js has been completely inert,
//     because it is written `if (ipCountry && ipCountry !== 'NG')` and an empty
//     string skips the check. It still returned a warning to the UI saying
//     payroll had been withheld, which was not true.
//
// Nothing threw. A gate that silently stops gating is the failure mode this
// codebase already has a test for in the secrets case (no_fail_open_secrets),
// and this is the same shape wearing a different hat.
//
// Cloudflare is the edge now, so cf-ipcountry is the real source. The Vercel
// header is kept as a fallback purely so the published tenant sites behave
// identically if anything is ever fronted differently, and it costs nothing.
//
// Returns an uppercase two-letter code, or '' when the edge did not say. The
// empty case is REAL and must be handled by the caller: Cloudflare omits the
// header for its own internal requests, and any future change of edge brings it
// back. Do not write `if (country && ...)` — decide explicitly what an unknown
// country means for your check, and say so.
export function callerCountry(req) {
  const raw = req.headers['cf-ipcountry']
    || req.headers['x-vercel-ip-country']
    || '';
  const code = String(raw).trim().toUpperCase();
  // Cloudflare uses XX for unknown and T1 for Tor. Neither is a country, and
  // both should be treated as "the edge did not say".
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') return '';
  return code;
}
