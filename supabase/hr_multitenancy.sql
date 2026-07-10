-- ============================================================================
-- Collarone — Stage 2, suite 1: HR goes multi-tenant
-- Run AFTER organizations.sql, billing.sql, and every hr*.sql / lifecycle.sql /
-- departments.sql file. Idempotent.
--
-- Adds org_id to departments and every HR/recruiting/lifecycle/performance/
-- compliance table, backfills it from the related employee/creator's own
-- org_id, and adds `same_org()` to every policy on these tables. Also widens
-- the Phase-1 guardrail trigger from an all-or-nothing wipe to an expanding
-- whitelist of suites that have actually been through this treatment — 'hr'
-- is the first entry. Leave/Tasks/Visitors/Payroll are NOT in the whitelist
-- yet and stay blocked for non-founding orgs until they get the same pass.
--
-- Also fixes a real regression: hr.sql's profiles_select broadening (HR
-- managers can read the full staff directory) was silently dropped when
-- organizations.sql replaced that policy without carrying it forward.
-- ============================================================================

-- ---- departments ------------------------------------------------------------
alter table public.departments add column if not exists org_id uuid references public.organizations(id);
update public.departments set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
alter table public.departments alter column org_id set not null;

alter table public.departments drop constraint if exists departments_code_key;
drop index if exists departments_code_key;
alter table public.departments add constraint departments_org_code_key unique (org_id, code);

drop policy if exists "departments_select" on public.departments;
create policy "departments_select" on public.departments for select
  using (auth.role() = 'authenticated' and public.same_org(org_id));

drop policy if exists "departments_admin_write" on public.departments;
create policy "departments_admin_write" on public.departments for all
  using (public.is_super_admin() and public.same_org(org_id))
  with check (public.is_super_admin() and public.same_org(org_id));

-- Give every non-founding org the same starter department set the founding org has, scoped to
-- their own org_id (composite unique key means codes can repeat across orgs).
insert into public.departments (name, code, org_id)
select d.name, d.code, o.id
from public.organizations o
cross join (values ('Human Resources','HR'), ('Information Technology','IT'), ('Finance','FINANCE'), ('Procurement','PROCUREMENT')) as d(name, code)
where o.id <> '00000000-0000-0000-0000-000000000001'
on conflict (org_id, code) do nothing;

-- ---- generic helper: add + backfill + NOT NULL an org_id column -------------
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('goals',               'employee_id'),
      ('performance_reviews', 'employee_id'),
      ('trainings',           'employee_id'),
      ('employee_documents',  'employee_id'),
      ('disciplinary_cases',  'employee_id'),
      ('letter_requests',     'employee_id'),
      ('exit_records',        'employee_id'),
      ('lifecycle_tasks',     'employee_id'),
      ('job_requisitions',    'created_by'),
      ('candidates',          'created_by'),
      ('applications',        'created_by'),
      ('interviews',          'created_by')
    ) as x(table_name, ref_col)
  loop
    execute format('alter table public.%I add column if not exists org_id uuid references public.organizations(id)', t.table_name);
    execute format(
      'update public.%I x set org_id = p.org_id from public.profiles p where p.id = x.%I and x.org_id is null',
      t.table_name, t.ref_col
    );
    -- Any row whose referenced profile no longer exists (shouldn't happen —
    -- FKs are not-null everywhere here) falls back to the founding org rather than blocking the migration.
    execute format('update public.%I set org_id = %L where org_id is null', t.table_name, '00000000-0000-0000-0000-000000000001');
    execute format('alter table public.%I alter column org_id set not null', t.table_name);
  end loop;
end $$;

-- ---- profiles_select: restore the has_hr_suite() broadening, org-scoped ------
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (
    id = auth.uid()
    or (public.is_super_admin() and public.same_org(org_id))
    or (public.has_hr_suite() and public.same_org(org_id))
    or public.is_platform_admin()
  );

-- ---- job_requisitions ---------------------------------------------------------
drop policy if exists "reqs_select" on public.job_requisitions;
create policy "reqs_select" on public.job_requisitions for select using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager() or hiring_manager_id = auth.uid())
);
drop policy if exists "reqs_write" on public.job_requisitions;
create policy "reqs_write" on public.job_requisitions for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
);

-- ---- candidates -----------------------------------------------------------
drop policy if exists "candidates_select" on public.candidates;
create policy "candidates_select" on public.candidates for select using (
  public.same_org(org_id) and (
    public.is_super_admin() or public.is_hr_manager()
    or exists (
      select 1 from public.applications a join public.interviews i on i.application_id = a.id
      where a.candidate_id = candidates.id and i.interviewer_id = auth.uid()
    )
  )
);
drop policy if exists "candidates_write" on public.candidates;
create policy "candidates_write" on public.candidates for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
);

-- ---- applications -----------------------------------------------------------
drop policy if exists "applications_select" on public.applications;
create policy "applications_select" on public.applications for select using (
  public.same_org(org_id) and (
    public.is_super_admin() or public.is_hr_manager()
    or exists (select 1 from public.interviews i where i.application_id = applications.id and i.interviewer_id = auth.uid())
  )
);
drop policy if exists "applications_write" on public.applications;
create policy "applications_write" on public.applications for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
);

-- ---- interviews -----------------------------------------------------------
drop policy if exists "interviews_select" on public.interviews;
create policy "interviews_select" on public.interviews for select using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager() or interviewer_id = auth.uid())
);
drop policy if exists "interviews_insert" on public.interviews;
create policy "interviews_insert" on public.interviews for insert with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
);
drop policy if exists "interviews_update" on public.interviews;
create policy "interviews_update" on public.interviews for update using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager() or interviewer_id = auth.uid())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager() or interviewer_id = auth.uid())
);
drop policy if exists "interviews_delete" on public.interviews;
create policy "interviews_delete" on public.interviews for delete using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
);

-- ---- exit_records / lifecycle_tasks ------------------------------------------
drop policy if exists "exits_select" on public.exit_records;
create policy "exits_select" on public.exit_records for select using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager() or employee_id = auth.uid() or initiated_by = auth.uid())
);
drop policy if exists "exits_write" on public.exit_records;
create policy "exits_write" on public.exit_records for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
);

drop policy if exists "lifecycle_tasks_select" on public.lifecycle_tasks;
create policy "lifecycle_tasks_select" on public.lifecycle_tasks for select using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager() or employee_id = auth.uid())
);
drop policy if exists "lifecycle_tasks_write" on public.lifecycle_tasks;
create policy "lifecycle_tasks_write" on public.lifecycle_tasks for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
);

-- lifecycle_task_templates intentionally stays global (shared starter
-- checklist, nothing company-specific in it) — no org_id, no change here.

-- ---- goals / performance_reviews / trainings ---------------------------------
drop policy if exists "goals_select" on public.goals;
create policy "goals_select" on public.goals for select using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager() or employee_id = auth.uid())
);
drop policy if exists "goals_write" on public.goals;
create policy "goals_write" on public.goals for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager() or employee_id = auth.uid())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager() or employee_id = auth.uid())
);

drop policy if exists "reviews_select" on public.performance_reviews;
create policy "reviews_select" on public.performance_reviews for select using (
  public.same_org(org_id) and (
    public.is_super_admin() or public.is_hr_manager() or reviewer_id = auth.uid()
    or (employee_id = auth.uid() and status <> 'draft')
  )
);
drop policy if exists "reviews_write" on public.performance_reviews;
create policy "reviews_write" on public.performance_reviews for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager() or reviewer_id = auth.uid())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager() or reviewer_id = auth.uid())
);

drop policy if exists "trainings_select" on public.trainings;
create policy "trainings_select" on public.trainings for select using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager() or employee_id = auth.uid())
);
drop policy if exists "trainings_write" on public.trainings;
create policy "trainings_write" on public.trainings for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
);

-- ---- employee_documents / disciplinary_cases ---------------------------------
drop policy if exists "employee_documents_select" on public.employee_documents;
create policy "employee_documents_select" on public.employee_documents for select using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager() or employee_id = auth.uid())
);
drop policy if exists "employee_documents_write" on public.employee_documents;
create policy "employee_documents_write" on public.employee_documents for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
);

drop policy if exists "disciplinary_cases_all" on public.disciplinary_cases;
create policy "disciplinary_cases_all" on public.disciplinary_cases for all using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
);

-- ---- letter_requests ----------------------------------------------------------
drop policy if exists "letter_requests_select" on public.letter_requests;
create policy "letter_requests_select" on public.letter_requests for select using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager() or employee_id = auth.uid())
);
drop policy if exists "letter_requests_insert" on public.letter_requests;
create policy "letter_requests_insert" on public.letter_requests for insert with check (
  public.same_org(org_id) and (employee_id = auth.uid() or public.is_hr_manager() or public.is_super_admin())
);
drop policy if exists "letter_requests_update" on public.letter_requests;
create policy "letter_requests_update" on public.letter_requests for update using (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
) with check (
  public.same_org(org_id) and (public.is_super_admin() or public.is_hr_manager())
);

-- ---- Phase 2: widen the guardrail from all-or-nothing to an expanding list ---
-- Non-the founding org orgs can now legitimately hold 'hr' suite grants; every other suite
-- key is still stripped until it gets its own multi-tenancy pass.
create or replace function public.enforce_phase1_suite_scope() returns trigger
language plpgsql as $$
declare
  safe_suites text[] := array['hr'];
begin
  if new.org_id <> '00000000-0000-0000-0000-000000000001' then
    select coalesce(jsonb_agg(g), '[]'::jsonb) into new.suites
    from jsonb_array_elements(new.suites) g
    where g->>'key' = any(safe_suites);
  end if;
  return new;
end;
$$;
-- trigger already points at this function (organizations.sql) — replace is enough.

-- ---- application inserts need org_id set explicitly ---------------------------
-- (org_id has no default and isn't derivable from a fresh insert's own row —
-- application code sets it going forward; see supabaseApi.js changes.)
