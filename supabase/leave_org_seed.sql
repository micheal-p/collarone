-- Leave: give every organisation its own types and its own holidays.
--
-- Two faults, both confirmed against the live database before writing this.
--
-- 1. LEAVE IS BLANK FOR NEW CUSTOMERS. Payroll gets a seeding trigger on
--    organisation creation (payroll_tax_act_2026.sql:63) and leave never did —
--    the types were inserted once by a migration and never again. Live count
--    today: 4 organisations, 7 leave_types rows, all belonging to one of them.
--    So three of your four customers open the Leave suite to an empty screen
--    and cannot request a single day off. It is the worst kind of bug: the
--    module is finished, and it looks broken on first contact.
--
-- 2. HOLIDAYS ARE SHARED BETWEEN COMPANIES. public.holidays has `day` as a
--    GLOBAL unique key and no organisation on any row (8 rows, 0 scoped).
--    Holidays drive the working-day calculation, so one tenant adding their
--    own company holiday silently changes how many days of leave every other
--    tenant is charged. Nigerian public holidays are shared, but a company
--    shutdown day is not, and the table cannot currently tell them apart.
--
-- Each org gets its own copy of the existing holidays rather than a shared
-- table with an "is public holiday" flag: a copy they can edit is more useful
-- than a shared row they must not touch, and it removes the cross-tenant write
-- entirely instead of guarding it.

-- ---- holidays: per organisation --------------------------------------------
alter table public.holidays add column if not exists org_id uuid references public.organizations(id) on delete cascade;

-- ORDER MATTERS HERE, and I got it wrong the first time: the global
-- `holidays_day_key` unique index must be dropped BEFORE copying, or every
-- per-org copy after the first collides on `day`, silently does nothing under
-- `on conflict do nothing`, and the subsequent delete of the originals wipes
-- the table. That is exactly what happened on the first run of this migration.
alter table public.holidays drop constraint if exists holidays_day_key;

-- Give every org a copy of every currently-global holiday.
insert into public.holidays (day, name, org_id)
select h.day, h.name, o.id
from public.holidays h
cross join public.organizations o
where h.org_id is null
on conflict do nothing;

-- Retire the originals now that each org owns a copy.
delete from public.holidays where org_id is null;

-- Restore the standard Nigerian public holidays for any org that has none.
-- Idempotent, and it is also the recovery path for the botched first run.
insert into public.holidays (day, name, org_id)
select d.day, d.name, o.id
from public.organizations o
cross join (values
  ('2026-01-01'::date, 'New Year''s Day'),
  ('2026-04-03', 'Good Friday'),
  ('2026-04-06', 'Easter Monday'),
  ('2026-05-01', 'Workers'' Day'),
  ('2026-06-12', 'Democracy Day'),
  ('2026-10-01', 'Independence Day'),
  ('2026-12-25', 'Christmas Day'),
  ('2026-12-26', 'Boxing Day')
) as d(day, name)
where not exists (select 1 from public.holidays h where h.org_id = o.id and h.day = d.day);

alter table public.holidays alter column org_id set not null;
create unique index if not exists holidays_org_day_uniq on public.holidays (org_id, day);

alter table public.holidays enable row level security;
drop policy if exists holidays_select on public.holidays;
create policy holidays_select on public.holidays for select
  using (public.same_org(org_id));
drop policy if exists holidays_write on public.holidays;
create policy holidays_write on public.holidays for all
  using (public.same_org(org_id) and (public.is_super_admin() or public.is_leave_approver()) and not public.is_support_session())
  with check (public.same_org(org_id) and (public.is_super_admin() or public.is_leave_approver()) and not public.is_support_session());

-- ---- leave types: seeded per organisation -----------------------------------
-- `key` was globally unique, which cannot work once every org has its own set.
alter table public.leave_types drop constraint if exists leave_types_key_key;
create unique index if not exists leave_types_org_key_uniq on public.leave_types (org_id, key);

create or replace function public.seed_org_leave_defaults(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- A starting set a Nigerian SME will recognise. Entitlements are editable;
  -- the point is that the suite works on day one rather than demanding setup
  -- before it will do anything at all.
  insert into public.leave_types (org_id, key, name, color, paid, tracked, default_days, accrual, gender, requires_doc_after)
  values
    (p_org, 'annual',       'Annual leave',       '#0b6b3a', true,  true,  20, 'upfront', null,     null),
    (p_org, 'sick',         'Sick leave',         '#b42318', true,  true,  10, 'upfront', null,     2),
    (p_org, 'maternity',    'Maternity leave',    '#7c3aed', true,  true,  84, 'upfront', 'female', null),
    (p_org, 'paternity',    'Paternity leave',    '#1d4ed8', true,  true,  10, 'upfront', 'male',   null),
    (p_org, 'compassionate','Compassionate leave','#8a6d3b', true,  true,   5, 'upfront', null,     null),
    (p_org, 'unpaid',       'Unpaid leave',       '#6b7280', false, false,  0, 'upfront', null,     null)
  on conflict (org_id, key) do nothing;
end;
$$;
grant execute on function public.seed_org_leave_defaults(uuid) to service_role;

create or replace function public.trg_seed_org_leave_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_org_leave_defaults(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_org_leave on public.organizations;
create trigger trg_seed_org_leave
  after insert on public.organizations
  for each row execute function public.trg_seed_org_leave_defaults();

-- Backfill every organisation that has none today.
do $$
declare o record;
begin
  for o in select id from public.organizations loop
    if not exists (select 1 from public.leave_types where org_id = o.id) then
      perform public.seed_org_leave_defaults(o.id);
    end if;
  end loop;
end $$;
