-- ============================================================================
-- Org-Ops ERP — Self-service profile fields
-- Adds phone, whatsapp, avatar_url to profiles.
-- Creates a SECURITY DEFINER RPC so staff can update only these fields
-- (the existing RLS only lets super_admin do full profile updates).
-- Run after schema.sql. Idempotent.
-- ============================================================================

alter table public.profiles
  add column if not exists phone       text not null default '',
  add column if not exists whatsapp    text not null default '',
  add column if not exists avatar_url  text not null default '';

-- RPC: staff update only their own phone / whatsapp / avatar_url
create or replace function public.update_my_profile(
  p_phone      text,
  p_whatsapp   text,
  p_avatar_url text
)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.profiles
  set phone      = trim(p_phone),
      whatsapp   = trim(p_whatsapp),
      avatar_url = p_avatar_url
  where id = auth.uid();
end;
$$;

grant execute on function public.update_my_profile(text, text, text) to authenticated;

-- ---- Avatar storage bucket --------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict do nothing;

-- Users can manage only their own avatar file
drop policy if exists "avatars_select"  on storage.objects;
drop policy if exists "avatars_insert"  on storage.objects;
drop policy if exists "avatars_update"  on storage.objects;
drop policy if exists "avatars_delete"  on storage.objects;

create policy "avatars_select" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
