-- ============================================================================
-- Collarone — MERGE: IT Assets folds into Inventory (operator decision,
-- 2026-07-22). One suite now covers stock, staff equipment AND company
-- assets — same custody paperwork (handover/return notes) across all three.
-- Idempotent.
--
-- What this does:
--   * every profile granted 'it-assets' gets 'inventory' instead (deduped;
--     if either grant was manager, the merged grant is manager)
--   * the it-assets TABLES and RPCs stay exactly as they are — the suite
--     tile/gating merges, the data doesn't move. has_itassets_suite() is
--     redefined to answer for the inventory grant, so every existing RLS
--     policy on assets keeps working unchanged.
-- ============================================================================

do $$
declare
  p record;
  new_suites jsonb;
  had_manager boolean;
begin
  for p in select id, suites from public.profiles where suites @> '[{"key":"it-assets"}]'::jsonb loop
    -- manager if EITHER the it-assets or the inventory grant was manager
    had_manager := p.suites @> '[{"key":"it-assets","role":"manager"}]'::jsonb
                or p.suites @> '[{"key":"inventory","role":"manager"}]'::jsonb;

    select coalesce(jsonb_agg(g), '[]'::jsonb) into new_suites
    from jsonb_array_elements(p.suites) g
    where g->>'key' not in ('it-assets', 'inventory');

    new_suites := new_suites || jsonb_build_array(
      jsonb_build_object('key', 'inventory', 'role', case when had_manager then 'manager' else 'member' end)
    );

    update public.profiles set suites = new_suites where id = p.id;
  end loop;
end;
$$;

-- The asset tables' RLS all check these two helpers — repoint them at the
-- merged suite so nothing else needs touching.
create or replace function public.has_itassets_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"inventory"}]'::jsonb);
$$;

create or replace function public.is_itassets_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"inventory","role":"manager"}]'::jsonb);
$$;
