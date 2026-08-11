import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { api, setAccessToken } from '../api/client.js';

// Where a Google sign-in lands before it becomes either a logged-in session or
// a trip to the signup page.
//
// The whole reason this screen exists is the case the founder asked for:
// someone with no Collarone account clicks "Continue with Google". Google is
// happy to sign them in — it has no idea whether they are a customer — so they
// arrive holding a valid session that maps to no workspace. This page is what
// notices that and sends them to sign up instead of dropping them into a blank
// app.
//
// `intent` (set when the button was pressed) decides what "no workspace" means:
//   signup — expected. Keep the session and carry them into the signup form,
//            which will attach a new org to this already-verified Google user.
//   login  — they meant to sign in but have no account. The orphan Google user
//            Supabase just created is deleted server-side (so the email stays
//            free for a real signup or for an admin to add them as staff), and
//            they are sent to signup with a plain explanation.
export default function AuthCallback() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [msg, setMsg] = useState('Finishing sign-in…');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;   // StrictMode double-invoke guard
    ran.current = true;
    const intent = params.get('intent') === 'signup' ? 'signup' : 'login';

    (async () => {
      // The supabase client parses the redirect and stores the session; give it
      // a beat, then read it back rather than trusting timing.
      let session = null;
      for (let i = 0; i < 20; i++) {
        ({ data: { session } } = await supabase.auth.getSession());
        if (session) break;
        await new Promise((r) => setTimeout(r, 150));
      }
      if (!session) {
        // The OAuth handshake itself failed (denied consent, expired code).
        nav('/login?oauth_error=1', { replace: true });
        return;
      }

      // Already a member? Then this is a normal sign-in for either intent.
      try {
        const { user: profile } = await api('/me');
        if (profile?.org?.status && profile.org.status !== 'suspended') {
          setAccessToken(session.access_token);
          setUser(profile);
          nav('/', { replace: true });
          return;
        }
      } catch { /* no profile — falls through to the no-account handling */ }

      if (intent === 'signup') {
        // Expected path. Keep the Google session; the signup form reads the
        // email and name from it and attaches the new workspace to this user.
        nav('/signup?oauth=1', { replace: true });
        return;
      }

      // login intent, no workspace. Let the server confirm and clean up the
      // orphan, then send them to sign up knowing which email they used.
      setMsg('Setting up your account…');
      let email = session.user?.email || '';
      try {
        const r = await fetch('/api/oauth-resolve', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const d = await r.json().catch(() => ({}));
        if (d.hasAccount) {
          // A race — the profile appeared. Treat as a normal login.
          try {
            const { user: profile } = await api('/me');
            setAccessToken(session.access_token);
            setUser(profile);
            nav('/', { replace: true });
            return;
          } catch { /* fall through to signup */ }
        }
        if (d.email) email = d.email;
      } catch { /* the redirect below still happens */ }

      // Drop the now-orphaned local session so the app isn't half-signed-in.
      try { await supabase.auth.signOut(); } catch { /* ignore */ }
      setAccessToken(null);
      setUser(null);
      nav(`/signup?noaccount=1${email ? `&email=${encodeURIComponent(email)}` : ''}`, { replace: true });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', gap: 14 }} aria-live="polite">
      <span className="boot-spinner" />
      <span style={{ color: 'var(--text-2)', fontSize: 14 }}>{msg}</span>
    </div>
  );
}
