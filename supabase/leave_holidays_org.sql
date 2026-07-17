-- ============================================================================
-- Org-scoped holidays. Previously the holidays table was global with
-- write access for ANY org's leave approver — a cross-tenant write gap.
-- Now: org_id null = statutory/global rows (readable by all, writable by
-- nobody through the API); org rows are readable+writable by their own org.
-- ============================================================================
alter table public.holidays add column if not exists org_id uuid references public.organizations(id) on delete cascade;

drop policy if exists "hol_read" on public.holidays;
create policy "hol_read" on public.holidays for select using (
  org_id is null or public.same_org(org_id)
);
drop policy if exists "hol_write" on public.holidays;
create policy "hol_write" on public.holidays for all using (
  org_id is not null and public.same_org(org_id) and public.is_leave_approver()
) with check (
  org_id is not null and public.same_org(org_id) and public.is_leave_approver()
);
