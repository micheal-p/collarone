-- ============================================================================
-- Team chat, part 2 — admin-managed groups, and department rooms made private.
-- Run after team_chat.sql. Idempotent.
--
-- The decision (2026-08-02): General stays General. Every member of the org is
-- in it automatically, nobody can be removed from it, and no admin renames it —
-- that "everyone is already here" property is the whole point of the room and
-- membership plumbing must not quietly take it away.
--
-- What's new is a third room kind: 'group:<uuid>', an admin-created room with a
-- name and an explicit member list. Admins create it, name it, add and remove
-- people, and see who's in it.
--
-- Also closes a gap in v1: 'dept:<id>' rooms were readable by the whole org, so
-- anyone in Sales could read and post in #Finance. A room named after a
-- department reads as private to that department; now it is. Same class of bug
-- as the team_calendar view — the policy and the expectation disagreed.
--
-- Room kinds after this file:
--   general        every active member of the org, always
--   dept:<id>      staff whose department is that department (+ system admins)
--   group:<uuid>   exactly the people an admin put in it
-- ============================================================================

create table if not exists public.chat_groups (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 60),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  archived    boolean not null default false
);
-- one "Lagos branch" per org, case-insensitively
create unique index if not exists chat_groups_org_name_idx
  on public.chat_groups (org_id, lower(trim(name))) where not archived;

create table if not exists public.chat_group_members (
  group_id  uuid not null references public.chat_groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  added_by  uuid references public.profiles(id) on delete set null,
  added_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists chat_group_members_user_idx on public.chat_group_members (user_id);

-- ---- helpers ---------------------------------------------------------------
-- SECURITY DEFINER: these are used inside the message policy, and a policy that
-- reads a table with its own RLS is how you get recursion (the outage from the
-- first RLS pass). Definer reads the membership directly, once.

-- Which org owns a group. Definer so it can be used inside the membership
-- policy without dragging chat_groups' own RLS (and its recursion risk) in.
create or replace function public.chat_group_org(p_group uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select g.org_id from public.chat_groups g where g.id = p_group;
$$;

create or replace function public.in_chat_group(p_group uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.chat_group_members m
    where m.group_id = p_group and m.user_id = auth.uid()
  );
$$;

-- Superseded by user_can_read_chat_room() below — dropped so a database that
-- ran an earlier revision of this file doesn't keep a second, diverging answer
-- to the same question lying around.
drop function if exists public.can_open_chat_group(uuid);
drop function if exists public.in_chat_department(int);

-- THE authority on room access, for ANY person — not just the caller.
--
-- It takes p_user rather than reading auth.uid() because the same question gets
-- asked about someone else: may this person be @mentioned in this room? The
-- first cut of this file answered that with a fourth hand-written copy of the
-- department rule, and when the rule changed the copy didn't — a mention could
-- then fire a notification, carrying a snippet of the message, to somebody who
-- couldn't open the room it came from. One function, no copies.
--
-- On departments: department_id is canonical and survives a rename; the name
-- match is only a fallback for rows that never got an id (bulk import writes
-- the free-text `department` and no id — see admin.js sanitizeBulk). Matching
-- on the TEXT alone meant renaming a department in Admin › Departments silently
-- threw that whole department out of its own room, history included, since
-- nothing rewrites profiles.department when departments.name changes.
--
-- System admins can open every room in their own org — that's how they manage
-- department rooms and the groups they create for other people.
create or replace function public.user_can_read_chat_room(p_user uuid, p_room text)
returns boolean language sql security definer stable set search_path = public as $$
  select case
    when p_user is null then false
    when p_room = 'general'
      then exists (select 1 from public.profiles p where p.id = p_user)
    -- d.active matters: GET /departments only returns active ones, so a
    -- deactivated department disappears from the sidebar. If its room stayed
    -- readable, chat_unread_counts would keep returning it and the topbar
    -- would carry a permanent badge for a room with no door to open.
    when p_room ~ '^dept:[0-9]+$' then exists (
      select 1
      from public.profiles p
      join public.departments d
        on d.id = substr(p_room, 6)::int and d.org_id = p.org_id and d.active
      where p.id = p_user
        and (
          -- an inner join on the caller's OWN active departments: that single
          -- join is what stops an admin's blanket access reaching another
          -- tenant's department id, and what closes a deactivated room for
          -- everyone including the people whose department_id still points at it
          p.role = 'super_admin'
          or p.department_id = d.id
          or (p.department_id is null
              and lower(trim(d.name)) = lower(trim(p.department)))
        )
    )
    when p_room ~ '^group:[0-9a-fA-F-]{36}$' then exists (
      select 1
      from public.chat_groups g
      join public.profiles p on p.id = p_user and p.org_id = g.org_id
      where g.id = substr(p_room, 7)::uuid
        and not g.archived
        and (
          p.role = 'super_admin'
          or exists (select 1 from public.chat_group_members m
                      where m.group_id = g.id and m.user_id = p_user)
        )
    )
    else false
  end;
$$;

-- The caller's own answer — everything else delegates here.
create or replace function public.can_read_chat_room(p_room text)
returns boolean language sql stable set search_path = public as $$
  select public.user_can_read_chat_room(auth.uid(), p_room);
$$;
grant execute on function public.can_read_chat_room(text) to authenticated;
grant execute on function public.user_can_read_chat_room(uuid, text) to authenticated;

-- ---- RLS -------------------------------------------------------------------
alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;

-- You see the groups you're in; a system admin sees all of them (they manage).
-- Archived groups are gone from everyone's list, admins included: a closed group
-- is closed. (The rows survive so the history isn't destroyed — reopening is a
-- one-line update if it's ever needed.)
drop policy if exists chat_groups_select on public.chat_groups;
create policy chat_groups_select on public.chat_groups for select
  using (
    public.same_org(org_id) and not archived
    and (public.is_super_admin() or public.in_chat_group(id))
  );

-- "See all in the group": members of a group can see its member list. Writes
-- go through the admin RPCs below, never straight from the client.
--
-- The org check is NOT optional here even though it looks redundant:
-- chat_group_members carries no org_id of its own, and is_super_admin() only
-- asks "is the caller an admin", never "an admin of WHICH org" — so without
-- resolving the group's org first, any tenant's admin could read any other
-- tenant's membership. Same shape as the decide_leave_request() bug.
drop policy if exists chat_group_members_select on public.chat_group_members;
create policy chat_group_members_select on public.chat_group_members for select
  using (
    public.same_org(public.chat_group_org(group_id))
    and (public.is_super_admin() or public.in_chat_group(group_id))
  );

-- Messages: same org AND allowed in that specific room. This replaces the v1
-- policy, which was org-wide for every room.
drop policy if exists org_chat_select on public.org_chat_messages;
create policy org_chat_select on public.org_chat_messages for select
  using (public.same_org(org_id) and public.can_read_chat_room(room));

-- ---- writes ----------------------------------------------------------------
-- Every one of these is SECURITY DEFINER and re-checks the caller: a definer
-- function bypasses RLS by design, so "the caller is a system admin somewhere"
-- is never enough — it must be an admin of THIS group's org.

create or replace function public.create_chat_group(p_name text, p_members uuid[] default '{}')
returns public.chat_groups
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org_id();
  v_me  uuid := auth.uid();
  row public.chat_groups;
begin
  if v_org is null or v_me is null then raise exception 'Not signed in'; end if;
  if not public.is_super_admin() then raise exception 'Only a System Admin can create a group'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 1 then raise exception 'Give the group a name'; end if;

  begin
    insert into public.chat_groups (org_id, name, created_by)
    values (v_org, trim(p_name), v_me)
    returning * into row;
  exception when unique_violation then
    -- the partial unique index, in words the admin can act on
    raise exception 'You already have a group called "%".', trim(p_name);
  end;

  -- the creator is always in it, plus anyone passed in who is really in the org
  insert into public.chat_group_members (group_id, user_id, added_by)
  select row.id, p.id, v_me
  from public.profiles p
  where p.org_id = v_org and p.status = 'active'
    and (p.id = v_me or p.id = any(coalesce(p_members, '{}')))
  on conflict do nothing;

  return row;
end;
$$;

create or replace function public.rename_chat_group(p_group uuid, p_name text)
returns public.chat_groups
language plpgsql security definer set search_path = public as $$
declare row public.chat_groups;
begin
  if not public.is_super_admin() then raise exception 'Only a System Admin can rename a group'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 1 then raise exception 'Give the group a name'; end if;
  begin
    update public.chat_groups set name = trim(p_name)
     where id = p_group and org_id = public.my_org_id()
    returning * into row;
  exception when unique_violation then
    -- rename hits the same partial unique index as create; say so the same way
    raise exception 'You already have a group called "%".', trim(p_name);
  end;
  if row.id is null then raise exception 'Group not found'; end if;
  return row;
end;
$$;

create or replace function public.add_chat_group_member(p_group uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.my_org_id();
begin
  if not public.is_super_admin() then raise exception 'Only a System Admin can change who is in a group'; end if;
  if not exists (select 1 from public.chat_groups g where g.id = p_group and g.org_id = v_org)
    then raise exception 'Group not found'; end if;
  -- the person must be a real, active member of this same org
  if not exists (select 1 from public.profiles p where p.id = p_user and p.org_id = v_org and p.status = 'active')
    then raise exception 'That person is not in your organisation'; end if;
  insert into public.chat_group_members (group_id, user_id, added_by)
  values (p_group, p_user, auth.uid()) on conflict do nothing;
end;
$$;

create or replace function public.remove_chat_group_member(p_group uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.my_org_id();
begin
  if not public.is_super_admin() then raise exception 'Only a System Admin can change who is in a group'; end if;
  if not exists (select 1 from public.chat_groups g where g.id = p_group and g.org_id = v_org)
    then raise exception 'Group not found'; end if;
  delete from public.chat_group_members where group_id = p_group and user_id = p_user;
end;
$$;

create or replace function public.archive_chat_group(p_group uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Only a System Admin can close a group'; end if;
  update public.chat_groups set archived = true
   where id = p_group and org_id = public.my_org_id();
end;
$$;

-- "See all in the group" — one answer for all three room kinds, so the member
-- list is never a different truth from the read policy.
create or replace function public.chat_room_members(p_room text)
returns table (id uuid, name text, department text, removable boolean)
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.my_org_id();
begin
  if v_org is null then raise exception 'Not signed in'; end if;
  if not public.can_read_chat_room(p_room) then raise exception 'You are not in that room'; end if;

  if p_room = 'general' then
    -- everyone in the tenant, by definition; nobody can be removed
    return query
      select p.id, p.name, p.department, false
      from public.profiles p
      where p.org_id = v_org and p.status = 'active'
      order by p.name;
  elsif p_room ~ '^dept:[0-9]+$' then
    -- same id-first, name-as-fallback rule as user_can_read_chat_room()
    return query
      select p.id, p.name, p.department, false
      from public.profiles p
      join public.departments d
        on d.id = substr(p_room, 6)::int and d.org_id = p.org_id and d.active
      where p.org_id = v_org and p.status = 'active'
        and (
          p.department_id = d.id
          or (p.department_id is null
              and lower(trim(d.name)) = lower(trim(p.department)))
        )
      order by p.name;
  elsif p_room ~ '^group:[0-9a-fA-F-]{36}$' then
    -- status='active' like the other two branches: a member who has left the
    -- company keeps their membership row, and without this they'd still be
    -- listed — and counted in "N people in this group" — long after being
    -- disabled, while General and their department room correctly drop them.
    return query
      select p.id, p.name, p.department, true
      from public.chat_group_members m
      join public.profiles p on p.id = m.user_id
      where m.group_id = substr(p_room, 7)::uuid and p.org_id = v_org
        and p.status = 'active'
      order by p.name;
  else
    raise exception 'Unknown room';
  end if;
end;
$$;

grant execute on function public.create_chat_group(text, uuid[]) to authenticated;
grant execute on function public.rename_chat_group(uuid, text) to authenticated;
grant execute on function public.add_chat_group_member(uuid, uuid) to authenticated;
grant execute on function public.remove_chat_group_member(uuid, uuid) to authenticated;
grant execute on function public.archive_chat_group(uuid) to authenticated;
grant execute on function public.chat_room_members(text) to authenticated;

-- ---- the write path knows about groups now ---------------------------------
-- Replaces the v1 body: the room whitelist gains 'group:<uuid>', and posting
-- into any room now requires being allowed to READ it — otherwise a removed
-- member could still write into the room they were taken out of.
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
  if p_room <> 'general' and p_room !~ '^dept:[0-9]+$' and p_room !~ '^group:[0-9a-fA-F-]{36}$'
    then raise exception 'Unknown room'; end if;
  if not public.can_read_chat_room(p_room) then raise exception 'You are not in that room'; end if;
  if char_length(trim(p_body)) < 1 then raise exception 'Empty message'; end if;

  -- mentions must be active members of the author's own org AND able to read
  -- this room — no pulling someone into a room they can't open, and no
  -- notification carrying a snippet out through the room's own boundary.
  -- Same function the read policy uses, asked about them instead of me.
  select coalesce(array_agg(p.id), '{}') into v_clean
  from public.profiles p
  where p.id = any(coalesce(p_mentions, '{}')) and p.org_id = v_org and p.status = 'active'
    and p.id <> v_author
    and public.user_can_read_chat_room(p.id, p_room);

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
