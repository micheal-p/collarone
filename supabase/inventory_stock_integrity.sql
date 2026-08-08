-- Stock: stop the count going negative, and let an adjustment adjust DOWN.
--
-- Two faults in record_stock_movement (inventory.sql:139).
--
-- 1. NO ON-HAND CHECK. An 'out' movement subtracts whatever it is given with
--    no check that the stock exists, so the level goes negative and stays
--    there. Negative stock is not a display bug — it silently corrupts every
--    number downstream: reorder alerts stop firing because the level is below
--    zero rather than below the threshold, and any valuation built on
--    quantity × cost goes wrong in the same direction. It also hides the real
--    event, which is that someone shipped goods the system did not know about.
--
-- 2. 'adjustment' CAN ONLY ADD. The delta expression reads:
--        case when p_type in ('in') then p_quantity
--             when p_type in ('out','transfer') then -p_quantity
--             else p_quantity end
--    so 'adjustment' falls into the else branch and always increases the
--    count. The one movement type whose entire purpose is correcting a count
--    after a physical stock-take can only correct it upwards. A shop that
--    counts 8 on the shelf against 10 in the system has no way to say so.
--
-- The fix for (2) is a signed adjustment: the caller passes the delta they
-- mean, positive or negative. That changes the meaning of p_quantity for one
-- movement type only, so the positive-quantity guard now applies to the other
-- three and 'adjustment' gets its own rule (non-zero).

create or replace function public.record_stock_movement(
  p_item_id uuid, p_warehouse_id uuid, p_type text, p_quantity numeric,
  p_to_warehouse_id uuid default null, p_reference text default null, p_notes text default null
) returns public.stock_movements language plpgsql security definer set search_path = public as $$
declare
  row public.stock_movements;
  caller_org uuid;
  delta numeric;
  on_hand numeric;
  item_name text;
begin
  if not public.is_inventory_manager() then raise exception 'Not authorised to record stock movements'; end if;
  caller_org := public.my_org_id();

  -- An adjustment is signed: -2 means "we counted two fewer than the system
  -- thought". Everything else is a movement of a positive amount.
  if p_type = 'adjustment' then
    if p_quantity = 0 then raise exception 'An adjustment of zero changes nothing.'; end if;
  elsif p_quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;

  select name into item_name from public.stock_items where id = p_item_id and org_id = caller_org;
  if item_name is null then raise exception 'Unknown item'; end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse_id and org_id = caller_org) then
    raise exception 'Unknown warehouse';
  end if;

  delta := case
             when p_type = 'in' then p_quantity
             when p_type in ('out','transfer') then -p_quantity
             when p_type = 'adjustment' then p_quantity   -- already signed
           end;

  -- Refuse anything that would take the shelf below zero, and say what is
  -- actually there so the person can correct their entry rather than guess.
  if delta < 0 then
    select coalesce(quantity, 0) into on_hand from public.stock_levels
     where item_id = p_item_id and warehouse_id = p_warehouse_id;
    on_hand := coalesce(on_hand, 0);
    if on_hand + delta < 0 then
      raise exception 'Only % of "%" in stock at that location, so % cannot go out. Record a stock-take adjustment first if the shelf disagrees.',
        on_hand, item_name, abs(delta);
    end if;
  end if;

  insert into public.stock_levels (org_id, item_id, warehouse_id, quantity)
  values (caller_org, p_item_id, p_warehouse_id, delta)
  on conflict (item_id, warehouse_id) do update set quantity = public.stock_levels.quantity + excluded.quantity;

  if p_type = 'transfer' then
    if p_to_warehouse_id is null then raise exception 'Destination warehouse is required for a transfer'; end if;
    if not exists (select 1 from public.warehouses where id = p_to_warehouse_id and org_id = caller_org) then
      raise exception 'Unknown destination warehouse';
    end if;
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

-- Belt and braces: the ledger is the source of truth, but nothing should be
-- able to leave a negative level behind even by a direct write.
alter table public.stock_levels drop constraint if exists stock_levels_non_negative;
alter table public.stock_levels add constraint stock_levels_non_negative check (quantity >= 0) not valid;

-- `not valid` skips existing rows so the migration cannot fail on historical
-- data. Checked live on 2026-08-08: zero negative levels existed, so the
-- constraint was validated immediately. If a future replay finds negatives,
-- correct them and then run:
--   alter table public.stock_levels validate constraint stock_levels_non_negative;
do $$
begin
  if not exists (select 1 from public.stock_levels where quantity < 0) then
    execute 'alter table public.stock_levels validate constraint stock_levels_non_negative';
  else
    raise notice 'stock_levels has negative rows — constraint left NOT VALID until they are corrected';
  end if;
end $$;

-- Managers held a direct `for all` write on stock_levels, which lets a quantity
-- be PATCHed straight in with no movement recorded — bypassing the ledger that
-- makes the count explainable. Levels are a derived number; they are written by
-- record_stock_movement (SECURITY DEFINER) and by nothing else.
drop policy if exists stock_levels_write on public.stock_levels;
