// The Google OAuth web client ID.
//
// This is PUBLIC by design — it is sent to Google on every sign-in and is
// visible in any OAuth request. Same category as the Supabase publishable key:
// safe to ship in the browser, safe to commit. The secret half (the client
// SECRET) lives only in Supabase's provider config and never comes near here.
//
// A build-time override is allowed so a different project can be pointed at
// without a code change; the fallback is the live "collarone" project's client.
export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID
  || '231109542661-pl1nlqu2a6m71o7n8ja4f02ah5oah2iq.apps.googleusercontent.com';

export const GOOGLE_ENABLED = Boolean(GOOGLE_CLIENT_ID);
