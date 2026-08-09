-- One person, one visitor record. And close the visits reception forgot.
--
-- 1. IDENTITY. public.visitors had no uniqueness on phone, so the same person
--    became a new record on every visit — three rows for one man, each with its
--    own history. That breaks the two things the module is for: "has this
--    person been here before?" and banning, since a ban attaches to one row and
--    the next visit creates another. Phone is the identity that actually gets
--    used in Nigeria; a name is not (two Chidi Okekes, one Chidi with a typo).
--
-- 2. AUTO-CHECKOUT. Visits sat 'checked_in' forever because nobody signs people
--    out at the end of the day. "Who is still in the building" then becomes a
--    list of everyone who ever visited, which is a fire-safety question before
--    it is an admin one. Closed after 12 hours and marked so, exactly like
--    attendance's forgotten clock-outs: flagged as auto-closed, never presented
--    as if reception had done it.

-- ---- dedupe existing rows before the constraint ----------------------------
-- Keep the oldest record for each (org, phone) and repoint every visit at it,
-- so the history merges rather than being lost.
do $$
declare r record;
begin
  for r in
    select org_id, phone, min(created_at) keep_from
      from public.visitors
     where coalesce(phone, '') <> ''
     group by org_id, phone having count(*) > 1
  loop
    with keeper as (
      select id from public.visitors
       where org_id = r.org_id and phone = r.phone
       order by created_at limit 1
    )
    update public.visits v set visitor_id = (select id from keeper)
     where v.visitor_id in (
       select id from public.visitors
        where org_id = r.org_id and phone = r.phone
          and id <> (select id from keeper)
     );
    delete from public.visitors
     where org_id = r.org_id and phone = r.phone
       and id <> (select id from public.visitors where org_id = r.org_id and phone = r.phone order by created_at limit 1);
  end loop;
end $$;

create unique index if not exists visitors_org_phone_uniq
  on public.visitors (org_id, phone)
  where coalesce(phone, '') <> '';

-- ---- auto-checkout, hung off the watchdog that already runs ----------------
create or replace function public.visitors_autoclose_all()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.visits
     set status = 'checked_out',
         checked_out_at = coalesce(checked_out_at, now()),
         auto_closed = true
   where status = 'checked_in'
     and checked_in_at < now() - interval '12 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

alter table public.visits add column if not exists auto_closed boolean not null default false;
comment on column public.visits.auto_closed is
  'Closed by the nightly sweep because nobody signed them out. Shown as such — never presented as a real check-out.';

-- Service role only: this is a cron job, not a user action.
revoke execute on function public.visitors_autoclose_all() from public, anon, authenticated;
grant execute on function public.visitors_autoclose_all() to service_role;
