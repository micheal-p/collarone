-- Signup logo upload failed with an RLS violation for LOGGED-IN users: the
-- pending/ insert policy was granted to anon only, so an authenticated
-- session testing /signup fell through to the uid-folder policy and was
-- rejected. The pending/ prefix is safe for both roles. Idempotent.
drop policy if exists "org_logos_anon_insert" on storage.objects;
create policy "org_logos_anon_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'org-logos' and (storage.foldername(name))[1] = 'pending');
