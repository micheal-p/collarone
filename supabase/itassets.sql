-- ============================================================================
-- Collarone — IT Assets suite (Stage 6 catalog item, built early)
-- Run after benefits.sql. Idempotent. Native multi-tenant from day one.
-- ============================================================================

create or replace function public.has_itassets_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"it-assets"}]'::jsonb);
$$;
grant execute on function public.has_itassets_suite() to authenticated;

create or replace function public.is_itassets_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"it-assets","role":"manager"}]'::jsonb);
$$;
grant execute on function public.is_itassets_manager() to authenticated;

create table if not exists public.it_assets (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  asset_tag      text not null,
  name           text not null,
  category       text not null default 'other' check (category in ('laptop','monitor','phone','peripheral','other')),
  serial_number  text not null default '',
  purchase_date  date,
  purchase_cost  numeric,
  status         text not null default 'spare' check (status in ('in_use','spare','repair','retired')),
  assigned_to    uuid references public.profiles(id) on delete set null,
  notes          text not null default '',
  created_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  unique (org_id, asset_tag)
);

alter table public.it_assets enable row level security;

drop policy if exists "it_assets_select" on public.it_assets;
create policy "it_assets_select" on public.it_assets for select using (
  public.same_org(org_id) and (public.is_itassets_manager() or assigned_to = auth.uid())
);
drop policy if exists "it_assets_write" on public.it_assets;
create policy "it_assets_write" on public.it_assets for all using (
  public.same_org(org_id) and public.is_itassets_manager()
) with check (
  public.same_org(org_id) and public.is_itassets_manager()
);

create table if not exists public.it_asset_history (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id),
  asset_id   uuid not null references public.it_assets(id) on delete cascade,
  action     text not null check (action in ('assigned','returned','repaired','retired','note')),
  employee_id uuid references public.profiles(id) on delete set null,
  notes      text not null default '',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.it_asset_history enable row level security;

drop policy if exists "it_asset_history_select" on public.it_asset_history;
create policy "it_asset_history_select" on public.it_asset_history for select using (
  public.same_org(org_id) and (
    public.is_itassets_manager()
    or exists (select 1 from public.it_assets a where a.id = asset_id and a.assigned_to = auth.uid())
  )
);
drop policy if exists "it_asset_history_write" on public.it_asset_history;
create policy "it_asset_history_write" on public.it_asset_history for insert with check (
  public.same_org(org_id) and public.is_itassets_manager()
);

-- ---- Phase 2 whitelist --------------------------------------------------------
create or replace function public.enforce_phase1_suite_scope() returns trigger
language plpgsql as $$
declare
  safe_suites text[] := array['hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm', 'attendance', 'benefits', 'it-assets'];
begin
  if new.org_id <> '00000000-0000-0000-0000-000000000001' then
    select coalesce(jsonb_agg(g), '[]'::jsonb) into new.suites
    from jsonb_array_elements(new.suites) g
    where g->>'key' = any(safe_suites);
  end if;
  return new;
end;
$$;
