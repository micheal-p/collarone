-- ============================================================================
-- Projects — time tracking → invoice. Run after projects.sql +
-- trade_docs_quotes.sql. Idempotent.
--
-- Members log hours against a project; unbilled billable time rolls up and a
-- manager drafts a real invoice from it in one click (Invoicing suite does
-- the rest: send link, chase overdue, statements). Entries remember which
-- invoice billed them so nothing is ever billed twice.
-- ============================================================================
create table if not exists public.project_time_entries (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  entry_date      date not null default current_date,
  hours           numeric not null check (hours > 0 and hours <= 24),
  note            text not null default '',
  billable        boolean not null default true,
  rate_naira      numeric not null default 0 check (rate_naira >= 0),   -- per hour
  invoiced_doc_id uuid references public.trade_documents(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists ptime_project_idx on public.project_time_entries (project_id, entry_date desc);
create index if not exists ptime_unbilled_idx on public.project_time_entries (project_id) where billable and invoiced_doc_id is null;

alter table public.project_time_entries enable row level security;
drop policy if exists ptime_select on public.project_time_entries;
create policy ptime_select on public.project_time_entries
  for select using (
    public.same_org(org_id) and public.has_projects_suite()
    and (user_id = auth.uid() or public.is_project_member(project_id) or public.is_projects_manager() or public.is_super_admin())
  );
drop policy if exists ptime_insert on public.project_time_entries;
create policy ptime_insert on public.project_time_entries
  for insert with check (
    public.same_org(org_id) and public.has_projects_suite()
    and user_id = auth.uid()
    and (public.is_project_member(project_id) or public.is_projects_manager() or public.is_super_admin())
  );
drop policy if exists ptime_update on public.project_time_entries;
create policy ptime_update on public.project_time_entries
  for update using (
    public.same_org(org_id)
    and (user_id = auth.uid() or public.is_projects_manager() or public.is_super_admin())
  ) with check (public.same_org(org_id));
drop policy if exists ptime_delete on public.project_time_entries;
create policy ptime_delete on public.project_time_entries
  for delete using (
    public.same_org(org_id)
    and (user_id = auth.uid() or public.is_projects_manager() or public.is_super_admin())
    and invoiced_doc_id is null      -- billed time is history, not editable
  );
