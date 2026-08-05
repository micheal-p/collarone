import { createClient } from '@supabase/supabase-js';

// The publishable (anon) key is designed to ship in the browser — safe to commit.
// The SECRET/service key must NEVER appear here; it lives only in the Vercel
// /api/admin function's server-side env.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_vLEdOSIwgkVRPgh1ZM9G0A_SHSZ3qc5';

export const supabase = createClient(url, anonKey, {
  // detectSessionInUrl: true so the Microsoft (Azure) OAuth redirect completes itself.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

export const SUPABASE_CONFIGURED = Boolean(url && anonKey);

// The org id of the signed-in user, cached for the tab's lifetime.
//
// Every private storage bucket is scoped by making the org id the first path
// segment, and the matching RLS policy refuses to read or write a path whose
// first folder is not your org. So an upload MUST be prefixed with this, or it
// will be written somewhere its own uploader can never read back. Uploaders
// call currentOrgId() and put it first. Anonymous flows (careers) can't use
// this — they pass the org id they already hold explicitly.
let _orgIdPromise = null;
export const currentOrgId = async () => {
  if (!_orgIdPromise) {
    _orgIdPromise = (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');
      const { data, error } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
      if (error) throw new Error(error.message);
      return data.org_id;
    })().catch((e) => { _orgIdPromise = null; throw e; });  // don't cache a failure
  }
  return _orgIdPromise;
};
