import { api, setAccessToken } from '../api/client.js';

// What to do with a freshly-established Google session, given the button that
// started it. Shared by the ID-token flow (GoogleButton) and the redirect
// landing (AuthCallback) so the login-vs-signup decision lives in exactly one
// place — the decision the founder cares about: a person with no workspace must
// be sent to sign up, not dropped into a blank app.
//
//   intent 'signup' → keep the session, carry them into the signup form which
//                     attaches a new org to this already-verified Google user.
//   intent 'login'  → if they have a workspace, log them in; if not, the orphan
//                     Google user Supabase just created is deleted server-side
//                     and they are sent to sign up with a plain explanation.
//
// Returns a route string for the caller to navigate to, and sets the user on
// success. Never throws — any failure resolves to the signup page rather than
// leaving someone stranded on a spinner.
export async function resolveGoogleSession({ session, intent, setUser }) {
  if (!session) return '/login?oauth_error=1';

  // Already a member? Then it's a normal sign-in for either intent.
  try {
    const { user: profile } = await api('/me');
    if (profile?.org?.status && profile.org.status !== 'suspended') {
      setAccessToken(session.access_token);
      setUser(profile);
      return '/';
    }
  } catch { /* no profile — fall through */ }

  if (intent === 'signup') {
    // Expected. The signup form reads email + name from the live session and
    // attaches the workspace to this user on submit.
    return '/signup?oauth=1';
  }

  // login intent, no workspace. Let the server confirm and delete the orphan,
  // then send them to sign up knowing which email they used.
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
        return '/';
      } catch { /* fall through to signup */ }
    }
    if (d.email) email = d.email;
  } catch { /* the redirect below still happens */ }

  // Drop the orphaned local session so the app isn't half-signed-in.
  try {
    const { supabase } = await import('./supabaseClient.js');
    await supabase.auth.signOut();
  } catch { /* ignore */ }
  setAccessToken(null);
  setUser(null);
  return `/signup?noaccount=1${email ? `&email=${encodeURIComponent(email)}` : ''}`;
}
