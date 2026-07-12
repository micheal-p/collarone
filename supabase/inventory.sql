-- ============================================================================
-- Collarone — Inventory suite (Stage 6 catalog item, built early)
-- Run after procurement.sql. Idempotent. Native multi-tenant from day one.
--
-- Multi-warehouse-across-states per the Nigeria angle (a company can have
-- stock sitting in more than one state) — stock is tracked per
-- (item, warehouse) pair, not a single global quantity per item.
-- ============================================================================

create or replace function public.has_inventory_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"inventory"}]'::jsonb);
$$;
grant execute on function public.has_inventory_suite() to authenticated;

create or replace function public.is_inventory_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"inventory","role":"manager"}]'::jsonb);
$$;
grant execute on function public.is_inventory_manager() to authenticated;

create table if not exists public.warehouses (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id),
  name       text not null,
  location   text not null default '',
  active     boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.warehouses enable row level security;
drop policy if exists "warehouses_select" on public.warehouses;
create policy "warehouses_select" on public.warehouses for select using (
  public.same_org(org_id) and public.has_inventory_suite()
);
drop policy if exists "warehouses_write" on public.warehouses;
create policy "warehouses_write" on public.warehouses for all using (
  public.same_org(org_id) and public.is_inventory_manager()
) with check (
  public.same_org(org_id) and public.is_inventory_manager()
);

create table if not exists public.stock_items (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  sku            text not null,
  name           text not null,
  unit           text not null default 'unit',
  category       text not null default '',
  reorder_level  numeric not null default 0,
  notes          text not null default '',
  created_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  unique (org_id, sku)
);

alter table public.stock_items enable row level security;
drop policy if exists "stock_items_select" on public.stock_items;
create policy "stock_items_select" on public.stock_items for select using (
  public.same_org(org_id) and public.has_inventory_suite()
);
drop policy if exists "stock_items_write" on public.stock_items;
create policy "stock_items_write" on public.stock_items for all using (
  public.same_org(org_id) and public.is_inventory_manager()
) with check (
  public.same_org(org_id) and public.is_inventory_manager()
);

create table if not exists public.stock_levels (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id),
  item_id      uuid not null references public.stock_items(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  quantity     numeric not null default 0,
  unique (item_id, warehouse_id)
);

alter table public.stock_levels enable row level security;
drop policy if exists "stock_levels_select" on public.stock_levels;
create policy "stock_levels_select" on public.stock_levels for select using (
  public.same_org(org_id) and public.has_inventory_suite()
);
drop policy if exists "stock_levels_write" on public.stock_levels;
create policy "stock_levels_write" on public.stock_levels for all using (
  public.same_org(org_id) and public.is_inventory_manager()
) with check (
  public.same_org(org_id) and public.is_inventory_manager()
);

create table if not exists public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id),
  item_id         uuid not null references public.stock_items(id) on delete cascade,
  warehouse_id    uuid not null references public.warehouses(id),
  to_warehouse_id uuid references public.warehouses(id),
  type            text not null check (type in ('in','out','adjustment','transfer')),
  quantity        numeric not null,
  reference       text not null default '',
  notes           text not null default '',
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now()
);

alter table public.stock_movements enable row level security;
drop policy if exists "stock_movements_select" on public.stock_movements;
create policy "stock_movements_select" on public.stock_movements for select using (
  public.same_org(org_id) and public.has_inventory_suite()
);
drop policy if exists "stock_movements_insert" on public.stock_movements;
create policy "stock_movements_insert" on public.stock_movements for insert with check (
  public.same_org(org_id) and public.is_inventory_manager()
);

-- Atomic: records the movement AND updates stock_levels in one transaction.
create or replace function public.record_stock_movement(
  p_item_id uuid, p_warehouse_id uuid, p_type text, p_quantity numeric,
  p_to_warehouse_id uuid default null, p_reference text default '', p_notes text default ''
)
returns public.stock_movements language plpgsql security definer set search_path = public as $$
declare
  row public.stock_movements;
  caller_org uuid;
  delta numeric;
begin
  if not public.is_inventory_manager() then raise exception 'Not authorised to record stock movements'; end if;
  if p_quantity <= 0 then raise exception 'Quantity must be positive'; end if;
  caller_org := public.my_org_id();

  if not exists (select 1 from public.stock_items where id = p_item_id and org_id = caller_org) then
    raise exception 'Unknown item';
  end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse_id and org_id = caller_org) then
    raise exception 'Unknown warehouse';
  end if;

  delta := case when p_type in ('in') then p_quantity when p_type in ('out','transfer') then -p_quantity else p_quantity end;

  insert into public.stock_levels (org_id, item_id, warehouse_id, quantity)
  values (caller_org, p_item_id, p_warehouse_id, delta)
  on conflict (item_id, warehouse_id) do update set quantity = public.stock_levels.quantity + excluded.quantity;

  if p_type = 'transfer' then
    if p_to_warehouse_id is null then raise exception 'Destination warehouse is required for a transfer'; end if;
    insert into public.stock_levels (org_id, item_id, warehouse_id, quantity)
    values (caller_org, p_item_id, p_to_warehouse_id, p_quantity)
    on conflict (item_id, warehouse_id) do update set quantity = public.stock_levels.quantity + excluded.quantity;
  end if;

  insert into public.stock_movements (org_id, item_id, warehouse_id, to_warehouse_id, type, quantity, reference, notes, created_by)
  values (caller_org, p_item_id, p_warehouse_id, p_to_warehouse_id, p_type, p_quantity, p_reference, p_notes, auth.uid())
  returning * into row;

  return row;
end;
$$;
grant execute on function public.record_stock_movement(uuid, uuid, text, numeric, uuid, text, text) to authenticated;

-- ---- Phase 2 whitelist --------------------------------------------------------
create or replace function public.enforce_phase1_suite_scope() returns trigger
language plpgsql as $$
declare
  safe_suites text[] := array['hr', 'leave', 'tasks', 'visitors', 'payroll', 'crm', 'attendance', 'benefits', 'it-assets', 'procurement', 'inventory'];
begin
  if new.org_id <> '00000000-0000-0000-0000-000000000001' then
    select coalesce(jsonb_agg(g), '[]'::jsonb) into new.suites
    from jsonb_array_elements(new.suites) g
    where g->>'key' = any(safe_suites);
  end if;
  return new;
end;
$$;
