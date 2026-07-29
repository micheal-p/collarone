-- ============================================================================
-- Attendance — shift rosters. Run after attendance_payroll.sql. Idempotent.
--
-- Until now lateness was judged against ONE org-wide work_start — wrong for
-- any business with a morning crew and a night gate team. Shifts fix it:
-- managers define shifts ("Morning 7–3", "Gate night 8pm–4am"), assign staff,
-- and clock-in judges each person against THEIR shift (org default remains
-- the fallback for unassigned staff). Lateness stamped here flows into
-- payroll deductions exactly as before — roster → clock-in → payroll,
-- untouched by hand.
-- ============================================================================
create table if not exists public.attendance_shifts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  start_time  time not null,
  end_time    time not null,
  days        int[] not null default '{1,2,3,4,5}',   -- 0=Sun … 6=Sat
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists attendance_shifts_org_idx on public.attendance_shifts (org_id);

create table if not exists public.attendance_shift_assignments (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  shift_id   uuid not null references public.attendance_shifts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  primary key (org_id, user_id)                        -- one shift per person (v1)
);

alter table public.attendance_shifts enable row level security;
drop policy if exists att_shifts_select on public.attendance_shifts;
create policy att_shifts_select on public.attendance_shifts
  for select using (public.same_org(org_id) and public.has_attendance_suite());
drop policy if exists att_shifts_write on public.attendance_shifts;
create policy att_shifts_write on public.attendance_shifts
  for all using (public.same_org(org_id) and public.is_attendance_manager())
  with check (public.same_org(org_id) and public.is_attendance_manager());

alter table public.attendance_shift_assignments enable row level security;
drop policy if exists att_assign_select on public.attendance_shift_assignments;
create policy att_assign_select on public.attendance_shift_assignments
  for select using (public.same_org(org_id) and public.has_attendance_suite());
drop policy if exists att_assign_write on public.attendance_shift_assignments;
create policy att_assign_write on public.attendance_shift_assignments
  for all using (public.same_org(org_id) and public.is_attendance_manager())
  with check (public.same_org(org_id) and public.is_attendance_manager());

-- Clock-in judges lateness against the caller's ASSIGNED shift when one
-- exists; the org-wide schedule stays the fallback. (Night shifts crossing
-- midnight: lateness compares against start_time on the clock-in day —
-- adequate for v1; the grace window applies identically.)
create or replace function public.attendance_clock_in(p_lat numeric, p_lng numeric)
returns public.attendance_records language plpgsql security definer set search_path = public as $$
declare
  row public.attendance_records;
  s   public.attendance_settings;
  sh  public.attendance_shifts;
  v_start time;
  v_days  int[];
  v_local timestamp;
  v_dow   int;
  v_late  boolean := false;
  v_min   int := 0;
  v_dist  numeric;
begin
  if not public.has_attendance_suite() then raise exception 'Access denied.'; end if;
  if exists (select 1 from public.attendance_records where employee_id = auth.uid() and clock_out_at is null) then
    raise exception 'You already have an open shift — clock out first.';
  end if;
  select * into s from public.attendance_settings where org_id = public.my_org_id();

  if s.geofence_radius_m is not null and s.geofence_radius_m > 0
     and s.office_lat is not null and p_lat is not null then
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - s.office_lat) / 2), 2) +
      cos(radians(s.office_lat)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - s.office_lng) / 2), 2)));
    if v_dist > s.geofence_radius_m then
      raise exception 'You are too far from the office to clock in (about % m away).', round(v_dist);
    end if;
  end if;

  -- schedule: the person's shift wins; org settings are the fallback
  select ash.* into sh
  from public.attendance_shift_assignments a
  join public.attendance_shifts ash on ash.id = a.shift_id
  where a.user_id = auth.uid() and a.org_id = public.my_org_id();
  v_start := coalesce(sh.start_time, s.work_start);
  v_days  := coalesce(sh.days, s.working_days);

  if v_start is not null then
    v_local := now() at time zone 'Africa/Lagos';
    v_dow := extract(dow from v_local)::int;
    if v_days is null or v_dow = any(v_days) then
      if v_local::time > (v_start + make_interval(mins => coalesce(s.grace_minutes, 0))) then
        v_late := true;
        v_min  := greatest(0, floor(extract(epoch from (v_local::time - v_start)) / 60)::int);
      end if;
    end if;
  end if;

  insert into public.attendance_records
    (org_id, employee_id, clock_in_lat, clock_in_lng, source, is_late, late_minutes)
  values
    (public.my_org_id(), auth.uid(), p_lat, p_lng, 'phone', v_late, v_min)
  returning * into row;
  return row;
end;
$$;
grant execute on function public.attendance_clock_in(numeric, numeric) to authenticated;
