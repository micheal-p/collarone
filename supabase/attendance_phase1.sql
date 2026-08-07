-- ============================================================================
-- Attendance Phase 1: named office, payroll-safe auto-close. Idempotent.
--
-- 1. office_name — records and the clock-in screen say "2.1 km from Ikate
--    Office" instead of bare coordinates; the fence gets a human name.
--
-- 2. auto-close — an open shift left overnight used to count 0.0h forever and
--    haunt the Today board as "on shift now" days later. Now a stale shift is
--    closed at the day's scheduled close (never before its own clock-in) and
--    flagged auto_closed. DELIBERATE POLICY: auto-closed hours are VISIBLE but
--    PROVISIONAL — the timesheet shows them flagged, and a manager's pencil
--    edit (which clears the flag) is what confirms them. Fabricating a
--    clock-out must never silently credit payable time: leave at 2pm, forget
--    to punch out, and an unflagged 5pm close would invent three paid hours.
--
--    No cron exists here, so closing happens lazily: the app calls the RPC on
--    attendance load and before each clock-in. Deterministic outcome, no timer.
-- ============================================================================

alter table public.attendance_settings add column if not exists office_name text;

alter table public.attendance_records add column if not exists auto_closed boolean not null default false;

create or replace function public.attendance_autoclose_stale()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org_id();
  s public.attendance_settings;
  n integer := 0;
  r record;
  v_close timestamptz;
begin
  if v_org is null then return 0; end if;
  select * into s from public.attendance_settings where org_id = v_org;

  -- Stale = open for at least 20 hours. AGE, deliberately not calendar day:
  -- "from a previous day" would close a night guard who clocked in at 22:00
  -- the moment anyone loads the suite at 06:00 — mid-shift. No legitimate
  -- single shift runs 20 hours; a forgotten one always crosses it.
  for r in
    select id, clock_in_at from public.attendance_records
    where org_id = v_org and clock_out_at is null
      and clock_in_at < now() - interval '20 hours'
  loop
    -- Close at the scheduled close of the clock-in's own day (WAT), default
    -- 17:00. A shift that STARTED after that close (evening/night shifts)
    -- gets clock-in + 8h instead — still provisional, the flag is the point.
    v_close := ((r.clock_in_at at time zone 'Africa/Lagos')::date
                + coalesce(s.work_close, '17:00'::time)) at time zone 'Africa/Lagos';
    if v_close <= r.clock_in_at then v_close := r.clock_in_at + interval '8 hours'; end if;
    update public.attendance_records
      set clock_out_at = v_close, auto_closed = true
      where id = r.id;
    n := n + 1;
  end loop;
  return n;
end; $$;

grant execute on function public.attendance_autoclose_stale() to authenticated;

-- Confirmation is the existing pencil edit: the client clears auto_closed on
-- any manual clock-out correction (RLS already restricts that to managers).
