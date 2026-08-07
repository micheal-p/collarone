-- ============================================================================
-- Support tickets: tenant → Collarone escalation, in-product. Idempotent.
--
-- WhatsApp works at this scale, but a ticket is a RECORD: numbered, threaded,
-- statused, attached to the org it came from — evidence when a dispute or an
-- SLA question arrives, and the answer to a prospect's "where do we raise
-- issues?". Deliberately small: no priorities, no assignees, no SLA timers
-- until real volume asks for them.
--
-- Visibility: the person who raised it + their org's super_admin. Platform
-- admins (Collarone staff) see and answer everything. Statuses: open (needs
-- Collarone), pending (waiting on the customer), resolved.
-- ============================================================================

create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  subject     text not null,
  category    text not null default 'other'
                check (category in ('bug','billing','how_to','feature','other')),
  status      text not null default 'open'
                check (status in ('open','pending','resolved')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists support_tickets_org_idx on public.support_tickets (org_id, updated_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, updated_at desc);

create table if not exists public.support_ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  is_platform boolean not null default false,   -- true = a Collarone reply
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists support_msgs_ticket_idx on public.support_ticket_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

-- Who inside the tenant may see a ticket: its creator, or the org's admin.
create or replace function public.can_see_ticket(t public.support_tickets)
returns boolean language sql stable security definer set search_path = public as $$
  select t.created_by = auth.uid()
      or exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.org_id = t.org_id and p.role = 'super_admin')
      or public.is_platform_admin();
$$;

drop policy if exists "support_tickets_select" on public.support_tickets;
create policy "support_tickets_select" on public.support_tickets
  for select using (public.can_see_ticket(support_tickets));

drop policy if exists "support_tickets_insert" on public.support_tickets;
create policy "support_tickets_insert" on public.support_tickets
  for insert with check (org_id = public.my_org_id() and created_by = auth.uid());

-- Status changes: the platform side, or the tenant closing their own ticket.
drop policy if exists "support_tickets_update" on public.support_tickets;
create policy "support_tickets_update" on public.support_tickets
  for update using (public.is_platform_admin() or public.can_see_ticket(support_tickets))
  with check (public.is_platform_admin() or (status = 'resolved' and org_id = public.my_org_id()));

-- WITH CHECK can't see the OLD row, so on its own a tenant "closing" a ticket
-- could simultaneously rewrite its subject or org. Non-platform updates get
-- every column except status pinned to what it was.
create or replace function public.guard_ticket_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    new.org_id     := old.org_id;
    new.created_by := old.created_by;
    new.subject    := old.subject;
    new.category   := old.category;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists trg_guard_ticket_update on public.support_tickets;
create trigger trg_guard_ticket_update
  before update on public.support_tickets
  for each row execute function public.guard_ticket_update();

drop policy if exists "support_msgs_select" on public.support_ticket_messages;
create policy "support_msgs_select" on public.support_ticket_messages
  for select using (exists (
    select 1 from public.support_tickets t
    where t.id = ticket_id and public.can_see_ticket(t)));

drop policy if exists "support_msgs_insert" on public.support_ticket_messages;
create policy "support_msgs_insert" on public.support_ticket_messages
  for insert with check (
    author_id = auth.uid()
    and is_platform = public.is_platform_admin()
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and public.can_see_ticket(t)));

-- A reply reopens the conversation's clock and flips who the ball is with:
-- customer replies → open (needs Collarone), Collarone replies → pending
-- (waiting on the customer). Resolved stays resolved until someone reopens
-- deliberately via a new message.
create or replace function public.touch_ticket_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.support_tickets
    set updated_at = now(),
        status = case when new.is_platform then 'pending' else 'open' end
    where id = new.ticket_id;
  return new;
end; $$;
drop trigger if exists trg_touch_ticket on public.support_ticket_messages;
create trigger trg_touch_ticket
  after insert on public.support_ticket_messages
  for each row execute function public.touch_ticket_on_message();
