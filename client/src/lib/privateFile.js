// Download a private file through the authorised server route.
//
// Client code used to call supabase.storage.createSignedUrl() directly, which
// only ever checked "is this object in your company's folder" — so any
// employee could sign a URL for a colleague's warning letter. /api/doc-download
// re-asks the question properly: it looks the file up in its owning table
// using the caller's own session, so the same row-level rules the UI obeys
// decide whether the file may be handed over.
//
// Every private bucket goes through here. If you add a bucket, add a probe to
// client/api/doc-download.js — a bucket with no probe is refused, which is the
// safe direction to fail.
import { supabase } from './supabaseClient.js';

export async function privateFileUrl(bucket, path) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in again to download this file.');
  const res = await fetch('/api/doc-download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ bucket, path }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.url) throw new Error(d.message || 'Could not open this file.');
  return d.url;
}
