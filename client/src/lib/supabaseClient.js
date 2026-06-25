import { createClient } from '@supabase/supabase-js';

// The publishable (anon) key is designed to ship in the browser — safe to commit.
// The SECRET/service key must NEVER appear here; it lives only in the Vercel
// /api/admin function's server-side env.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_vLEdOSIwgkVRPgh1ZM9G0A_SHSZ3qc5';

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const SUPABASE_CONFIGURED = Boolean(url && anonKey);
