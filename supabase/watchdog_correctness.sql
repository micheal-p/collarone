-- ============================================================================
-- Collarone — watchdog checks for CORRECTNESS, not availability
-- Run AFTER watchdog.sql. Idempotent.
-- ============================================================================
--
-- WHY THIS EXISTS
--
-- On 2026-09-04 the status page reported 100% availability since 5 August, and
-- it was telling the truth: 1,871 scheduled checks, zero failures, ever. On the
-- same day we found that the Nigeria-only payroll gate had been doing nothing
-- for months, HR letter reference numbers were never being stored, a login link
-- could send a user to an attacker's site, and every analytics row was filed
-- under an unknown country.
--
-- None of those touched availability. The API answered, the database answered,
-- nothing threw. They were software working perfectly while doing the wrong
-- thing, and monitoring that asks "is it up" is structurally blind to all of
-- them.
--
-- So these ask a different question: are the things that should ALWAYS be true
-- still true? Each one below is derived from a real defect, not an imagined
-- one. A check nobody has ever needed is a check that will one day cry wolf and
-- get ignored.
--
-- Service-role only, like every other watchdog function.

-- ---- 1. The edge stopped telling us the country ----------------------------
-- This is the exact shape of the payroll bug. admin.js gates payroll on the
-- caller's country, written `if (country && country !== 'NG')`, so an empty
-- country SKIPS the check. When Collarone moved off Vercel the header stopped
-- arriving, every request read as unknown, and the gate silently did nothing
-- for months while still telling the UI it had withheld payroll.
--
-- The tell is visible in the data: if traffic is arriving and NOT ONE request
-- carries a real country, the edge is no longer providing it and every
-- geo-dependent rule is inert.
--
-- Returns 0 when there is no traffic to judge by — silence is not evidence.
create or replace function public.watchdog_geo_signal_lost()
returns int language sql security definer set search_path = public stable as $$
  select case
    when count(*) = 0 then 0                              -- no traffic, no signal, no alarm
    when count(*) filter (where country <> 'XX') > 0 then 0 -- the edge is talking
    else count(*)::int                                     -- traffic, and every one unknown
  end
  from public.page_views
  where created_at > now() - interval '24 hours';
$$;
revoke execute on function public.watchdog_geo_signal_lost() from authenticated, anon, public;
grant execute on function public.watchdog_geo_signal_lost() to service_role;

-- ---- 2. Issued letters that carry no reference, or a duplicate one ----------
-- HR letters go to banks and embassies. The number was computed in the browser
-- and never stored, so reprints came out blank and two officers issuing on the
-- same day could produce the same reference. Both are invisible until someone
-- outside the company rejects the document.
--
-- Only letters issued AFTER the reference column existed are judged; older ones
-- genuinely have none and inventing an alert for them is noise forever.
create or replace function public.watchdog_letters_without_reference()
returns int language sql security definer set search_path = public stable as $$
  select (
    (select count(*) from public.hr_letters
      where issued_at > timestamptz '2026-09-04'
        and coalesce(nullif(trim(reference), ''), null) is null)
    +
    (select coalesce(sum(dupes), 0) from (
       select count(*) - 1 as dupes
       from public.hr_letters
       where coalesce(nullif(trim(reference), ''), null) is not null
       group by org_id, reference
       having count(*) > 1
     ) d)
  )::int;
$$;
revoke execute on function public.watchdog_letters_without_reference() from authenticated, anon, public;
grant execute on function public.watchdog_letters_without_reference() to service_role;

-- ---- 3. Tenant tables a support session could write to ---------------------
-- support_readonly_enforcement.sql attaches the write-block by looping over
-- public tables. A table created by a LATER migration is born without it, and
-- nothing says so. That happened on 2026-09-04: hr_letter_counters shipped
-- unguarded and was only caught because a test was run by hand.
--
-- The two platform tables are excluded here for the same reason the sweep
-- excludes them: service-role writes to them must always work.
create or replace function public.watchdog_unguarded_tables()
returns int language sql security definer set search_path = public stable as $$
  select count(*)::int
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not in ('platform_admin_audit_log', 'platform_admins', 'schema_migrations')
    and not exists (
      select 1 from pg_trigger g
      where g.tgrelid = c.oid
        and g.tgname = 'a_block_support_writes'
        and not g.tgisinternal
    );
$$;
revoke execute on function public.watchdog_unguarded_tables() from authenticated, anon, public;
grant execute on function public.watchdog_unguarded_tables() to service_role;
