-- ============================================================================
-- CRM deals pipeline + activity follow-ups.
-- ============================================================================
create table if not exists public.crm_deals (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  title          text not null,
  contact_id     uuid references public.crm_contacts(id) on delete set null,
  company_id     uuid references public.crm_companies(id) on delete set null,
  value_naira    numeric not null default 0,
  stage          text not null default 'lead' check (stage in ('lead','qualified','proposal','won','lost')),
  expected_close date,
  notes          text not null default '',
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.crm_deals enable row level security;
drop policy if exists "crm_deals_all" on public.crm_deals;
create policy "crm_deals_all" on public.crm_deals for all using (
  public.same_org(org_id) and public.has_crm_suite()
) with check (
  public.same_org(org_id) and public.has_crm_suite()
);

-- Follow-up date on activities — "call them back Tuesday" finally has a home.
alter table public.crm_activities add column if not exists follow_up_at timestamptz;
