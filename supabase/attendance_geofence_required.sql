-- ============================================================================
-- A geofence that any member of staff can switch off does not exist. Idempotent.
--
-- This is the LIVE attendance_clock_in() with one condition changed. It was
-- generated from pg_get_functiondef rather than retyped, because the first
-- attempt at writing it from memory invented columns that do not exist.
-- ============================================================================
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

  -- Is a fence configured for this org?
  if s.geofence_radius_m is not null and s.geofence_radius_m > 0
     and s.office_lat is not null then
    -- Then a missing position is a REFUSAL, not a free pass.
    --
    -- The old condition ended with "and p_lat is not null", which reads as
    -- "only check when we have a position" but meant the entire distance
    -- check was skipped whenever the client sent NULL coordinates. That is
    -- exactly what it sends when someone denies the location permission, so
    -- the way past a 500m fence was to turn location off.
    --
    -- Verified against production before this change: at the office allowed,
    -- 250m allowed, 1.5km refused, and NO LOCATION AT ALL allowed.
    if p_lat is null or p_lng is null then
      raise exception 'Turn on location so we can confirm you are at work, then clock in again.';
    end if;
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
$function$
;

grant execute on function public.attendance_clock_in(numeric, numeric) to authenticated;
