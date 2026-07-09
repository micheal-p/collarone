-- ============================================================================
-- Org-Ops ERP — HR: Performance & Growth, Compliance & Case Management,
-- Self-Service & Intelligence (letter requests). All folded into the
-- existing `hr` suite, not new suite keys — these are general HR functions,
-- unlike Payroll/Attendance/Benefits which stay separate for RBAC reasons.
-- Run after lifecycle.sql. Idempotent — safe to re-run.
-- ============================================================================

-- ============================================================================
-- PERFORMANCE & GROWTH
-- ============================================================================

create table if not exists public.goals (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  description  text not null default '',
  target_date  date,
  status       text not null default 'not_started' check (status in ('not_started','in_progress','done','missed')),
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.performance_reviews (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  reviewer_id   uuid not null references public.profiles(id),
  cycle_label   text not null,                 -- e.g. "H1 2026", "Probation review"
  rating        int check (rating between 1 and 5),
  strengths     text not null default '',
  improvements  text not null default '',
  status        text not null default 'draft' check (status in ('draft','submitted','acknowledged')),
  acknowledged_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.trainings (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references public.profiles(id) on delete cascade,
  title              text not null,
  provider           text not null default '',
  completed_date     date,
  certificate_expiry date,
  created_by         uuid not null references public.profiles(id),
  created_at         timestamptz not null default now()
);

create or replace function public.hr_touch_updated()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists goals_updated_at on public.goals;
create trigger goals_updated_at before update on public.goals
  for each row execute function public.hr_touch_updated();
drop trigger if exists reviews_updated_at on public.performance_reviews;
create trigger reviews_updated_at before update on public.performance_reviews
  for each row execute function public.hr_touch_updated();

alter table public.goals               enable row level security;
alter table public.performance_reviews enable row level security;
alter table public.trainings           enable row level security;

-- goals: hr manager full control; the employee can see and update their own
-- (status/progress) — trusted the same way an assignee can edit their own
-- task in the Tasks suite.
drop policy if exists "goals_select" on public.goals;
create policy "goals_select" on public.goals for select using (
  public.is_super_admin() or public.is_hr_manager() or employee_id = auth.uid()
);
drop policy if exists "goals_write" on public.goals;
create policy "goals_write" on public.goals for all using (
  public.is_super_admin() or public.is_hr_manager() or employee_id = auth.uid()
) with check (
  public.is_super_admin() or public.is_hr_manager() or employee_id = auth.uid()
);

-- performance_reviews: hr manager sees all; the reviewer sees/edits their own
-- drafts; the employee only sees it once it's been submitted (not a draft).
drop policy if exists "reviews_select" on public.performance_reviews;
create policy "reviews_select" on public.performance_reviews for select using (
  public.is_super_admin() or public.is_hr_manager()
  or reviewer_id = auth.uid()
  or (employee_id = auth.uid() and status <> 'draft')
);
drop policy if exists "reviews_write" on public.performance_reviews;
create policy "reviews_write" on public.performance_reviews for all using (
  public.is_super_admin() or public.is_hr_manager() or reviewer_id = auth.uid()
) with check (
  public.is_super_admin() or public.is_hr_manager() or reviewer_id = auth.uid()
);

-- Employee acknowledging a submitted review — the one thing they can change.
create or replace function public.acknowledge_review(p_review_id uuid)
returns public.performance_reviews language plpgsql security definer set search_path = public as $$
declare result public.performance_reviews;
begin
  update public.performance_reviews
  set status = 'acknowledged', acknowledged_at = now()
  where id = p_review_id and employee_id = auth.uid() and status = 'submitted'
  returning * into result;
  if result.id is null then raise exception 'Review not found or not awaiting acknowledgement'; end if;
  return result;
end;
$$;
grant execute on function public.acknowledge_review(uuid) to authenticated;

-- trainings: hr manager writes; employee sees their own certifications.
drop policy if exists "trainings_select" on public.trainings;
create policy "trainings_select" on public.trainings for select using (
  public.is_super_admin() or public.is_hr_manager() or employee_id = auth.uid()
);
drop policy if exists "trainings_write" on public.trainings;
create policy "trainings_write" on public.trainings for all using (
  public.is_super_admin() or public.is_hr_manager()
) with check (
  public.is_super_admin() or public.is_hr_manager()
);

-- ============================================================================
-- COMPLIANCE & CASE MANAGEMENT
-- ============================================================================

create table if not exists public.employee_documents (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  category     text not null default 'other' check (category in ('contract','id','certificate','other')),
  file_path    text not null,
  expiry_date  date,
  uploaded_by  uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

-- Confidential by design: HR manager / super_admin only. Not even the
-- employee it concerns has self-service visibility in this v1 — real
-- disciplinary process communicates outcomes through other channels.
create table if not exists public.disciplinary_cases (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.profiles(id) on delete cascade,
  opened_by        uuid not null references public.profiles(id),
  category         text not null default 'other' check (category in ('warning','investigation','suspension','other')),
  description      text not null default '',
  status           text not null default 'open' check (status in ('open','resolved')),
  resolution_notes text not null default '',
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

alter table public.employee_documents enable row level security;
alter table public.disciplinary_cases enable row level security;

drop policy if exists "employee_documents_select" on public.employee_documents;
create policy "employee_documents_select" on public.employee_documents for select using (
  public.is_super_admin() or public.is_hr_manager() or employee_id = auth.uid()
);
drop policy if exists "employee_documents_write" on public.employee_documents;
create policy "employee_documents_write" on public.employee_documents for all using (
  public.is_super_admin() or public.is_hr_manager()
) with check (
  public.is_super_admin() or public.is_hr_manager()
);

drop policy if exists "disciplinary_cases_all" on public.disciplinary_cases;
create policy "disciplinary_cases_all" on public.disciplinary_cases for all using (
  public.is_super_admin() or public.is_hr_manager()
) with check (
  public.is_super_admin() or public.is_hr_manager()
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('employee-documents', 'employee-documents', false, 10485760)
on conflict do nothing;

drop policy if exists "employee_docs_all" on storage.objects;
create policy "employee_docs_all" on storage.objects
  for all to authenticated
  using  (bucket_id = 'employee-documents')
  with check (bucket_id = 'employee-documents');

-- ============================================================================
-- SELF-SERVICE: letter requests
-- ============================================================================

create table if not exists public.letter_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id) on delete cascade,
  letter_type  text not null default 'employment_verification' check (letter_type in ('employment_verification','reference','other')),
  purpose      text not null default '',
  status       text not null default 'pending' check (status in ('pending','issued','declined')),
  issued_file_path text,
  decline_reason text not null default '',
  requested_at timestamptz not null default now(),
  decided_by   uuid references public.profiles(id),
  decided_at   timestamptz
);

alter table public.letter_requests enable row level security;

drop policy if exists "letter_requests_select" on public.letter_requests;
create policy "letter_requests_select" on public.letter_requests for select using (
  public.is_super_admin() or public.is_hr_manager() or employee_id = auth.uid()
);
drop policy if exists "letter_requests_insert" on public.letter_requests;
create policy "letter_requests_insert" on public.letter_requests for insert with check (
  employee_id = auth.uid() or public.is_hr_manager() or public.is_super_admin()
);
drop policy if exists "letter_requests_update" on public.letter_requests;
create policy "letter_requests_update" on public.letter_requests for update using (
  public.is_super_admin() or public.is_hr_manager()
) with check (
  public.is_super_admin() or public.is_hr_manager()
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('hr-letters', 'hr-letters', false, 10485760)
on conflict do nothing;

drop policy if exists "hr_letters_all" on storage.objects;
create policy "hr_letters_all" on storage.objects
  for all to authenticated
  using  (bucket_id = 'hr-letters')
  with check (bucket_id = 'hr-letters');
