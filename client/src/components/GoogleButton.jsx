import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { resolveGoogleSession } from '../lib/oauthSession.js';
import { GOOGLE_CLIENT_ID, GOOGLE_ENABLED } from '../config/google.js';

// "Continue with Google", done so Google shows collarone.app — not the Supabase
// project host.
//
// The obvious way (supabase.auth.signInWithOAuth) REDIRECTS through Supabase's
// own auth endpoint, so Google's screen reads "to continue to
// <project>.supabase.co" — which looks like someone else's site on the one
// screen where a new customer is deciding whether to trust us. This uses Google
// Identity Services instead: the sign-in happens directly between the browser
// and Google, on our origin, and Supabase is handed the resulting ID token
// afterwards. Google never sits in the redirect, so it shows collarone.app.
// Same end state — a Supabase session — with no paid custom domain and no
// project ref on screen.
//
// The GIS script is loaded from accounts.google.com. The site sets no CSP, so
// nothing blocks it; if a CSP is ever added, accounts.google.com must be
// allow-listed in script-src/frame-src/connect-src or this stops working.

let gisPromise = null;
function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

// A nonce binds this ID token to this sign-in attempt, so a token stolen in
// transit can't be replayed. Google is given the SHA-256 hash; Supabase is
// given the raw value and re-hashes to compare.
function rawNonce() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export default function GoogleButton({ intent = 'login', label }) {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const holder = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const nonceRef = useRef('');

  useEffect(() => {
    if (!GOOGLE_ENABLED) return;
    let cancelled = false;

    (async () => {
      try {
        await loadGis();
        if (cancelled || !holder.current) return;
        const raw = rawNonce();
        nonceRef.current = raw;
        const hashed = await sha256Hex(raw);

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: hashed,
          // Only email + basic profile are ever requested; nothing sensitive,
          // so no Google verification is required to publish.
          callback: async (resp) => {
            setBusy(true); setErr('');
            try {
              const { data, error } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: resp.credential,
                nonce: nonceRef.current,
              });
              if (error) throw error;
              const route = await resolveGoogleSession({ session: data.session, intent, setUser });
              nav(route, { replace: true });
            } catch (e) {
              setErr('That didn’t work. Please try again, or use your email.');
              setBusy(false);
            }
          },
        });

        // Google's own rendered button — the reliable trigger (One Tap is
        // subject to browser third-party-cookie and FedCM quirks). Width is
        // fixed to the container; text follows the intent.
        window.google.accounts.id.renderButton(holder.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: intent === 'signup' ? 'signup_with' : 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width: holder.current.offsetWidth || 320,
        });
      } catch (e) {
        if (!cancelled) setErr('Google sign-in is unavailable right now. Please use your email.');
      }
    })();

    return () => { cancelled = true; };
  }, [intent, nav, setUser]);

  if (!GOOGLE_ENABLED) return null;

  return (
    <div className="google-signin">
      {/* Google renders its official button in here. A min-height keeps the
          layout from jumping while the script loads. */}
      <div ref={holder} className="google-signin-holder" aria-label={label || 'Continue with Google'} />
      {busy && <div className="google-signin-busy"><span className="spinner" /> Signing you in…</div>}
      {err && <div className="error-text" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}
