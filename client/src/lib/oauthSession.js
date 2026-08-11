import { api, setAccessToken } from '../api/client.js';

// What to do with a freshly-established Google session, given the button that
// started it. Shared by the ID-token flow (GoogleButton) and the redirect
// landing (AuthCallback) so the login-vs-signup decision lives in exactly one
// place — the decision the founder cares about: a person with no workspace must
// be sent to sign up, not dropped into a blank app.
//
//   intent 'signup' → keep the session, carry them into the signup form which
//                     attaches a new org to this already-verified Google user.
//   intent 'login'  → if they have a workspace, log them in; if not, they are
//                     carried into signup with their Google session intact and
//                     prefilled — no dead-end, no orphan-deletion dance.
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

  // No workspace — for EITHER intent. Keep the Google session and carry them
  // into the signup form, prefilled. This is the conversion path the founder
  // cares about, and it fixes the trap where a login with no account showed a
  // "no workspace linked" dead-end next to a "Sign in as you" button that just
  // looped. `from=login` lets signup explain why they're there.
  //
  // The session is deliberately NOT torn down and the Google user NOT deleted:
  // that same user becomes their real account the moment they finish signup,
  // and repeated Google sign-ins return the same user (Supabase dedupes by
  // provider identity) so orphans don't multiply. A user who abandons signup
  // leaves one dangling profile-less auth row — harmless, and the right place
  // to reap it is a periodic sweep, not the middle of a hopeful signup.
  return `/signup?oauth=1${intent === 'login' ? '&from=login' : ''}`;
}

