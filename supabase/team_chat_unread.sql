-- ============================================================================
-- Team chat, part 3 — unread counts, the WhatsApp badge.
-- Run after team_chat_groups.sql. Idempotent.
--
-- One row per person per room holding "I have read up to here". Everything
-- newer than that watermark, from somebody else, is unread. Counts are per room
-- and the topbar shows the total.
--
-- chat_unread_counts() is deliberately SECURITY INVOKER (the default) — the one
-- function here that must NOT be definer. It reads org_chat_messages directly,
-- so the room-level SELECT policy from team_chat_groups.sql does the filtering
-- for free: you cannot be told there are 12 unread in a room you're not in,
-- which would leak both the room's existence and its traffic.
-- ============================================================================

create table if not exists public.chat_reads (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  room          text not null,
  last_read_at  timestamptz not null default now(),
  primary key (user_id, room)
);

alter table public.chat_reads enable row level security;

-- Your own watermarks, nobody else's — this is a read-receipt trail, and it
-- says who was online reading what. Not a thing colleagues get to browse.
drop policy if exists chat_reads_own on public.chat_reads;
create policy chat_reads_own on public.chat_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.mark_chat_room_read(p_room text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not public.can_read_chat_room(p_room) then raise exception 'You are not in that room'; end if;
  insert into public.chat_reads (user_id, room, last_read_at)
  values (auth.uid(), p_room, now())
  on conflict (user_id, room) do update set last_read_at = now();
end;
$$;
grant execute on function public.mark_chat_room_read(text) to authenticated;

-- INVOKER on purpose — see the header. Never add `security definer` here.
create or replace function public.chat_unread_counts()
returns table (room text, unread bigint)
language sql stable set search_path = public as $$
  select m.room, count(*)
  from public.org_chat_messages m
  left join public.chat_reads r
    on r.user_id = auth.uid() and r.room = m.room
  where m.author_id <> auth.uid()
    and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
  group by m.room;
$$;
grant execute on function public.chat_unread_counts() to authenticated;
