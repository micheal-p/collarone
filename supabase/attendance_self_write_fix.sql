-- Employees could edit their own attendance rows. Attendance feeds payroll.
--
-- attendance.sql:54 created ONE policy `for all` whose USING clause was
-- (same_org AND (is_attendance_manager() OR employee_id = auth.uid())). `for
-- all` covers SELECT, INSERT, UPDATE and DELETE, so the `employee_id =
-- auth.uid()` branch that was meant to let someone SEE their own attendance
-- also let them REWRITE it. The anon key ships in the browser bundle, so any
-- employee could open the console and move their own clock-in earlier, extend
-- a clock-out, or delete a short day — and those hours are a payroll input.
--
-- Splitting the policy fixes it: read your own, but only a manager writes.
--
-- Employees are NOT locked out of clocking. attendance_clock_in and
-- attendance_clock_out are SECURITY DEFINER (attendance_shifts.sql:53,
-- attendance.sql:76), so they bypass RLS entirely and keep working — and they
-- are the only sanctioned path, which is the point: they enforce the geofence,
-- the open-shift check, and the lateness maths. A direct table write skipped
-- all three.
--
-- The one legitimate direct write, the manager's timesheet correction
-- (supabaseApi.js:1778), passes is_attendance_manager() and is unaffected.

drop policy if exists "attendance_write" on public.attendance_records;
drop policy if exists "attendance_select" on public.attendance_records;

-- READ: your own row, or anything in your org if you manage attendance.
create policy "attendance_select" on public.attendance_records for select using (
  public.same_org(org_id) and (public.is_attendance_manager() or employee_id = auth.uid())
);

-- WRITE: managers only, and never from a read-only support session.
create policy "attendance_insert" on public.attendance_records for insert with check (
  public.same_org(org_id) and public.is_attendance_manager() and not public.is_support_session()
);
create policy "attendance_update" on public.attendance_records for update using (
  public.same_org(org_id) and public.is_attendance_manager() and not public.is_support_session()
) with check (
  public.same_org(org_id) and public.is_attendance_manager() and not public.is_support_session()
);
create policy "attendance_delete" on public.attendance_records for delete using (
  public.same_org(org_id) and public.is_attendance_manager() and not public.is_support_session()
);
