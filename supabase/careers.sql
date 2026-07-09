-- ============================================================================
-- Org-Ops ERP — Careers: public job board + applicant scoring
-- Lets HR publish open requisitions to a public, unauthenticated apply page,
-- and gives every inbound application a transparent, rubric-based match score
-- (not a black-box model) so HR can triage a large inbound pipeline quickly —
-- the score is always explainable and HR keeps the final call via the
-- existing manual star rating.
-- Run in Supabase SQL Editor after lifecycle.sql. Idempotent — safe to re-run.
-- ============================================================================

-- ---- Requisition fields used for the public posting + scoring ---------------
alter table public.job_requisitions
  add column if not exists min_experience_years numeric,
  add column if not exists salary_min            numeric,
  add column if not exists salary_max            numeric;

-- ---- Candidate / application fields captured from the public form -----------
alter table public.candidates
  add column if not exists portfolio_url text not null default '';

alter table public.applications
  add column if not exists cover_letter     text not null default '',
  add column if not exists years_experience numeric,
  add column if not exists expected_salary  numeric,
  add column if not exists match_score      numeric;

-- ---- Public postings view: only OPEN reqs, only non-sensitive columns -------
-- No hiring_manager_id, created_by, or internal status history — this is the
-- one thing exposed to the public internet, so it's a narrow, explicit list.
create or replace view public.public_job_postings as
select
  r.id, r.title, r.location, r.employment_type, r.headcount, r.description,
  r.min_experience_years, r.salary_min, r.salary_max, r.created_at,
  d.name as department_name
from public.job_requisitions r
left join public.departments d on d.id = r.department_id
where r.status = 'open';

grant select on public.public_job_postings to anon, authenticated;

-- ---- Transparent scoring rubric ----------------------------------------------
-- Explainable on purpose: experience fit (0-40) + salary fit (0-30) +
-- application completeness (0-30). No opaque model, no protected-class
-- signal — HR can see and defend exactly why a score landed where it did.
create or replace function public.compute_match_score(
  p_requisition_id  uuid,
  p_years_experience numeric,
  p_expected_salary  numeric,
  p_has_resume       boolean,
  p_has_cover_letter boolean
)
returns numeric language plpgsql stable set search_path = public as $$
declare
  req record;
  score numeric := 0;
begin
  select min_experience_years, salary_min, salary_max into req
  from public.job_requisitions where id = p_requisition_id;

  -- Experience fit (0-40): full marks at/above the bar, tapering below it.
  if req.min_experience_years is null or req.min_experience_years = 0 then
    score := score + 40;
  elsif p_years_experience is not null then
    score := score + least(40, round(40 * least(1, p_years_experience / req.min_experience_years)));
  end if;

  -- Salary fit (0-30): within range or below it is a full match; above it
  -- tapers off rather than disqualifying outright.
  if req.salary_min is null and req.salary_max is null then
    score := score + 30;
  elsif p_expected_salary is not null then
    if req.salary_max is not null and p_expected_salary <= req.salary_max then
      score := score + 30;
    elsif req.salary_max is not null and req.salary_max > 0 then
      score := score + greatest(0, round(30 - 30 * ((p_expected_salary - req.salary_max) / req.salary_max)));
    else
      score := score + 15;
    end if;
  end if;

  -- Completeness (0-30): a resume and an actual cover letter are the two
  -- signals every posting can score regardless of role.
  if p_has_resume then score := score + 20; end if;
  if p_has_cover_letter then score := score + 10; end if;

  return least(100, greatest(0, score));
end;
$$;

-- ---- Public application intake -----------------------------------------------
-- The ONE way an anonymous visitor can write to this schema. Validates the
-- role is actually open, computes the score, and inserts candidate +
-- application in one transaction. Nothing else is writable by anon.
create or replace function public.public_submit_application(
  p_requisition_id  uuid,
  p_name            text,
  p_email           text,
  p_phone           text,
  p_portfolio_url   text,
  p_cover_letter    text,
  p_years_experience numeric,
  p_expected_salary  numeric,
  p_resume_path     text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  req_status text;
  new_candidate_id uuid;
  new_application_id uuid;
  score numeric;
begin
  select status into req_status from public.job_requisitions where id = p_requisition_id;
  if req_status is null then raise exception 'This role could not be found.'; end if;
  if req_status <> 'open' then raise exception 'This role is no longer accepting applications.'; end if;
  if p_name is null or trim(p_name) = '' or p_email is null or trim(p_email) = '' then
    raise exception 'Name and email are required.';
  end if;

  score := public.compute_match_score(
    p_requisition_id, p_years_experience, p_expected_salary,
    p_resume_path is not null and p_resume_path <> '', p_cover_letter is not null and trim(p_cover_letter) <> ''
  );

  insert into public.candidates (name, email, phone, portfolio_url, resume_path, source, created_by)
  values (trim(p_name), trim(p_email), coalesce(p_phone, ''), coalesce(p_portfolio_url, ''), p_resume_path,
          'job_board', (select id from public.profiles where role = 'super_admin' limit 1))
  returning id into new_candidate_id;

  insert into public.applications (requisition_id, candidate_id, cover_letter, years_experience, expected_salary, match_score, created_by)
  values (p_requisition_id, new_candidate_id, coalesce(p_cover_letter, ''), p_years_experience, p_expected_salary, score,
          (select id from public.profiles where role = 'super_admin' limit 1))
  returning id into new_application_id;

  return new_application_id;
end;
$$;

grant execute on function public.compute_match_score(uuid, numeric, numeric, boolean, boolean) to anon, authenticated;
grant execute on function public.public_submit_application(uuid, text, text, text, text, text, numeric, numeric, text) to anon, authenticated;

-- ---- Storage: allow anonymous resume uploads (insert-only, no read/list) ----
drop policy if exists "resumes_anon_insert" on storage.objects;
create policy "resumes_anon_insert" on storage.objects
  for insert to anon
  with check (bucket_id = 'candidate-resumes');
