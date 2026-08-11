import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { supabase } from '../lib/supabaseClient.js';
import { resolveGoogleSession } from '../lib/oauthSession.js';

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

      const route = await resolveGoogleSession({ session, intent, setUser });
      nav(route, { replace: true });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', gap: 14 }} aria-live="polite">
      <span className="boot-spinner" />
      <span style={{ color: 'var(--text-2)', fontSize: 14 }}>Finishing sign-in…</span>
    </div>
  );
}
