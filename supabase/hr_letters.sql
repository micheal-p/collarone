-- ============================================================================
-- HR Letters Engine — letterheads + issued letters
-- Run AFTER hr_performance_compliance.sql and hr_multitenancy.sql
-- (depends on is_hr_manager(), same_org(), the hr-letters storage bucket).
-- ============================================================================

-- ---- Org letterheads -------------------------------------------------------
-- One org can save several letterheads (e.g. head office vs a subsidiary);
-- exactly one is the default used when composing. Two modes:
--   generated — details jsonb + a template_key rendered client-side
--   upload    — a .docx/.pdf file in the hr-letters bucket (letterheads/ prefix)
create table if not exists public.hr_letterheads (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  name         text not null default 'Company letterhead',
  mode         text not null default 'generated' check (mode in ('generated','upload')),
  template_key text not null default 'classic',
  details      jsonb not null default '{}'::jsonb,  -- { companyName, address, phone, email, rcNumber, tagline, accent }
  file_path    text,                                -- upload mode: storage path in hr-letters bucket
  is_default   boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.hr_letterheads enable row level security;

drop policy if exists "hr_letterheads_select" on public.hr_letterheads;
create policy "hr_letterheads_select" on public.hr_letterheads for select using (
  (public.is_super_admin() or public.is_hr_manager()) and public.same_org(org_id)
);
drop policy if exists "hr_letterheads_write" on public.hr_letterheads;
create policy "hr_letterheads_write" on public.hr_letterheads for all using (
  (public.is_super_admin() or public.is_hr_manager()) and public.same_org(org_id)
) with check (
  (public.is_super_admin() or public.is_hr_manager()) and public.same_org(org_id)
);

-- ---- Issued letters --------------------------------------------------------
-- A record of every letter HR issues (manual, AI-assisted, or fulfilling an
-- employee's letter_request). body is the letter text; the rendered HTML is
-- filed into Documents best-effort, doc reference kept here.
create table if not exists public.hr_letters (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  letter_type   text not null default 'custom' check (letter_type in
                  ('confirmation','promotion','introduction','employment_verification','query','warning','custom')),
  title         text not null,
  body          text not null,
  letterhead_id uuid references public.hr_letterheads(id) on delete set null,
  request_id    uuid references public.letter_requests(id) on delete set null,
  file_path     text,   -- rendered HTML in hr-letters bucket (issued/ prefix)
  issued_by     uuid references public.profiles(id) on delete set null,
  issued_at     timestamptz not null default now()
);

alter table public.hr_letters enable row level security;

-- HR managers see all org letters; an employee can see letters issued to them.
drop policy if exists "hr_letters_select" on public.hr_letters;
create policy "hr_letters_select" on public.hr_letters for select using (
  ((public.is_super_admin() or public.is_hr_manager()) and public.same_org(org_id))
  or (employee_id = auth.uid() and public.same_org(org_id))
);
drop policy if exists "hr_letters_write" on public.hr_letters;
create policy "hr_letters_write" on public.hr_letters for all using (
  (public.is_super_admin() or public.is_hr_manager()) and public.same_org(org_id)
) with check (
  (public.is_super_admin() or public.is_hr_manager()) and public.same_org(org_id)
);
