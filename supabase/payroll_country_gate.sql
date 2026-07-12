-- ============================================================================
-- Collarone — Payroll runs Nigerian statutory deductions (PAYE, pension, NHF)
-- only. It isn't built for any other country's tax/pension regime, so it's
-- gated to organizations registered in Nigeria. The client (config/suites.js,
-- supabaseApi.js) already hides/blocks it for non-NG orgs — this trigger is
-- the authoritative backstop, same pattern as enforce_phase1_suite_scope().
-- ============================================================================

create or replace function public.enforce_payroll_country_scope()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  org_country text;
begin
  if new.suites is not null
     and exists (select 1 from jsonb_array_elements(new.suites) g where g->>'key' = 'payroll') then
    select country into org_country from public.organizations where id = new.org_id;
    if coalesce(org_country, 'NG') <> 'NG' then
      select coalesce(jsonb_agg(g), '[]'::jsonb) into new.suites
      from jsonb_array_elements(new.suites) g
      where g->>'key' <> 'payroll';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_country_scope on public.profiles;
create trigger payroll_country_scope
  before insert or update on public.profiles
  for each row execute function public.enforce_payroll_country_scope();
