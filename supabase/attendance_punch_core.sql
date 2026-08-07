-- ============================================================================
-- Attendance Phase 2: the universal punch core. Idempotent.
--
-- One canonical lane for hardware and imports. Any device that can make an
-- HTTP request — thumbprint wall, turnstile controller, integrator script —
-- POSTs to /api/punch with a per-device key; vendor dialects (ZKTeco ADMS
-- etc.) become thin adapters in front of this later, and CSV import feeds the
-- same lane, so "works with any device ever made" is literally true today.
--
-- Design rules, deliberate:
--   * Punch EVENTS only. Fingerprint templates are never ingested or stored —
--     biometrics stay on the device (NDPA: biometric data is sensitive;
--     we simply do not hold it).
--   * Device punches are evidence, not gospel: every raw punch is logged
--     (attendance_device_punches) with its outcome, back-dated punches are
--     accepted (devices buffer offline and flush later) but the raw log keeps
--     received_at vs punched_at so skew is always visible.
--   * Idempotent by construction: (device, person, timestamp) is unique, so a
--     device that nervously retries can never double-punch anyone.
-- ============================================================================

-- ---- 1. registered devices --------------------------------------------------
create table if not exists public.attendance_devices (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  name         text not null,
  serial       text not null,
  vendor       text,
  api_key      text not null unique,
  active       boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (org_id, serial)
);
alter table public.attendance_devices enable row level security;
-- The api_key is visible to the org's attendance managers — they have to type
-- it into the device/integrator, same trust level as a webhook secret. It only
-- grants "submit punches for this org", never reads.
drop policy if exists "attendance_devices_manage" on public.attendance_devices;
create policy "attendance_devices_manage" on public.attendance_devices
  for all using (public.same_org(org_id) and public.is_attendance_manager())
  with check (public.same_org(org_id) and public.is_attendance_manager());

-- ---- 2. raw punch log (audit + idempotency) ---------------------------------
create table if not exists public.attendance_device_punches (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  device_id   uuid references public.attendance_devices(id) on delete set null,
  person_ref  text not null,
  punched_at  timestamptz not null,
  direction   text not null default 'auto' check (direction in ('in','out','auto')),
  source      text not null default 'device' check (source in ('device','manual')),
  applied     boolean not null default false,
  record_id   uuid,
  error       text,
  received_at timestamptz not null default now()
);
create unique index if not exists attendance_punch_dedupe
  on public.attendance_device_punches (org_id, person_ref, punched_at);
create index if not exists attendance_punch_org_idx
  on public.attendance_device_punches (org_id, received_at desc);
alter table public.attendance_device_punches enable row level security;
drop policy if exists "attendance_punches_read" on public.attendance_device_punches;
create policy "attendance_punches_read" on public.attendance_device_punches
  for select using (public.same_org(org_id) and public.is_attendance_manager());
-- No client write policies: rows are written only by the service-role punch
-- endpoint.

-- ---- 3. apply a punch to the attendance records -----------------------------
-- Mirrors the phone clock-in's lateness logic but is parameterised by employee
-- and timestamp, because a buffered device punch is about when it HAPPENED.
-- direction 'auto' means: close the open shift if one exists, else open one —
-- which is exactly how wall terminals with a single thumb reader behave.
create or replace function public.attendance_apply_punch(
  p_org uuid, p_employee uuid, p_at timestamptz, p_direction text,
  p_source text, p_device_uid text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  s public.attendance_settings;
  sh public.attendance_shifts;
  v_open public.attendance_records;
  v_start time; v_days int[]; v_local timestamp; v_dow int;
  v_late boolean := false; v_min int := 0;
  v_id uuid;
begin
  if not exists (select 1 from public.profiles where id = p_employee and org_id = p_org) then
    raise exception 'unmapped employee';
  end if;

  select * into v_open from public.attendance_records
    where employee_id = p_employee and clock_out_at is null
    order by clock_in_at desc limit 1;

  if v_open.id is not null and p_direction in ('out','auto') then
    if p_at <= v_open.clock_in_at then raise exception 'clock-out before clock-in'; end if;
    update public.attendance_records
      set clock_out_at = p_at, auto_closed = false
      where id = v_open.id;
    return v_open.id;
  end if;

  if p_direction = 'out' then
    raise exception 'no open shift to close';
  end if;

  select * into s from public.attendance_settings where org_id = p_org;
  select ash.* into sh
    from public.attendance_shift_assignments a
    join public.attendance_shifts ash on ash.id = a.shift_id
    where a.user_id = p_employee and a.org_id = p_org;
  v_start := coalesce(sh.start_time, s.work_start);
  v_days  := coalesce(sh.days, s.working_days);
  if v_start is not null then
    v_local := p_at at time zone 'Africa/Lagos';
    v_dow := extract(dow from v_local)::int;
    if v_days is null or v_dow = any(v_days) then
      if v_local::time > (v_start + make_interval(mins => coalesce(s.grace_minutes, 0))) then
        v_late := true;
        v_min  := greatest(0, floor(extract(epoch from (v_local::time - v_start)) / 60)::int);
      end if;
    end if;
  end if;

  insert into public.attendance_records
    (org_id, employee_id, clock_in_at, source, device_uid, is_late, late_minutes)
  values (p_org, p_employee, p_at, p_source, p_device_uid, v_late, v_min)
  returning id into v_id;
  return v_id;
end; $$;
-- Service-role only: the punch endpoint is the sole caller.
revoke execute on function public.attendance_apply_punch(uuid, uuid, timestamptz, text, text, text) from authenticated, anon, public;

-- ---- 4. staff picker for the mapping screen ---------------------------------
-- An attendance manager may not hold the HR suite, so profiles RLS can hide
-- the directory from them; mapping a fingerprint PIN to a person needs names.
-- Minimal disclosure: id + name of active same-org staff, managers only.
create or replace function public.attendance_org_staff()
returns table (id uuid, name text) language sql stable security definer set search_path = public as $$
  select p.id, p.name from public.profiles p
  where p.org_id = public.my_org_id() and p.status = 'active'
    and p.role <> 'super_admin' and public.is_attendance_manager()
  order by p.name;
$$;
grant execute on function public.attendance_org_staff() to authenticated;

-- ---- 5. the phone/device policy switch actually enforces --------------------
-- Same body as attendance_geofence_required.sql plus the phone_enabled gate.
CREATE OR REPLACE FUNCTION public.attendance_clock_in(p_lat numeric, p_lng numeric)
 RETURNS attendance_records
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- The org chose device-only clock-in: the phone lane is closed.
  if s.org_id is not null and s.phone_enabled = false then
    raise exception 'Phone clock-in is turned off for your company — use the clocking device at the office.';
  end if;

  -- Location is required for EVERY phone clock-in, fence or no fence: a
  -- clock-in with no coordinates is a record nobody can trust later. Staff
  -- who cannot or will not share location use the wall device lane instead.
  if p_lat is null or p_lng is null then
    raise exception 'Turn on location to clock in — every clock-in records where it happened.';
  end if;

  if s.geofence_radius_m is not null and s.geofence_radius_m > 0
     and s.office_lat is not null then
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - s.office_lat) / 2), 2) +
      cos(radians(s.office_lat)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - s.office_lng) / 2), 2)));
    if v_dist > s.geofence_radius_m then
      raise exception 'You are too far from the office to clock in (about % m away).', round(v_dist);
    end if;
  end if;

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
$function$
;
grant execute on function public.attendance_clock_in(numeric, numeric) to authenticated;
