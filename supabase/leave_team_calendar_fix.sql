-- ============================================================================
-- SECURITY FIX + upgrade: team calendar. Run after leave_multitenancy.sql.
-- Idempotent.
--
-- THE BUG: public.team_calendar was a plain view (leave.sql) joining
-- leave_requests → profiles with NO org filter. Views execute with their
-- owner's privileges (bypassing RLS) unless security_invoker is set, and the
-- multitenancy pass re-scoped every TABLE but missed this VIEW — so any
-- authenticated user of any org could read every org's approved leave, with
-- employee names. Same regression class as the profiles_select drops.
--
-- THE FIX: drop the view; replace with a SECURITY DEFINER function that
-- scopes to the caller's org explicitly. Privacy stays: names + dates +
-- department only — never the leave type or reason. Staff see approved
-- absences; approvers also see pending ones (they decide them, and it powers
-- the overlap warning in Approvals).
-- ============================================================================
drop view if exists public.team_calendar;

create or replace function public.team_absences()
returns table (id uuid, person text, department text, start_date date, end_date date, status text)
language sql stable security definer set search_path = public as $$
  select r.id, p.name, coalesce(p.department, ''), r.start_date, r.end_date, r.status
  from public.leave_requests r
  join public.profiles p on p.id = r.user_id
  where p.org_id = public.my_org_id()
    and r.end_date >= current_date - 120
    and (
      r.status = 'approved'
      or (r.status = 'pending' and public.is_leave_approver())
    );
$$;
grant execute on function public.team_absences() to authenticated;
