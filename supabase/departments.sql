-- ============================================================================
-- Org-Ops ERP — Departments
-- Run in Supabase SQL Editor after schema.sql.
-- Idempotent — safe to re-run.
-- ============================================================================

-- ---- Table -----------------------------------------------------------------
create table if not exists public.departments (
  id     serial primary key,
  name   text not null,
  code   text not null unique,
  active boolean not null default true
);

alter table public.departments enable row level security;

drop policy if exists "departments_select" on public.departments;
create policy "departments_select" on public.departments for select
  using (auth.role() = 'authenticated');

drop policy if exists "departments_admin_write" on public.departments;
create policy "departments_admin_write" on public.departments for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---- Seed ------------------------------------------------------------------
insert into public.departments (name, code) values
  ('Human Resources',      'HR'),
  ('Information Technology','IT'),
  ('Finance',              'FINANCE'),
  ('Procurement',          'PROCUREMENT')
on conflict (code) do nothing;

-- ---- Add department_id FK to profiles -------------------------------------
alter table public.profiles
  add column if not exists department_id int references public.departments(id);

-- Back-fill: match existing text values (best-effort, no error on miss)
update public.profiles p
set department_id = d.id
from public.departments d
where lower(trim(p.department)) = lower(d.name)
  and p.department_id is null;
