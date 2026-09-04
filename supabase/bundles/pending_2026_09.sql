-- regenerated 2026-09-04T10:26Z
-- ============================================================================
-- Collarone — pending migrations, September 2026
-- Paste into the Supabase SQL editor and run once. Idempotent, order matters.
-- ============================================================================

-- ## platform_contact.sql

-- ============================================================================
-- Collarone — platform-level contact inbox. Run after organizations.sql
-- (needs is_platform_admin()). Idempotent.
--
-- Distinct from the per-tenant CRM "Messages" tab (crm_activities /
-- website contact forms, which belong to one org) — this is messages sent
-- to Collarone itself via the public /contact page. Same reply pattern as
-- the tenant inbox: WhatsApp/email/call quick-actions, mark-as-replied —
-- no automated sending exists anywhere in this codebase, so this doesn't
-- fake it either.
-- ============================================================================

create table if not exists public.platform_contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null default '',
  phone      text not null default '',
  company    text not null default '',
  message    text not null,
  status     text not null default 'new' check (status in ('new','replied')),
  created_at timestamptz not null default now(),
  replied_at timestamptz
);

create index if not exists platform_contact_messages_status_idx on public.platform_contact_messages (status, created_at desc);

alter table public.platform_contact_messages enable row level security;

drop policy if exists "platform_contact_messages_admin" on public.platform_contact_messages;
create policy "platform_contact_messages_admin" on public.platform_contact_messages for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());
-- inserts come only from public_submit_contact_message() below (anon, no direct table access)

create or replace function public.public_submit_contact_message(
  p_name text, p_email text, p_phone text default '', p_company text default '', p_message text default ''
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Your name is required'; end if;
  if coalesce(trim(p_email), '') = '' and coalesce(trim(p_phone), '') = '' then
    raise exception 'An email or phone number is required so we can reply';
  end if;
  if coalesce(trim(p_message), '') = '' then raise exception 'Message cannot be empty'; end if;
  if length(p_message) > 4000 then raise exception 'Message is too long'; end if;

  insert into public.platform_contact_messages (name, email, phone, company, message)
  values (trim(p_name), coalesce(trim(p_email), ''), coalesce(trim(p_phone), ''), coalesce(trim(p_company), ''), trim(p_message));

  return true;
end;
$$;
grant execute on function public.public_submit_contact_message(text, text, text, text, text) to anon, authenticated;


-- ## hr_letter_references.sql

-- ============================================================================
-- HR letter reference numbers — issued by the database, unique per org
-- Run AFTER hr_letters.sql (depends on hr_letters, is_hr_manager(), my_org_id()).
-- ============================================================================
--
-- THE BUG THIS FIXES
--
-- suggestReference() in client/src/suites/hr/letterheadTemplates.js built the
-- reference in the browser: count the letters this tab has loaded for the
-- current year, add one, format as HR/<TYPE>/<YEAR>/<NNN>. Two consequences,
-- both of which reach a customer's bank:
--
--   1. Two HR users composing at the same time both see the same count and
--      both issue HR/CONF/2026/007. Nothing anywhere rejected the duplicate.
--   2. The number was never stored. hr_letters had no reference column at all,
--      so it lived only in the rendered HTML. Reprinting a letter from the
--      register passed reference: '' and produced a letter with no reference
--      on it, and the register could not answer "what number did we issue?".
--
-- The fix mirrors the pattern trade_documents.sql already uses for invoice
-- numbers: a per-org counter row incremented inside one atomic statement, plus
-- a unique index so even a hand-typed reference cannot collide.
--
-- Numbering is per organisation per year and SHARED ACROSS TYPES, which is what
-- the browser version did: HR/CONF/2026/007 is the seventh letter of 2026, not
-- the seventh confirmation letter. Keeping that means references already
-- printed on paper stay consistent with the ones issued from now on.

-- ---- The column ------------------------------------------------------------
-- Nullable on purpose: letters issued before this migration genuinely have no
-- reference, and inventing one now would put a number on a document that was
-- filed without it.
alter table public.hr_letters add column if not exists reference text;

-- ---- The counter -----------------------------------------------------------
create table if not exists public.hr_letter_counters (
  org_id  uuid not null references public.organizations(id) on delete cascade,
  year    int  not null,
  next_no int  not null default 1,
  primary key (org_id, year)
);

alter table public.hr_letter_counters enable row level security;

-- Readable so HR can see where the sequence has got to; never written directly
-- from the client, only by the definer function below.
drop policy if exists "hr_letter_counters_select" on public.hr_letter_counters;
create policy "hr_letter_counters_select" on public.hr_letter_counters for select using (
  (public.is_super_admin() or public.is_hr_manager()) and public.same_org(org_id)
);

-- ---- The backstop ----------------------------------------------------------
-- Partial: pre-migration letters are null and must not collide with each other.
-- This is what makes the duplicate impossible rather than merely unlikely — the
-- function below can be bypassed by typing a reference by hand, the index
-- cannot.
create unique index if not exists hr_letters_reference_uniq
  on public.hr_letters (org_id, reference)
  where reference is not null and reference <> '';

-- ---- Allocating the next one ----------------------------------------------
-- SECURITY DEFINER because the counter table has no write policy by design.
-- Scoped on my_org_id() (never on an argument) and gated to the same roles that
-- may write hr_letters, so it matches the table's own permissions.
create or replace function public.hr_next_letter_reference(p_letter_type text)
returns text language plpgsql security definer set search_path = public as $$
declare
  caller_org uuid;
  v_year     int := extract(year from (now() at time zone 'Africa/Lagos'))::int;
  v_seq      int;
  v_abbrev   text;
begin
  if not (public.is_super_admin() or public.is_hr_manager()) then
    raise exception 'Not authorised to issue letters';
  end if;
  caller_org := public.my_org_id();
  if caller_org is null then raise exception 'Not authorised to issue letters'; end if;

  -- Must stay in step with LETTER_TYPE_ABBREV in letterheadTemplates.js.
  v_abbrev := case p_letter_type
    when 'confirmation' then 'CONF'
    when 'promotion' then 'PROM'
    when 'introduction' then 'INTR'
    when 'employment_verification' then 'VERF'
    when 'query' then 'QRY'
    when 'warning' then 'WARN'
    else 'LTR' end;

  -- One statement, so two HR users issuing at the same instant queue on the row
  -- lock and get different numbers. This is the whole point of the migration.
  insert into public.hr_letter_counters (org_id, year, next_no) values (caller_org, v_year, 2)
  on conflict (org_id, year) do update set next_no = public.hr_letter_counters.next_no + 1
  returning next_no - 1 into v_seq;

  return 'HR/' || v_abbrev || '/' || v_year::text || '/' || lpad(v_seq::text, 3, '0');
end;
$$;

revoke execute on function public.hr_next_letter_reference(text) from anon, public;
grant execute on function public.hr_next_letter_reference(text) to authenticated;

-- ---- Support write block ---------------------------------------------------
-- Every tenant table carries the trigger that refuses writes from a Collarone
-- support session (supabase/support_readonly_enforcement.sql attaches it by
-- looping over public tables). A table created by a LATER migration than that
-- one is born without it, which is exactly what happened here: applying this
-- file left hr_letter_counters writable by support, and test/support_write_denial.mjs
-- caught it against production.
--
-- Attaching it here as well means this migration is self-contained: a fresh
-- environment that applies it does not depend on someone remembering to re-run
-- the enrolment sweep afterwards. Idempotent, same shape as the sweep itself.
drop trigger if exists a_block_support_writes on public.hr_letter_counters;
create trigger a_block_support_writes
  before insert or update or delete on public.hr_letter_counters
  for each row execute function public.block_support_writes();


-- ## demo_requests.sql

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

