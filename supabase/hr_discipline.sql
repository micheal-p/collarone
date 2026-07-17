-- ============================================================================
-- Disciplinary fair-hearing stages on cases: query issued -> employee's
-- written response recorded -> outcome. Letters themselves live in hr_letters.
-- ============================================================================
alter table public.disciplinary_cases
  add column if not exists query_letter_id uuid references public.hr_letters(id) on delete set null,
  add column if not exists response_note text,
  add column if not exists response_at timestamptz,
  add column if not exists outcome text check (outcome in ('cleared','warning','suspension','termination') or outcome is null),
  add column if not exists outcome_letter_id uuid references public.hr_letters(id) on delete set null;
