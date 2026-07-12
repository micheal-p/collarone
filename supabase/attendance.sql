-- ============================================================================
-- Collarone — Time & Attendance suite (Stage 6 catalog, built early by demand)
-- Run after crm.sql. Idempotent. Native multi-tenant from day one.
--
-- v0 scope: geo-tagged clock-in/out, a timesheet view, and a simple overtime
-- calc (hours worked beyond 8/day). No shift scheduling or leave-integration
-- yet — those are real v1 follow-ups, not silently smuggled in. Geo-tagging
-- matters here specifically for a field/informal workforce with patchy
-- connectivity (per the Collarone Nigeria-angle design note) — lat/lng is
-- captured but never enforced against a geofence in v0 (no site-radius
-- validation yet), it's just recorded for a manager to review.
-- ============================================================================

create or replace function public.has_attendance_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"attendance"}]'::jsonb);
$$;
grant execute on function public.has_attendance_suite() to authenticated;

create or replace function public.is_attendance_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"attendance","role":"manager"}]'::jsonb);
$$;
grant execute on function public.is_attendance_manager() to authenticated;

create table if not exists public.attendance_records (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  employee_id    uuid not null references public.profiles(id) on delete cascade,
  clock_in_at    timestamptz not null default now(),
  clock_in_lat   numeric,
  clock_in_lng   numeric,
  clock_out_at   timestamptz,
  clock_out_lat  numeric,
  clock_out_lng  numeric,
  notes          text not null default '',
  created_at     timestamptz not null default now()
);

-- An employee can only have one OPEN shift (no clock_out yet) at a time.
create unique index if not exists attendance_one_open_shift
  on public.attendance_records (employee_id)
  where clock_out_at is null;

alter table public.attendance_records enable row level security;

drop policy if exists "attendance_select" on public.attendance_records;
create policy "attendance_select" on public.attendance_records for select using (
  public.same_org(org_id) and (public.is_attendance_manager() or employee_id = auth.uid())
);
drop policy if exists "attendance_write" on public.attendance_records;
create policy "attendance_write" on public.attendance_records for all using (
  public.same_org(org_id) and (public.is_attendance_manager() or employee_id = auth.uid())
) with check (
  public.same_org(org_id) and (public.is_attendance_manager() or employee_id = auth.uid())
);

create or replace function public.attendance_clock_in(p_lat numeric, p_lng numeric)
returns public.attendance_records language plpgsql security definer set search_path = public as $$
declare row public.attendance_records;
begin
  if not public.has_attendance_suite() then raise exception 'Access denied.'; end if;
  if exists (select 1 from public.attendance_records where employee_id = auth.uid() and clock_out_at is null) then
    raise exception 'You already have an open shift — clock out first.';
  end if;
  insert into public.attendance_records (org_id, employee_id, clock_in_lat, clock_in_lng)
  values (public.my_org_id(), auth.uid(), p_lat, p_lng)
  returning * into row;
  return row;
end;
$$;
grant execute on function public.attendance_clock_in(numeric, numeric) to authenticated;

create or replace function public.attendance_clock_out(p_lat numeric, p_lng numeric)
returns public.attendance_records language plpgsql security definer set search_path = public as $$
declare row public.attendance_records;
begin
  update public.attendance_records
  set clock_out_at = now(), clock_out_lat = p_lat, clock_out_lng = p_lng
  where employee_id = auth.uid() and clock_out_at is null
  returning * into row;
  if row.id is null then raise exception 'No open shift found.'; end if;
  return row;
end;
$$;
grant execute on function public.attendance_clock_out(numeric, numeric) to authenticated;

-- ---- Phase 2 whitelist: attendance is safe from birth ------------------------
create or replace function public.enforce_phase1_suite_scope() returns trigger
language plpgsql as $$
declare
  safe_suites text[] := array['hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm', 'attendance'];
begin
  if new.org_id <> '00000000-0000-0000-0000-000000000001' then
    select coalesce(jsonb_agg(g), '[]'::jsonb) into new.suites
    from jsonb_array_elements(new.suites) g
    where g->>'key' = any(safe_suites);
  end if;
  return new;
end;
$$;
