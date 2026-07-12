-- ============================================================================
-- Collarone — Stage 3, part 1: CRM v0
-- Run after visitors_multitenancy.sql / payroll_multitenancy.sql. Idempotent.
--
-- Deliberately v0 scope (user's own call, 2026-07-10, given the July 20
-- deadline): contacts + companies + a simple activity log. No deal pipeline,
-- no stages, no automation yet — those are a real Stage 3+ follow-up, not
-- silently smuggled in early. WhatsApp is a first-class field on both
-- contacts and activities (not email) since that's where NG business
-- communication actually happens — matches the CRM scope note in
-- [[collarone-pivot]].
--
-- Built natively multi-tenant from day one (org_id + same_org() from the
-- start) — no retrofit needed, unlike the five suites that predate the
-- organizations/org_id model.
-- ============================================================================

create or replace function public.has_crm_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and suites @> '[{"key":"crm"}]'::jsonb
    );
$$;
grant execute on function public.has_crm_suite() to authenticated;

-- ---- companies ---------------------------------------------------------------
create table if not exists public.crm_companies (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id),
  name       text not null,
  industry   text not null default '',
  phone      text not null default '',
  email      text not null default '',
  website    text not null default '',
  address    text not null default '',
  notes      text not null default '',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.crm_companies enable row level security;

drop policy if exists "crm_companies_all" on public.crm_companies;
create policy "crm_companies_all" on public.crm_companies for all using (
  public.same_org(org_id) and public.has_crm_suite()
) with check (
  public.same_org(org_id) and public.has_crm_suite()
);

-- ---- contacts -----------------------------------------------------------------
create table if not exists public.crm_contacts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id),
  company_id uuid references public.crm_companies(id) on delete set null,
  name       text not null,
  job_title  text not null default '',
  email      text not null default '',
  phone      text not null default '',
  whatsapp   text not null default '',
  notes      text not null default '',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.crm_contacts enable row level security;

drop policy if exists "crm_contacts_all" on public.crm_contacts;
create policy "crm_contacts_all" on public.crm_contacts for all using (
  public.same_org(org_id) and public.has_crm_suite()
) with check (
  public.same_org(org_id) and public.has_crm_suite()
);

-- ---- activity log ---------------------------------------------------------------
create table if not exists public.crm_activities (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id),
  contact_id  uuid references public.crm_contacts(id) on delete cascade,
  company_id  uuid references public.crm_companies(id) on delete cascade,
  type        text not null default 'note' check (type in ('call','whatsapp','email','meeting','note')),
  notes       text not null default '',
  occurred_at timestamptz not null default now(),
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  constraint crm_activities_has_subject check (contact_id is not null or company_id is not null)
);

alter table public.crm_activities enable row level security;

drop policy if exists "crm_activities_all" on public.crm_activities;
create policy "crm_activities_all" on public.crm_activities for all using (
  public.same_org(org_id) and public.has_crm_suite()
) with check (
  public.same_org(org_id) and public.has_crm_suite()
);

create index if not exists crm_contacts_company_idx  on public.crm_contacts(company_id);
create index if not exists crm_activities_contact_idx on public.crm_activities(contact_id);
create index if not exists crm_activities_company_idx on public.crm_activities(company_id);

-- ---- Phase 2 whitelist: crm is safe from birth --------------------------------
create or replace function public.enforce_phase1_suite_scope() returns trigger
language plpgsql as $$
declare
  safe_suites text[] := array['hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm'];
begin
  if new.org_id <> '00000000-0000-0000-0000-000000000001' then
    select coalesce(jsonb_agg(g), '[]'::jsonb) into new.suites
    from jsonb_array_elements(new.suites) g
    where g->>'key' = any(safe_suites);
  end if;
  return new;
end;
$$;
