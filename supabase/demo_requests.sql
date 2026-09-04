-- ============================================================================
-- Collarone — "Book a demo" requests
-- Run AFTER platform_contact.sql (extends platform_contact_messages).
-- Idempotent.
-- ============================================================================
--
-- WHY THIS IS NOT A NEW TABLE
--
-- A demo request is a message to Collarone from someone who is not a customer
-- yet, which is exactly what platform_contact_messages already holds, and
-- PlatformAdmin.jsx already reads and lets you mark replied. A separate table
-- would mean a second inbox to remember to open, and the one that gets checked
-- less is the one where a prospect goes cold. So this widens the existing row
-- rather than starting a parallel one.
--
-- The extra columns are the things you actually need before ringing someone
-- back: how big are they, what hurts, and when do they want the call.

alter table public.platform_contact_messages
  add column if not exists kind         text not null default 'message',
  add column if not exists staff_count  text not null default '',
  add column if not exists interest     text not null default '',
  add column if not exists preferred_at timestamptz;

-- Added separately and idempotently: a bare `add column ... check (...)` is not
-- re-runnable, and this file has to be safe to apply twice.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'platform_contact_messages_kind_check'
      and conrelid = 'public.platform_contact_messages'::regclass
  ) then
    alter table public.platform_contact_messages
      add constraint platform_contact_messages_kind_check check (kind in ('message', 'demo'));
  end if;
end $$;

-- Newest unanswered demo requests first — the query the inbox actually runs.
create index if not exists platform_contact_messages_kind_idx
  on public.platform_contact_messages (kind, status, created_at desc);

-- ---- The public entry point -------------------------------------------------
-- Separate from public_submit_contact_message() rather than adding parameters
-- to it: that function is granted to anon, and changing a signature anon holds
-- EXECUTE on means dropping and re-granting, which is how a function ends up
-- accidentally open (see revoke_anon_execute.sql for what that cost last time).
-- A new function is the boring, safe shape.
--
-- Deliberately callable by anon: a prospect booking a demo has no account, and
-- that is the entire point of the page. It takes no organisation id and touches
-- no tenant data, so there is nothing for a caller to aim it at.
create or replace function public.public_request_demo(
  p_name text,
  p_email text,
  p_phone text default '',
  p_company text default '',
  p_staff_count text default '',
  p_interest text default '',
  p_preferred_at timestamptz default null,
  p_message text default ''
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Your name is required'; end if;
  if coalesce(trim(p_company), '') = '' then raise exception 'Your company name is required'; end if;
  if coalesce(trim(p_email), '') = '' and coalesce(trim(p_phone), '') = '' then
    raise exception 'An email or phone number is required so we can confirm the demo';
  end if;
  if length(coalesce(p_message, '')) > 4000 then raise exception 'Message is too long'; end if;
  -- A demo cannot be booked in the past, and a year out is a typo, not a plan.
  if p_preferred_at is not null and p_preferred_at < now() - interval '1 day' then
    raise exception 'Pick a time in the future';
  end if;
  if p_preferred_at is not null and p_preferred_at > now() + interval '365 days' then
    raise exception 'Pick a time within the next year';
  end if;

  insert into public.platform_contact_messages
    (kind, name, email, phone, company, staff_count, interest, preferred_at, message)
  values (
    'demo',
    trim(p_name),
    coalesce(trim(p_email), ''),
    coalesce(trim(p_phone), ''),
    trim(p_company),
    coalesce(trim(p_staff_count), ''),
    coalesce(trim(p_interest), ''),
    p_preferred_at,
    -- The inbox renders `message`, so a request with no note still reads as
    -- something rather than an empty row.
    coalesce(nullif(trim(p_message), ''), 'Requested a demo.')
  );

  return true;
end;
$$;

revoke execute on function public.public_request_demo(text, text, text, text, text, text, timestamptz, text) from public;
grant execute on function public.public_request_demo(text, text, text, text, text, text, timestamptz, text) to anon, authenticated;
