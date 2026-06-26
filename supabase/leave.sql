-- ============================================================================
-- Org-Ops ERP — Leave Management
-- Model: central HR/approver pool (leave suite role = 'manager'), single-step
-- approval, statutory-floor entitlements (HR-configurable). Run in SQL Editor.
-- Idempotent-ish (drops/recreates policies, functions, seeds with on conflict).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---- Tables ---------------------------------------------------------------
create table if not exists public.leave_types (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  color text not null default '#0b6b3a',
  paid boolean not null default true,
  tracked boolean not null default true,          -- false = no balance limit (e.g. unpaid)
  default_days numeric not null default 0,        -- annual entitlement, in working days
  accrual text not null default 'upfront',        -- 'upfront' | 'monthly'
  gender text,                                    -- null=any | 'female' | 'male'
  requires_doc_after numeric,                     -- e.g. sick leave > 2 days needs a note
  carryover_cap numeric not null default 0,
  active boolean not null default true,
  sort int not null default 0
);

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  name text not null,
  year int generated always as (extract(year from day)::int) stored
);

create table if not exists public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  year int not null,
  entitled numeric,                               -- null = use leave_types.default_days
  carried_over numeric not null default 0,
  adjustment numeric not null default 0,          -- HR manual +/-
  unique (user_id, leave_type_id, year)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id),
  start_date date not null,
  end_date date not null,
  half_day boolean not null default false,        -- only when start_date = end_date
  working_days numeric not null,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_comment text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists leave_requests_user_idx on public.leave_requests(user_id);
create index if not exists leave_requests_status_idx on public.leave_requests(status);

alter table public.leave_types    enable row level security;
alter table public.holidays       enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;

-- ---- Helper: is the caller an HR / leave approver? ------------------------
create or replace function public.is_leave_approver()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and ( p.role = 'super_admin'
         or exists (select 1 from jsonb_array_elements(p.suites) s
                    where s->>'key' = 'leave' and s->>'role' = 'manager') )
  );
$$;
grant execute on function public.is_leave_approver() to authenticated;

-- ---- RLS ------------------------------------------------------------------
drop policy if exists lt_read on public.leave_types;
create policy lt_read on public.leave_types for select to authenticated using (true);
drop policy if exists lt_write on public.leave_types;
create policy lt_write on public.leave_types for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists hol_read on public.holidays;
create policy hol_read on public.holidays for select to authenticated using (true);
drop policy if exists hol_write on public.holidays;
create policy hol_write on public.holidays for all using (public.is_leave_approver()) with check (public.is_leave_approver());

drop policy if exists bal_read on public.leave_balances;
create policy bal_read on public.leave_balances for select using (user_id = auth.uid() or public.is_leave_approver());
drop policy if exists bal_write on public.leave_balances;
create policy bal_write on public.leave_balances for all using (public.is_leave_approver()) with check (public.is_leave_approver());

-- Requests: read own or (approver reads all). All writes go through RPCs below.
drop policy if exists req_read on public.leave_requests;
create policy req_read on public.leave_requests for select using (user_id = auth.uid() or public.is_leave_approver());

-- ---- Working-days calculator (excludes weekends + holidays) ---------------
create or replace function public.leave_working_days(_start date, _end date, _half boolean)
returns numeric language plpgsql stable set search_path = public as $$
declare d date := _start; cnt numeric := 0;
begin
  if _end < _start then return 0; end if;
  while d <= _end loop
    if extract(isodow from d) < 6 and not exists (select 1 from public.holidays h where h.day = d) then
      cnt := cnt + 1;
    end if;
    d := d + 1;
  end loop;
  if _half and _start = _end and cnt = 1 then cnt := 0.5; end if;
  return cnt;
end;
$$;
grant execute on function public.leave_working_days(date, date, boolean) to authenticated;

-- ---- Available balance for a user/type/year -------------------------------
create or replace function public.leave_available(_user uuid, _type uuid, _year int)
returns numeric language sql stable security definer set search_path = public as $$
  select
    coalesce((select b.entitled from public.leave_balances b where b.user_id=_user and b.leave_type_id=_type and b.year=_year),
             (select t.default_days from public.leave_types t where t.id=_type))
    + coalesce((select b.carried_over + b.adjustment from public.leave_balances b where b.user_id=_user and b.leave_type_id=_type and b.year=_year), 0)
    - coalesce((select sum(r.working_days) from public.leave_requests r
                where r.user_id=_user and r.leave_type_id=_type and r.status in ('pending','approved')
                  and extract(year from r.start_date)=_year), 0);
$$;
grant execute on function public.leave_available(uuid, uuid, int) to authenticated;

-- ---- Submit a request (validates balance, holds the days) -----------------
create or replace function public.submit_leave_request(_type uuid, _start date, _end date, _half boolean, _reason text)
returns public.leave_requests language plpgsql security definer set search_path = public as $$
declare wd numeric; t public.leave_types; avail numeric; row public.leave_requests;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into t from public.leave_types where id = _type and active;
  if not found then raise exception 'Unknown leave type'; end if;
  if _half and _start <> _end then raise exception 'Half-day applies to a single day only'; end if;

  wd := public.leave_working_days(_start, _end, _half);
  if wd <= 0 then raise exception 'Selected dates contain no working days'; end if;

  if t.tracked then
    avail := public.leave_available(auth.uid(), _type, extract(year from _start)::int);
    if wd > avail then raise exception 'Insufficient balance: % day(s) requested, % available', wd, avail; end if;
  end if;

  insert into public.leave_requests (user_id, leave_type_id, start_date, end_date, half_day, working_days, reason)
  values (auth.uid(), _type, _start, _end, _half, wd, coalesce(_reason,''))
  returning * into row;
  return row;
end;
$$;
grant execute on function public.submit_leave_request(uuid, date, date, boolean, text) to authenticated;

-- ---- Approve / reject (HR / approver only) --------------------------------
create or replace function public.decide_leave_request(_id uuid, _decision text, _comment text)
returns public.leave_requests language plpgsql security definer set search_path = public as $$
declare row public.leave_requests;
begin
  if not public.is_leave_approver() then raise exception 'Not authorised to approve leave'; end if;
  if _decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  update public.leave_requests
     set status=_decision, decided_by=auth.uid(), decided_at=now(), decision_comment=coalesce(_comment,'')
   where id=_id and status='pending'
   returning * into row;
  if not found then raise exception 'Request not found or already decided'; end if;
  return row;
end;
$$;
grant execute on function public.decide_leave_request(uuid, text, text) to authenticated;

-- ---- Cancel own request ---------------------------------------------------
create or replace function public.cancel_leave_request(_id uuid)
returns public.leave_requests language plpgsql security definer set search_path = public as $$
declare row public.leave_requests;
begin
  update public.leave_requests set status='cancelled'
   where id=_id and user_id=auth.uid() and status in ('pending','approved') and start_date > current_date
   returning * into row;
  if not found then raise exception 'Only your own upcoming requests can be cancelled'; end if;
  return row;
end;
$$;
grant execute on function public.cancel_leave_request(uuid) to authenticated;

-- ---- Team calendar (names + dates only; protects leave reasons/types) ------
drop view if exists public.team_calendar;
create view public.team_calendar as
  select r.id, p.name as person, r.start_date, r.end_date
  from public.leave_requests r join public.profiles p on p.id = r.user_id
  where r.status = 'approved';
grant select on public.team_calendar to authenticated;

-- ---- Seed leave types (statutory floor — HR can edit) ---------------------
insert into public.leave_types (key,name,color,paid,tracked,default_days,gender,requires_doc_after,sort) values
  ('annual',       'Annual Leave',        '#0b6b3a', true,  true,  6,  null,    null, 1),
  ('sick',         'Sick Leave',          '#2b6cb0', true,  true,  12, null,    2,    2),
  ('casual',       'Casual Leave',        '#b7791f', true,  true,  5,  null,    null, 3),
  ('maternity',    'Maternity Leave',     '#8a5cf6', true,  true,  60, 'female',null, 4),
  ('paternity',    'Paternity Leave',     '#0e7490', true,  true,  10, 'male',  null, 5),
  ('compassionate','Compassionate Leave', '#9b2c2c', true,  true,  5,  null,    null, 6),
  ('unpaid',       'Unpaid Leave',        '#605e5c', false, false, 0,  null,    null, 7)
on conflict (key) do nothing;

-- ---- Seed Nigerian public holidays 2026 (fixed + Christian; HR adds Islamic) --
insert into public.holidays (day, name) values
  ('2026-01-01','New Year''s Day'),
  ('2026-04-03','Good Friday'),
  ('2026-04-06','Easter Monday'),
  ('2026-05-01','Workers'' Day'),
  ('2026-06-12','Democracy Day'),
  ('2026-10-01','Independence Day'),
  ('2026-12-25','Christmas Day'),
  ('2026-12-26','Boxing Day')
on conflict (day) do nothing;
