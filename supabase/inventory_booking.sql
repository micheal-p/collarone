-- ============================================================================
-- Collarone — Inventory "bookings" = stock reservations.
-- Run after inventory.sql. Idempotent. Native multi-tenant from day one.
--
-- Practical use case: a customer or order needs specific stock held before
-- it physically leaves the warehouse (a phone reserved for a walk-in
-- customer picking it up tomorrow, a bulk order awaiting a deposit). A
-- reservation earmarks quantity without moving it — on-hand stays the same,
-- but "available to sell" drops until the reservation is fulfilled (which
-- records a real stock_movement 'out') or released (freed back up).
-- ============================================================================

create table if not exists public.stock_reservations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id),
  item_id      uuid not null references public.stock_items(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id),
  quantity     numeric not null check (quantity > 0),
  reference    text not null default '',   -- customer/order this is being held for
  notes        text not null default '',
  hold_until   date,                       -- when the hold expires if not actioned
  status       text not null default 'held' check (status in ('held','fulfilled','released','expired')),
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);

create index if not exists stock_reservations_org_idx on public.stock_reservations (org_id, status, hold_until);

alter table public.stock_reservations enable row level security;
drop policy if exists "stock_reservations_select" on public.stock_reservations;
create policy "stock_reservations_select" on public.stock_reservations for select using (
  public.same_org(org_id) and public.has_inventory_suite()
);
-- writes only through the RPCs below (they also touch stock_levels bookkeeping)

-- How much of an item is actually free to promise to a new customer:
-- on-hand minus everything currently held.
create or replace function public.stock_available(p_item_id uuid, p_warehouse_id uuid)
returns numeric language sql security definer stable set search_path = public as $$
  select coalesce((select quantity from public.stock_levels where item_id = p_item_id and warehouse_id = p_warehouse_id), 0)
       - coalesce((select sum(quantity) from public.stock_reservations
                   where item_id = p_item_id and warehouse_id = p_warehouse_id and status = 'held'), 0);
$$;
grant execute on function public.stock_available(uuid, uuid) to authenticated;

create or replace function public.reserve_stock(
  p_item_id uuid, p_warehouse_id uuid, p_quantity numeric,
  p_reference text default '', p_notes text default '', p_hold_until date default null
) returns public.stock_reservations language plpgsql security definer set search_path = public as $$
declare
  caller_org uuid;
  row public.stock_reservations;
begin
  if not public.is_inventory_manager() then raise exception 'Not authorised to reserve stock'; end if;
  if p_quantity <= 0 then raise exception 'Quantity must be positive'; end if;
  caller_org := public.my_org_id();

  if not exists (select 1 from public.stock_items where id = p_item_id and org_id = caller_org) then
    raise exception 'Unknown item';
  end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse_id and org_id = caller_org) then
    raise exception 'Unknown warehouse';
  end if;
  if public.stock_available(p_item_id, p_warehouse_id) < p_quantity then
    raise exception 'Not enough available stock to reserve — some of it is already held';
  end if;

  insert into public.stock_reservations (org_id, item_id, warehouse_id, quantity, reference, notes, hold_until, created_by)
  values (caller_org, p_item_id, p_warehouse_id, p_quantity, coalesce(trim(p_reference), ''), coalesce(trim(p_notes), ''), p_hold_until, auth.uid())
  returning * into row;

  return row;
end;
$$;
grant execute on function public.reserve_stock(uuid, uuid, numeric, text, text, date) to authenticated;

-- Fulfilling a reservation means the goods actually leave — records a real
-- 'out' stock_movement (reusing the same atomic bookkeeping as any other
-- stock-out) and closes the reservation.
create or replace function public.fulfill_reservation(p_id uuid)
returns public.stock_reservations language plpgsql security definer set search_path = public as $$
declare
  caller_org uuid;
  res public.stock_reservations;
begin
  if not public.is_inventory_manager() then raise exception 'Not authorised to action reservations'; end if;
  caller_org := public.my_org_id();

  select * into res from public.stock_reservations where id = p_id and org_id = caller_org for update;
  if res.id is null then raise exception 'Reservation not found'; end if;
  if res.status <> 'held' then raise exception 'This reservation has already been actioned'; end if;

  perform public.record_stock_movement(res.item_id, res.warehouse_id, 'out', res.quantity, null, res.reference, 'Fulfilled reservation');

  update public.stock_reservations set status = 'fulfilled', decided_at = now() where id = p_id
  returning * into res;
  return res;
end;
$$;
grant execute on function public.fulfill_reservation(uuid) to authenticated;

create or replace function public.release_reservation(p_id uuid)
returns public.stock_reservations language plpgsql security definer set search_path = public as $$
declare
  caller_org uuid;
  res public.stock_reservations;
begin
  if not public.is_inventory_manager() then raise exception 'Not authorised to action reservations'; end if;
  caller_org := public.my_org_id();

  update public.stock_reservations set status = 'released', decided_at = now()
  where id = p_id and org_id = caller_org and status = 'held'
  returning * into res;
  if res.id is null then raise exception 'Reservation not found or already actioned'; end if;
  return res;
end;
$$;
grant execute on function public.release_reservation(uuid) to authenticated;

-- ---- Phase 2 whitelist --------------------------------------------------------
-- Canonical home for this trigger moves to automation.sql (run last) — it
-- carries forward the full superset list, unchanged by this file.
