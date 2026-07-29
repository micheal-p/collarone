-- ============================================================================
-- Team chat — org + department rooms with @mentions. Run after
-- hr_multitenancy.sql + org_events.sql. Idempotent.
--
-- Deliberately SCOPED (the decision, 2026-07-29): this is "the chat where
-- work lives", not a WhatsApp/Slack replacement — one General room per org,
-- one room per department, @mentions that notify. No DMs, no threads, no
-- presence in v1, so it can never grow into a second product.
--
-- Writes go through post_chat_message() (SECURITY DEFINER) so a message and
-- its mention events land atomically: mentions are validated against the
-- author's own org and each one becomes a chat.mention event on the spine
-- (the bell picks it up; the health sweep emails/WAs it when channels exist).
-- ============================================================================
create table if not exists public.org_chat_messages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  room        text not null default 'general',   -- 'general' | 'dept:<department_id>'
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  mentions    uuid[] not null default '{}',
  notified    boolean not null default false,     -- mention emails sent (health sweep)
  created_at  timestamptz not null default now()
);
create index if not exists org_chat_room_idx on public.org_chat_messages (org_id, room, created_at desc);
create index if not exists org_chat_notify_idx on public.org_chat_messages (notified) where not notified and cardinality(mentions) > 0;

alter table public.org_chat_messages enable row level security;
drop policy if exists org_chat_select on public.org_chat_messages;
create policy org_chat_select on public.org_chat_messages
  for select using (public.same_org(org_id));
-- inserts only via the RPC (definer); no direct client writes, no edits/deletes in v1

create or replace function public.post_chat_message(p_room text, p_body text, p_mentions uuid[] default '{}')
returns public.org_chat_messages
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org_id();
  v_author uuid := auth.uid();
  v_name text;
  v_clean uuid[];
  m uuid;
  row public.org_chat_messages;
begin
  if v_org is null or v_author is null then raise exception 'Not signed in'; end if;
  if p_room <> 'general' and p_room !~ '^dept:[0-9]+$' then raise exception 'Unknown room'; end if;
  if char_length(trim(p_body)) < 1 then raise exception 'Empty message'; end if;

  -- mentions must be active members of the author's own org
  select coalesce(array_agg(p.id), '{}') into v_clean
  from public.profiles p
  where p.id = any(coalesce(p_mentions, '{}')) and p.org_id = v_org and p.status = 'active'
    and p.id <> v_author;

  insert into public.org_chat_messages (org_id, room, author_id, body, mentions)
  values (v_org, p_room, v_author, left(trim(p_body), 2000), v_clean)
  returning * into row;

  select name into v_name from public.profiles where id = v_author;
  foreach m in array v_clean loop
    insert into public.org_events (org_id, type, actor_id, payload)
    values (v_org, 'chat.mention', v_author,
            jsonb_build_object('by', v_name, 'room', p_room, 'snippet', left(trim(p_body), 120), 'mentioned', m));
  end loop;

  return row;
end;
$$;
grant execute on function public.post_chat_message(text, text, uuid[]) to authenticated;

-- Realtime: stream inserts to org members (RLS applies to the stream).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'org_chat_messages'
  ) then
    alter publication supabase_realtime add table public.org_chat_messages;
  end if;
end $$;
