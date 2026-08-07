-- ============================================================================
-- platform_delete_org(): the COMPLETE org purge. Idempotent.
--
-- Deleting an org failed on paye_bands — the delete action hand-listed three
-- tables while every org carries seeded rows across dozens (PAYE bands,
-- deduction rates, leave types, departments, settings…), and the catalog
-- grows weekly. Hand-lists rot. This walks information_schema for EVERY
-- public base table with an org_id column and deletes in passes until a pass
-- deletes nothing (FK ordering resolves itself), then removes the org row.
-- The same recipe that cleaned the probe orgs by hand, made permanent.
--
-- Auth users are NOT touched here — GoTrue's admin API owns those (raw SQL
-- deletes on auth.users are exactly what left the dangling identity that
-- poisoned signups). The caller deletes members via the API afterwards.
-- ============================================================================

create or replace function public.platform_delete_org(p_org uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  t record;
  n integer;
  pass_total integer;
  total integer := 0;
  pass integer;
begin
  if p_org = '00000000-0000-0000-0000-000000000001' then
    raise exception 'Refusing to delete the founding organization.';
  end if;
  if not exists (select 1 from public.organizations where id = p_org) then
    return 0;
  end if;

  for pass in 1..6 loop
    pass_total := 0;
    for t in
      select c.table_name
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_name = c.table_name and tb.table_schema = 'public'
      where c.table_schema = 'public' and c.column_name = 'org_id'
        and tb.table_type = 'BASE TABLE' and c.table_name <> 'organizations'
    loop
      begin
        execute format('delete from public.%I where org_id = $1', t.table_name) using p_org;
        get diagnostics n = row_count;
        pass_total := pass_total + n;
      exception when others then
        null;  -- FK ordering: a later pass gets it once its dependents are gone
      end;
    end loop;
    total := total + pass_total;
    exit when pass_total = 0;
  end loop;

  delete from public.organizations where id = p_org;
  return total;
end; $$;

revoke execute on function public.platform_delete_org(uuid) from authenticated, anon, public;
grant execute on function public.platform_delete_org(uuid) to service_role;
