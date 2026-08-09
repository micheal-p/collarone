-- Disciplinary cases: keep the history, not just the latest state.
--
-- disciplinary_cases stores only where a case ended up — status,
-- resolution_notes, and (from the query/response work) the employee's reply.
-- Every change overwrites the last one, and PATCH /hr/cases lets any HR
-- manager rewrite any field. So one manager can change another's recorded
-- outcome, or soften a warning after the fact, and nothing anywhere shows it
-- happened.
--
-- That matters more here than in any other table in the product. The whole
-- reason Collarone walks a case through query -> written response -> outcome
-- is that the sequence is defensible if the dismissal is ever challenged at
-- the National Industrial Court. A record that can be silently edited is not
-- evidence; it is a claim. The trail is the feature.
--
-- Append-only by construction: no update or delete policy, and the rows are
-- written by a trigger rather than by anything a user can call.

create table if not exists public.disciplinary_case_events (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  case_id      uuid not null references public.disciplinary_cases(id) on delete cascade,
  actor_id     uuid references public.profiles(id),
  field        text not null,
  old_value    text,
  new_value    text,
  occurred_at  timestamptz not null default now()
);
create index if not exists disciplinary_case_events_case_idx
  on public.disciplinary_case_events (case_id, occurred_at);

alter table public.disciplinary_case_events enable row level security;

-- Readable by whoever can already read the case. NO write policy at all: the
-- trigger below is SECURITY DEFINER and is the only writer, so the trail
-- cannot be edited or deleted by anyone through the API.
drop policy if exists disciplinary_case_events_select on public.disciplinary_case_events;
create policy disciplinary_case_events_select on public.disciplinary_case_events for select
  using (
    public.same_org(org_id)
    and exists (
      select 1 from public.disciplinary_cases c
      where c.id = case_id
        and (public.is_super_admin() or public.is_hr_manager() or c.employee_id = auth.uid())
    )
  );

create or replace function public.log_disciplinary_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := coalesce(new.org_id, old.org_id);
  -- Only the fields that carry meaning in a hearing. Timestamps move on their
  -- own and would bury the changes that matter.
  f text;
  fields text[] := array['status', 'category', 'description', 'resolution_notes'];
  old_v text; new_v text;
begin
  if tg_op = 'INSERT' then
    insert into public.disciplinary_case_events (org_id, case_id, actor_id, field, old_value, new_value)
    values (v_org, new.id, auth.uid(), 'opened', null, new.category);
    return new;
  end if;

  foreach f in array fields loop
    execute format('select ($1).%I::text, ($2).%I::text', f, f)
      into old_v, new_v using old, new;
    if old_v is distinct from new_v then
      insert into public.disciplinary_case_events (org_id, case_id, actor_id, field, old_value, new_value)
      values (v_org, new.id, auth.uid(), f, old_v, new_v);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_log_disciplinary_change on public.disciplinary_cases;
create trigger trg_log_disciplinary_change
  after insert or update on public.disciplinary_cases
  for each row execute function public.log_disciplinary_change();

revoke execute on function public.log_disciplinary_change() from public, anon, authenticated;
