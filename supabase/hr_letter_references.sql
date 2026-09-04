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
