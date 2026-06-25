-- ============================================================================
-- Org-Ops Cloud ERP — Supabase schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query → Run.
-- Idempotent: safe to re-run.
-- ============================================================================

-- One row per staff member, linked 1:1 to a Supabase Auth user.
create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text not null,
  name                 text not null default '',
  job_title            text not null default '',
  department           text not null default '',
  role                 text not null default 'staff'  check (role in ('super_admin','manager','staff')),
  suites               jsonb not null default '[]'::jsonb,   -- [{ "key": "hr", "role": "manager" }]
  status               text not null default 'active' check (status in ('active','disabled')),
  must_change_password boolean not null default true,
  last_login_at        timestamptz,
  created_at           timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Is the current caller a System Admin? SECURITY DEFINER so it bypasses RLS
-- (avoids infinite recursion when used inside the profiles policies).
create or replace function public.is_super_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'super_admin'
  );
$$;

-- ---- Row-Level Security ----------------------------------------------------
-- Read: your own profile, or everything if you are a System Admin.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using ( id = auth.uid() or public.is_super_admin() );

-- Update: only System Admins (role / suites / status edits from the Admin Center).
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update
  using ( public.is_super_admin() ) with check ( public.is_super_admin() );

-- Insert / delete are performed only by the service role (Vercel /api/admin),
-- which bypasses RLS — so no INSERT/DELETE policies are granted to users.

-- ---- Self-service RPCs (SECURITY DEFINER, scoped to the caller) -------------
create or replace function public.mark_password_changed()
returns void language sql security definer
set search_path = public as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;

create or replace function public.touch_last_login()
returns void language sql security definer
set search_path = public as $$
  update public.profiles set last_login_at = now() where id = auth.uid();
$$;

grant execute on function public.is_super_admin()        to authenticated;
grant execute on function public.mark_password_changed() to authenticated;
grant execute on function public.touch_last_login()      to authenticated;
