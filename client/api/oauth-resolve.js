// After a Google sign-in, decide who this person is to Collarone.
//
// Google OAuth creates a Supabase auth user on the FIRST sign-in, whether or
// not that person has a Collarone workspace. So a visitor who clicks "Continue
// with Google" on the login page, but has never signed up, ends up holding a
// valid session that maps to nothing — an orphan. Left alone it is worse than
// useless: it sits on the email so that when an admin later tries to add that
// person as staff, the create fails with "already registered".
//
//   POST  (Bearer token from the Google session)
//     → { hasAccount: true }                      already a member — log them in
//     → { hasAccount: false, email, cleaned: true } no workspace — orphan deleted,
//                                                   send them to sign up
//
// The one destructive thing it does — deleting the auth user — happens ONLY
// when the caller has no profile. A user WITH a profile is never touched, so a
// bug here can lose an unused orphan but never a real account.
//
// auth.users is mutated through the GoTrue admin API, never raw SQL — the
// standing rule for this project.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  if (!SERVICE_KEY) return res.status(500).json({ message: 'Server not configured.' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Authentication required.' });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  // Who is the session for? getUser validates the JWT signature and expiry, so
  // this cannot be spoofed with a made-up id.
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return res.status(401).json({ message: 'Invalid session.' });

  // Do they have a Collarone profile with a live workspace?
  const { data: profile } = await admin.from('profiles')
    .select('id, status, org_id, organizations:org_id(status)')
    .eq('id', user.id)
    .maybeSingle();

  const hasWorkspace = profile?.org_id
    && profile.status === 'active'
    && profile.organizations?.status !== 'suspended';

  if (hasWorkspace) {
    return res.status(200).json({ hasAccount: true });
  }

  // No workspace. If a profile row exists at all (e.g. a half-finished state),
  // do NOT delete the user — that is a real record and someone should look at
  // it. Only a truly profile-less orphan is cleaned up.
  if (profile) {
    return res.status(200).json({ hasAccount: false, email: user.email || '', cleaned: false });
  }

  // A pure orphan: a Google auth user with nothing attached. Remove it so the
  // email is free for a proper signup, or for an admin to add them as staff.
  let cleaned = false;
  try {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    cleaned = !error;
  } catch { /* best effort — the redirect to signup still happens either way */ }

  return res.status(200).json({ hasAccount: false, email: user.email || '', cleaned });
}
