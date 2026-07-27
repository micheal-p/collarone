-- ============================================================================
-- Collarone — Attendance ↔ Payroll join, Phase 1 (backbone)
-- Run after attendance.sql and the payroll files. Idempotent. Native multi-tenant.
--
-- Phase 1 scope: employer-configured work hours + late/overtime policy, overtime
-- request/approval, lateness stamped at clock-in, geofenced phone clock-in, and
-- fingerprint-device punch mapping (CSV/ingest path). The payroll AUTO-CALC of
-- overtime_pay / late_deduction into generate_payroll_run is Phase 2 (done
-- carefully because overtime taxation is subtle) — see ATTENDANCE_PAYROLL_PLAN.md.
-- Columns for it (payroll_lines.overtime_pay / late_deduction, the adjustments
-- side table) are created here so Phase 2 is a pure function change.
-- ============================================================================

-- ---- 1. Employer config: one row per org ------------------------------------
create table if not exists public.attendance_settings (
  org_id                  uuid primary key references public.organizations(id) on delete cascade,
  phone_enabled           boolean not null default true,
  device_enabled          boolean not null default false,
  require_fingerprint     boolean not null default false,       -- phone WebAuthn (Phase 3)
  office_lat              numeric,
  office_lng              numeric,
  geofence_radius_m       integer not null default 0,           -- 0 = geofence off
  work_start              time    not null default '08:00',
  work_close              time    not null default '17:00',
  working_days            int[]   not null default '{1,2,3,4,5}', -- 0=Sun … 6=Sat
  grace_minutes           integer not null default 10,
  late_mode               text    not null default 'flag'
                            check (late_mode in ('flag','per_day','per_minute','after_n')),
  late_amount             numeric not null default 0,
  late_after_n            integer not null default 0,
  overtime_multiplier     numeric not null default 1.5,
  overtime_needs_approval boolean not null default true,
  overtime_basis          text    not null default 'basic' check (overtime_basis in ('gross','basic')),
  standard_monthly_hours  numeric not null default 173.33,      -- → hourly rate
  updated_at              timestamptz not null default now()
);
alter table public.attendance_settings enable row level security;
drop policy if exists "attendance_settings_select" on public.attendance_settings;
create policy "attendance_settings_select" on public.attendance_settings
  for select using (public.same_org(org_id));
drop policy if exists "attendance_settings_write" on public.attendance_settings;
create policy "attendance_settings_write" on public.attendance_settings
  for all using (public.same_org(org_id) and public.is_attendance_manager())
  with check (public.same_org(org_id) and public.is_attendance_manager());

-- ---- 2. Overtime requests (approval flow, like leave) -----------------------
create table if not exists public.overtime_requests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id),
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  work_date     date not null,
  hours         numeric not null check (hours > 0 and hours <= 24),
  reason        text not null default '',
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by    uuid references public.profiles(id),
  decided_at    timestamptz,
  decision_note text not null default '',
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists overtime_requests_org_idx on public.overtime_requests (org_id, status, work_date desc);
create index if not exists overtime_requests_emp_idx on public.overtime_requests (employee_id, work_date desc);
alter table public.overtime_requests enable row level security;
drop policy if exists "overtime_select" on public.overtime_requests;
create policy "overtime_select" on public.overtime_requests for select using (
  public.same_org(org_id) and (public.is_attendance_manager() or employee_id = auth.uid())
);
-- inserts go through request_overtime(); no direct client insert/update/delete.

-- ---- 3. Fingerprint-device → staff mapping ----------------------------------
create table if not exists public.attendance_device_map (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id),
  device_uid  text not null,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (org_id, device_uid)
);
alter table public.attendance_device_map enable row level security;
drop policy if exists "device_map_select" on public.attendance_device_map;
create policy "device_map_select" on public.attendance_device_map
  for select using (public.same_org(org_id));
drop policy if exists "device_map_write" on public.attendance_device_map;
create policy "device_map_write" on public.attendance_device_map
  for all using (public.same_org(org_id) and public.is_attendance_manager())
  with check (public.same_org(org_id) and public.is_attendance_manager());

-- ---- 4. Extend attendance_records + payroll_lines ---------------------------
alter table public.attendance_records
  add column if not exists source       text    not null default 'phone',  -- phone | device | manual
  add column if not exists device_uid   text,
  add column if not exists is_late      boolean not null default false,
  add column if not exists late_minutes integer not null default 0;

alter table public.payroll_lines
  add column if not exists overtime_pay   numeric not null default 0,
  add column if not exists late_deduction numeric not null default 0;

-- Breakdown side table (same shape as payroll_line_loans) so payslips can show
-- exactly what the overtime / late numbers came from. Phase 2 populates it.
create table if not exists public.payroll_line_adjustments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id),
  run_id      uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('overtime','late')),
  hours       numeric not null default 0,
  amount      numeric not null default 0,
  created_at  timestamptz not null default now(),
  unique (run_id, employee_id, kind)
);
alter table public.payroll_line_adjustments enable row level security;
drop policy if exists "payroll_adj_select" on public.payroll_line_adjustments;
create policy "payroll_adj_select" on public.payroll_line_adjustments for select using (
  public.same_org(org_id) and (public.is_payroll_manager() or public.is_super_admin() or employee_id = auth.uid())
);
-- populated only by generate_payroll_run() (SECURITY DEFINER) in Phase 2.

-- ---- 5. Overtime RPCs -------------------------------------------------------
-- Staff submit their own; auto-approved if the org doesn't require approval.
create or replace function public.request_overtime(p_work_date date, p_hours numeric, p_reason text default '')
returns public.overtime_requests language plpgsql security definer set search_path = public as $$
declare row public.overtime_requests; v_needs boolean;
begin
  if not public.has_attendance_suite() then raise exception 'Access denied.'; end if;
  select overtime_needs_approval into v_needs from public.attendance_settings where org_id = public.my_org_id();
  v_needs := coalesce(v_needs, true);
  insert into public.overtime_requests (org_id, employee_id, work_date, hours, reason, status, created_by, decided_by, decided_at)
  values (
    public.my_org_id(), auth.uid(), p_work_date, p_hours, coalesce(p_reason, ''),
    case when v_needs then 'pending' else 'approved' end, auth.uid(),
    case when v_needs then null else auth.uid() end,
    case when v_needs then null else now() end
  )
  returning * into row;
  return row;
end; $$;
grant execute on function public.request_overtime(date, numeric, text) to authenticated;

-- Approve/reject. MUST org-check the specific row, not just the caller's role
-- (the decide_leave_request bug class: "allowed in general" ≠ "allowed on THIS row").
create or replace function public.decide_overtime(p_id uuid, p_approve boolean, p_note text default '')
returns public.overtime_requests language plpgsql security definer set search_path = public as $$
declare row public.overtime_requests;
begin
  if not public.is_attendance_manager() then raise exception 'Not authorised.'; end if;
  select * into row from public.overtime_requests where id = p_id;
  if row.id is null then raise exception 'Overtime request not found.'; end if;
  if not public.same_org(row.org_id) then raise exception 'Not authorised for this request.'; end if;
  if row.status <> 'pending' then raise exception 'This request has already been decided.'; end if;
  update public.overtime_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(p_note, '')
    where id = p_id
    returning * into row;
  return row;
end; $$;
grant execute on function public.decide_overtime(uuid, boolean, text) to authenticated;

-- ---- 6. Lateness summary for a period (self or manager; caller-org only) -----
create or replace function public.attendance_late_summary(p_emp uuid, p_month int, p_year int)
returns table(late_days int, late_minutes int)
language plpgsql security definer stable set search_path = public as $$
begin
  if p_emp <> auth.uid() and not public.is_attendance_manager() then
    raise exception 'Not authorised.';
  end if;
  return query
    select count(*)::int, coalesce(sum(ar.late_minutes), 0)::int
    from public.attendance_records ar
    where ar.employee_id = p_emp and ar.org_id = public.my_org_id() and ar.is_late
      and ar.clock_in_at >= make_date(p_year, p_month, 1)
      and ar.clock_in_at <  (make_date(p_year, p_month, 1) + interval '1 month');
end; $$;
grant execute on function public.attendance_late_summary(uuid, int, int) to authenticated;

-- ---- 7. Geofenced, lateness-stamping clock-in (replaces attendance.sql's) ----
create or replace function public.attendance_clock_in(p_lat numeric, p_lng numeric)
returns public.attendance_records language plpgsql security definer set search_path = public as $$
declare
  row public.attendance_records;
  s   public.attendance_settings;
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

  -- geofence: reject clock-in too far from the office (only if configured)
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

  -- lateness: stamp against the schedule (Nigeria/WAT), only on working days
  if s.work_start is not null then
    v_local := now() at time zone 'Africa/Lagos';
    v_dow := extract(dow from v_local)::int;
    if s.working_days is null or v_dow = any(s.working_days) then
      if v_local::time > (s.work_start + make_interval(mins => coalesce(s.grace_minutes, 0))) then
        v_late := true;
        v_min  := greatest(0, floor(extract(epoch from (v_local::time - s.work_start)) / 60)::int);
      end if;
    end if;
  end if;

  insert into public.attendance_records
    (org_id, employee_id, clock_in_lat, clock_in_lng, source, is_late, late_minutes)
  values
    (public.my_org_id(), auth.uid(), p_lat, p_lng, 'phone', v_late, v_min)
  returning * into row;
  return row;
end; $$;
grant execute on function public.attendance_clock_in(numeric, numeric) to authenticated;

-- ---- 8. Device punch ingest (CSV/API path; manager-only, device→staff map) ---
create or replace function public.ingest_device_punch(p_device_uid text, p_punch_at timestamptz, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid; v_org uuid := public.my_org_id();
begin
  if not public.is_attendance_manager() then raise exception 'Not authorised.'; end if;
  if p_kind not in ('in','out') then raise exception 'Punch kind must be in or out.'; end if;
  select employee_id into v_emp from public.attendance_device_map where org_id = v_org and device_uid = p_device_uid;
  if v_emp is null then raise exception 'Unknown device ID: %', p_device_uid; end if;

  if p_kind = 'in' then
    if not exists (select 1 from public.attendance_records where employee_id = v_emp and clock_out_at is null) then
      insert into public.attendance_records (org_id, employee_id, clock_in_at, source, device_uid)
      values (v_org, v_emp, p_punch_at, 'device', p_device_uid);
    end if;
  else
    update public.attendance_records set clock_out_at = p_punch_at
    where employee_id = v_emp and clock_out_at is null;
  end if;
end; $$;
grant execute on function public.ingest_device_punch(text, timestamptz, text) to authenticated;
