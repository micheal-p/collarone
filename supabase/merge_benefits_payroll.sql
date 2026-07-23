-- ============================================================================
-- Collarone — MERGE: Benefits folds into Payroll (operator decision,
-- 2026-07-22). One suite now covers salaries AND what rides on them — HMO,
-- group life, pension/PFA, and org-defined custom benefits, switchable per
-- person (a contractor or intern simply has a benefit toggled off).
-- Same pattern as the it-assets → inventory merge. Idempotent.
--
--   * every profile granted 'benefits' gets 'payroll' instead (deduped;
--     manager if either grant was manager)
--   * benefits TABLES/RPCs stay exactly as they are — has_benefits_suite()
--     and is_benefits_manager() are repointed at the payroll grant, so every
--     existing RLS policy keeps working unchanged.
-- ============================================================================

do $$
declare
  p record;
  new_suites jsonb;
  had_manager boolean;
begin
  for p in select id, suites from public.profiles where suites @> '[{"key":"benefits"}]'::jsonb loop
    had_manager := p.suites @> '[{"key":"benefits","role":"manager"}]'::jsonb
                or p.suites @> '[{"key":"payroll","role":"manager"}]'::jsonb;

    select coalesce(jsonb_agg(g), '[]'::jsonb) into new_suites
    from jsonb_array_elements(p.suites) g
    where g->>'key' not in ('benefits', 'payroll');

    new_suites := new_suites || jsonb_build_array(
      jsonb_build_object('key', 'payroll', 'role', case when had_manager then 'manager' else 'member' end)
    );

    update public.profiles set suites = new_suites where id = p.id;
  end loop;
end;
$$;

create or replace function public.has_benefits_suite()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"payroll"}]'::jsonb);
$$;

create or replace function public.is_benefits_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_super_admin()
    or exists (select 1 from public.profiles where id = auth.uid() and suites @> '[{"key":"payroll","role":"manager"}]'::jsonb);
$$;
