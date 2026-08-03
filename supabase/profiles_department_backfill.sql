-- ============================================================================
-- Give every profile a real department_id. Idempotent, safe to re-run.
--
-- profiles carries BOTH a free-text `department` and a `department_id` FK. The
-- id is canonical and survives a rename; the text does not, and nothing rewrites
-- it when a department is renamed in Admin › Departments. Team chat's department
-- rooms and the bulk-import access templates both fall back to matching on that
-- text when the id is missing — so a rename silently cuts people out of their
-- own room, history included.
--
-- Verified 2026-08-02: NOT ONE profile in production had a department_id set.
-- Every department feature was running on the fragile path.
--
-- Matches on trimmed, case-insensitive name within the same org, and only fills
-- rows that have no id yet — it never overwrites an id someone set deliberately.
-- ============================================================================

update public.profiles p
   set department_id = d.id
  from public.departments d
 where p.department_id is null
   and d.org_id = p.org_id
   and d.active
   and nullif(trim(p.department), '') is not null
   and lower(trim(d.name)) = lower(trim(p.department));

-- What's left over: staff whose department text matches no department in their
-- org. These need either the department creating or the person reassigning —
-- they are the rows that will keep using the fallback path.
do $$
declare v_orphans int;
begin
  select count(*) into v_orphans
    from public.profiles p
   where p.department_id is null
     and nullif(trim(p.department), '') is not null;
  if v_orphans > 0 then
    raise notice 'profiles with a department name that matches no department row: %', v_orphans;
  end if;
end $$;

-- Keep new rows honest: admin.js sets department_id on single create and (as of
-- this change) on bulk import too. This trigger is the backstop for any path
-- that forgets — a direct API write, a future importer, a fix-up script.
create or replace function public.fill_profile_department_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.department_id is null and nullif(trim(coalesce(new.department, '')), '') is not null then
    select d.id into new.department_id
      from public.departments d
     where d.org_id = new.org_id and d.active
       and lower(trim(d.name)) = lower(trim(new.department))
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_fill_department_id on public.profiles;
create trigger profiles_fill_department_id
  before insert or update of department, department_id on public.profiles
  for each row execute function public.fill_profile_department_id();
