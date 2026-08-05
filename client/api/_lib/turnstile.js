// Verify a Cloudflare Turnstile token, server-side.
//
// Graceful by design: if TURNSTILE_SECRET is not configured, verification is
// SKIPPED and returns ok — so every public form keeps working exactly as today
// until Turnstile is actually set up. The moment the secret is set, a missing
// or invalid token is rejected. This lets the code ship ahead of the keys
// without breaking a single submission.
//
// Turnstile is Cloudflare's free, privacy-friendly CAPTCHA. It stops automated
// spam on anonymous forms where the database can't (the DB never sees the
// caller's IP; this function does, via the edge headers).
export async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return { ok: true, skipped: true };           // not configured yet — allow
  if (!token) return { ok: false, error: 'Please complete the "I am human" check and try again.' };
  try {
    const form = new URLSearchParams({ secret, response: String(token) });
    if (ip) form.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const d = await r.json().catch(() => ({}));
    if (d.success) return { ok: true };
    return { ok: false, error: 'That human check did not pass — please try again.' };
  } catch {
    // Never hard-fail a real user because Cloudflare was briefly unreachable.
    return { ok: false, error: 'Could not verify the human check right now — please retry in a moment.' };
  }
}

// The caller's IP from the edge headers, best-effort.
export function callerIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.headers['x-real-ip'] || null;
}
