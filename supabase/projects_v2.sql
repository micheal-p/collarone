-- ============================================================================
-- Collarone — Projects v2: subtasks, dependencies, per-project statuses,
-- task comments. Run after projects.sql, project_time.sql, org_events.sql.
-- Idempotent, and safe to run against a live database with real rows.
--
-- Four things land here:
--   1. project_tasks.parent_task_id            subtask trees
--   2. project_task_deps                       "B cannot start until A is done"
--   3. project_statuses                        per-project board columns
--   4. project_task_comments                   comments + a spine event
--
-- Backwards compatibility is the hard constraint. project_tasks.status stays
-- as a text mirror so every existing screen, query and report keeps working
-- while the UI migrates onto status_id.
-- ============================================================================

-- ============================================================================
-- 1. SUBTASKS
-- ============================================================================
-- on delete SET NULL, not cascade. Deleting a parent promotes its subtasks to
-- top level; it does not destroy them. They are real work, often assigned to
-- other people with time logged against them, and the only delete confirm in
-- the suite names a single task. A cascade here turns one careless click into
-- silent, unrecoverable loss of a whole branch.
alter table public.project_tasks
  add column if not exists parent_task_id uuid references public.project_tasks(id) on delete set null;

-- Re-point an existing cascade if this file was applied before the change.
do $$
begin
  if exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'project_tasks' and c.contype = 'f'
      and c.confdeltype = 'c'
      and pg_get_constraintdef(c.oid) like '%parent_task_id%'
  ) then
    execute (select 'alter table public.project_tasks drop constraint ' || quote_ident(c.conname)
             from pg_constraint c join pg_class t on t.oid = c.conrelid
             where t.relname = 'project_tasks' and c.contype = 'f'
               and pg_get_constraintdef(c.oid) like '%parent_task_id%' limit 1);
    alter table public.project_tasks
      add constraint project_tasks_parent_task_id_fkey
      foreign key (parent_task_id) references public.project_tasks(id) on delete set null;
  end if;
end $$;

create index if not exists ptask_parent_idx
  on public.project_tasks (parent_task_id) where parent_task_id is not null;

-- SECURITY DEFINER on a validation trigger looks alarming, so: this function
-- returns no data and grants no access, it only raises. It has to be definer
-- because the ancestor walk must see the WHOLE chain. Under RLS a member who
-- cannot select one task in the middle of the chain would walk a chain with a
-- hole in it and the cycle would slip through. The write itself is still
-- gated by project_tasks' own RLS, and the org check below means a caller can
-- never learn anything about another org's rows from the error message.
create or replace function public.project_tasks_parent_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p record;
  v_cycle boolean;
begin
  if new.parent_task_id is null then return new; end if;
  if new.parent_task_id = new.id then
    raise exception 'A task cannot be its own subtask.';
  end if;

  select id, project_id, org_id into p
  from public.project_tasks where id = new.parent_task_id;

  if p.id is null or p.org_id <> new.org_id then
    raise exception 'Parent task not found.';
  end if;
  if p.project_id <> new.project_id then
    raise exception 'A subtask must sit in the same project as its parent.';
  end if;

  -- Walk UP from the proposed parent, one parent_task_id hop at a time. If the
  -- row being saved shows up anywhere in its own ancestry the tree is a loop,
  -- and the component that renders it would recurse until the tab dies. The
  -- depth ceiling is belt and braces: it stops this query hanging even if bad
  -- data somehow got in before this trigger existed.
  with recursive ancestors as (
    select t.id, t.parent_task_id, 1 as depth
      from public.project_tasks t
     where t.id = new.parent_task_id
    union all
    select t.id, t.parent_task_id, a.depth + 1
      from public.project_tasks t
      join ancestors a on t.id = a.parent_task_id
     where a.depth < 100
  )
  select exists (select 1 from ancestors where id = new.id) into v_cycle;

  if v_cycle then
    raise exception 'That would make a loop: the task is already above this one in the subtask tree.';
  end if;

  return new;
end;
$$;

drop trigger if exists project_tasks_parent_guard on public.project_tasks;
create trigger project_tasks_parent_guard
  before insert or update of parent_task_id, project_id on public.project_tasks
  for each row execute function public.project_tasks_parent_guard();

-- "Is the caller the assignee or the creator of THIS task." Used by the
-- policies in sections 2 and 4.
--
-- It has to be definer, and that is the whole point of the bug being fixed
-- here. Written inline as `exists (select 1 from project_tasks t where ...)`
-- the subquery is itself filtered by project_tasks' own RLS, and that policy
-- never mentions created_by. So the person who raised a task and handed it to
-- somebody else reads zero rows from the subquery and is locked out of the
-- conversation on their own task, which is precisely the fault
-- tasks_recurring_comments.sql set out to fix and, over in the tasks suite,
-- still only half fixes.
--
-- Definer is safe here because the function answers one narrow question about
-- one specific row and pins it to the caller: auth.uid() and my_org_id() are
-- both baked in, so it cannot be talked into reporting on anybody else.
create or replace function public.is_on_project_task(p_task uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.project_tasks t
     where t.id = p_task
       and t.org_id = public.my_org_id()
       and (t.assigned_to = auth.uid() or t.created_by = auth.uid())
  );
$$;
grant execute on function public.is_on_project_task(uuid) to authenticated;

-- ============================================================================
-- 2. DEPENDENCIES
--    One row = "task_id cannot start until depends_on_id is done".
-- ============================================================================
create table if not exists public.project_task_deps (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  project_id    uuid not null references public.projects(id) on delete cascade,
  task_id       uuid not null references public.project_tasks(id) on delete cascade,
  depends_on_id uuid not null references public.project_tasks(id) on delete cascade,
  created_by    uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  unique (task_id, depends_on_id),
  check (task_id <> depends_on_id)
);
create index if not exists ptdeps_project_idx  on public.project_task_deps (project_id);
create index if not exists ptdeps_task_idx     on public.project_task_deps (task_id);
create index if not exists ptdeps_prereq_idx   on public.project_task_deps (depends_on_id);

-- Definer for the same reason as the subtask guard: a partial view of the
-- dependency graph is worse than none, a cycle check that cannot see every
-- edge is not a cycle check. Raises only, returns nothing.
create or replace function public.project_task_deps_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a record;   -- the blocked task
  b record;   -- the prerequisite
  v_cycle boolean;
begin
  select id, project_id, org_id into a from public.project_tasks where id = new.task_id;
  select id, project_id, org_id into b from public.project_tasks where id = new.depends_on_id;

  if a.id is null or b.id is null then
    raise exception 'Task not found.';
  end if;
  if a.org_id <> b.org_id then
    raise exception 'Task not found.';
  end if;
  if a.project_id <> b.project_id then
    raise exception 'Both tasks must be in the same project.';
  end if;

  -- Derive rather than trust: the client never gets to say which project or
  -- org this edge belongs to, so it cannot staple an edge onto someone else's
  -- project. RLS WITH CHECK runs after BEFORE triggers, so same_org(org_id)
  -- still gets the final say on the values set here.
  new.project_id := a.project_id;
  new.org_id     := a.org_id;
  -- and the author, so an edge can't be attributed to somebody else. coalesce
  -- because auth.uid() is NULL on a service-role or maintenance write, and
  -- created_by is NOT NULL: overriding unconditionally makes those fail.
  new.created_by := coalesce(auth.uid(), new.created_by);

  -- CYCLE CHECK.
  -- The edge being added is: task_id waits for depends_on_id.
  -- Adding it closes a loop precisely when the prerequisite already waits,
  -- directly or through any number of hops, on the task we are about to
  -- block. So start at the prerequisite and walk the "waits for" edges
  -- forwards: level 0 is everything the prerequisite waits on, level 1 is
  -- everything those wait on, and so on. If the blocked task appears anywhere
  -- in that closure, the new edge would complete a ring. A ring has no
  -- topological order, which means a Gantt chart has no left-to-right layout
  -- and the planner would loop forever trying to find a start date.
  -- The depth ceiling stops this query hanging on data that predates the
  -- trigger; a real project never nests dependencies 200 deep.
  with recursive prereqs as (
    select d.depends_on_id as id, 1 as depth
      from public.project_task_deps d
     where d.task_id = new.depends_on_id
    union all
    select d.depends_on_id, pr.depth + 1
      from public.project_task_deps d
      join prereqs pr on d.task_id = pr.id
     where pr.depth < 200
  )
  select exists (select 1 from prereqs where id = new.task_id) into v_cycle;

  if v_cycle then
    raise exception 'That would make a circular dependency: the task you picked already waits on this one.';
  end if;

  return new;
end;
$$;

drop trigger if exists project_task_deps_guard on public.project_task_deps;
create trigger project_task_deps_guard
  before insert or update on public.project_task_deps
  for each row execute function public.project_task_deps_guard();

alter table public.project_task_deps enable row level security;

-- Whoever the task belongs to gets to see what is holding it up, member or
-- not. "You cannot start yet" is useless without "because of that."
drop policy if exists project_task_deps_select on public.project_task_deps;
create policy project_task_deps_select on public.project_task_deps for select using (
  public.same_org(org_id) and (
    public.is_projects_manager()
    or public.is_project_member(project_id)
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
    or public.is_on_project_task(task_id)
    or public.is_on_project_task(depends_on_id)
  )
);

drop policy if exists project_task_deps_write on public.project_task_deps;
create policy project_task_deps_write on public.project_task_deps for all using (
  public.same_org(org_id) and (
    public.is_projects_manager()
    or public.is_project_member(project_id)
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  )
) with check (
  public.same_org(org_id) and public.has_projects_suite() and (
    public.is_projects_manager()
    or public.is_project_member(project_id)
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  )
);

-- ============================================================================
-- 3. PER-PROJECT STATUSES
--    project_tasks.status was a CHECK of exactly four values, which is why
--    every project looked identical. Statuses become rows, per project.
-- ============================================================================
create table if not exists public.project_statuses (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  slug       text not null,
  colour     text not null default '#605e5c' check (colour ~ '^#[0-9a-fA-F]{6}$'),
  position   int  not null default 0,
  is_done    boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, slug)
);
create index if not exists pstatus_project_idx on public.project_statuses (project_id, position);

-- Stable machine key from a display name, so the legacy text mirror below
-- stays readable ("In review" -> in_review) instead of becoming a uuid.
create or replace function public.project_status_slug(p_name text)
returns text language sql immutable as $$
  select coalesce(nullif(trim(both '_' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '_', 'g')), ''), 'status');
$$;
grant execute on function public.project_status_slug(text) to authenticated;

-- NO ACTION, not RESTRICT, and the difference matters: deleting a project
-- cascades to project_statuses and project_tasks in an order Postgres does not
-- promise. RESTRICT is checked the instant the status row goes, so it would
-- reject a project deletion whose tasks are about to disappear anyway. NO
-- ACTION defers the check to the end of the statement, by which point both
-- sides are gone.
alter table public.project_tasks
  add column if not exists status_id uuid references public.project_statuses(id);
create index if not exists ptask_status_idx on public.project_tasks (status_id);

-- The CHECK is what froze the four columns in place. Dropped, but the column
-- stays: everything already shipped reads project_tasks.status, and the
-- trigger below keeps it truthful.
alter table public.project_tasks drop constraint if exists project_tasks_status_check;

-- ---- seed: every project gets the old four, so nothing changes on day one --
insert into public.project_statuses (org_id, project_id, name, slug, colour, position, is_done)
select p.org_id, p.id, d.name, d.slug, d.colour, d.position, d.is_done
from public.projects p
cross join (values
  ('To do',       'todo',        '#605e5c', 0, false),
  ('In progress', 'in_progress', '#194b8f', 1, false),
  ('In review',   'in_review',   '#7a5200', 2, false),
  ('Done',        'done',        '#1a6a1a', 3, true)
) as d(name, slug, colour, position, is_done)
where not exists (select 1 from public.project_statuses s where s.project_id = p.id)
on conflict (project_id, slug) do nothing;

-- ---- migrate: point every existing task at its project's matching status ---
update public.project_tasks t
set status_id = s.id
from public.project_statuses s
where s.project_id = t.project_id
  and s.slug = t.status
  and t.status_id is null;

-- Any task whose old status text has no match (hand-edited rows, data from
-- before the CHECK existed) lands in the project's first column rather than
-- vanishing off the board.
update public.project_tasks t
set status_id = (
  select s.id from public.project_statuses s
   where s.project_id = t.project_id
   order by s.position, s.name limit 1
)
where t.status_id is null;

-- New projects get the same four columns to start from. Definer so creating a
-- project can never fail on a policy technicality at the exact moment the
-- creator's membership row does not exist yet.
create or replace function public.seed_project_statuses()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_statuses (org_id, project_id, name, slug, colour, position, is_done)
  select new.org_id, new.id, d.name, d.slug, d.colour, d.position, d.is_done
  from (values
    ('To do',       'todo',        '#605e5c', 0, false),
    ('In progress', 'in_progress', '#194b8f', 1, false),
    ('In review',   'in_review',   '#7a5200', 2, false),
    ('Done',        'done',        '#1a6a1a', 3, true)
  ) as d(name, slug, colour, position, is_done)
  on conflict (project_id, slug) do nothing;
  return new;
end;
$$;
drop trigger if exists seed_project_statuses on public.projects;
create trigger seed_project_statuses
  after insert on public.projects
  for each row execute function public.seed_project_statuses();

-- ---- the compatibility bridge ---------------------------------------------
-- status_id is the truth; project_tasks.status is a mirror kept in step both
-- ways so old code that writes status='done' and old code that reads
-- status='done' both keep working untouched.
--
-- The mirror writes 'done' for ANY status flagged is_done, not that status's
-- own slug. Legacy overdue checks all read status <> 'done', so a project
-- whose finish column is called "Shipped" would otherwise show every finished
-- task as overdue forever.
create or replace function public.project_tasks_sync_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_target uuid;   -- the status the task should end up in
  s        record;
  cur      record; -- the status it is in right now
  mirror   text;
begin
  if tg_op = 'UPDATE'
     and new.status_id is not distinct from old.status_id
     and new.status is not distinct from old.status then
    return new;
  end if;

  -- Precedence: a write to status_id is the modern path and always wins. A
  -- write to the legacy text only resolves a column when status_id was left
  -- alone, which is exactly the shape of the old board's PATCH.
  if tg_op = 'UPDATE' and new.status_id is distinct from old.status_id then
    v_target := new.status_id;

  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    select * into cur from public.project_statuses where id = old.status_id;
    mirror := case when cur.id is null then null
                   when cur.is_done then 'done' else cur.slug end;
    if mirror is not distinct from new.status then
      -- The card has not moved, the mirror was only being restated: this is
      -- what happens when a status is renamed or its is_done flag flips.
      -- Without this branch the 'done' text would drag the task into whichever
      -- OTHER column happens to be flagged done, silently reshuffling a board
      -- nobody asked to reshuffle.
      v_target := old.status_id;
    else
      select id into v_target from public.project_statuses
       where project_id = new.project_id and slug = new.status;
      if v_target is null and new.status = 'done' then
        -- Legacy code says 'done' and means "the finish column", whatever
        -- this project decided to call it.
        select id into v_target from public.project_statuses
         where project_id = new.project_id and is_done
         order by position limit 1;
      end if;
    end if;

  elsif new.status_id is not null then
    v_target := new.status_id;

  else
    select id into v_target from public.project_statuses
     where project_id = new.project_id and slug = new.status;
  end if;

  -- Nothing resolved (a brand new task, or a status text this project has no
  -- column for): the first column, so a card is never invisible.
  if v_target is null then
    select id into v_target from public.project_statuses
     where project_id = new.project_id
     order by position, name limit 1;
  end if;
  if v_target is null then
    raise exception 'This project has no statuses.';
  end if;

  select * into s from public.project_statuses where id = v_target;
  if s.id is null or s.project_id <> new.project_id then
    raise exception 'That status does not belong to this project.';
  end if;

  new.status_id := s.id;
  new.status    := case when s.is_done then 'done' else s.slug end;
  return new;
end;
$$;

drop trigger if exists project_tasks_sync_status on public.project_tasks;
create trigger project_tasks_sync_status
  before insert or update of status, status_id, project_id on public.project_tasks
  for each row execute function public.project_tasks_sync_status();

-- A project always keeps at least one column, and deleting a column never
-- deletes the work sitting in it: the tasks slide to the next column along.
create or replace function public.project_statuses_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_fallback uuid;
begin
  -- The whole project is being deleted and this row is collateral: the project
  -- is already gone by the time its dependents cascade. Nothing to protect.
  if not exists (select 1 from public.projects where id = old.project_id) then
    return old;
  end if;

  select id into v_fallback from public.project_statuses
   where project_id = old.project_id and id <> old.id
   order by position, name limit 1;

  if v_fallback is null then
    raise exception 'A project needs at least one status.';
  end if;

  update public.project_tasks set status_id = v_fallback
   where status_id = old.id;
  return old;
end;
$$;
drop trigger if exists project_statuses_before_delete on public.project_statuses;
create trigger project_statuses_before_delete
  before delete on public.project_statuses
  for each row execute function public.project_statuses_before_delete();

-- Slug is derived, never supplied, so two columns named "In review" in the
-- same project collide on the unique index instead of silently both existing.
-- It is also frozen after creation: it is the machine key the legacy status
-- text mirrors, so renaming "In review" to "Checking" must not orphan every
-- task already sitting in that column.
create or replace function public.project_statuses_set_slug()
returns trigger language plpgsql as $$
begin
  if char_length(trim(coalesce(new.name, ''))) < 1 then
    raise exception 'A status needs a name.';
  end if;
  new.name := left(trim(new.name), 40);
  if tg_op <> 'INSERT' then
    new.slug := old.slug;
  elsif new.slug is null or trim(new.slug) = '' then
    new.slug := public.project_status_slug(new.name);
  end if;
  -- The seeds below pass an explicit slug ('todo', not the 'to_do' that "To
  -- do" would derive) because the legacy status text has to keep matching.
  return new;
end;
$$;
drop trigger if exists project_statuses_set_slug on public.project_statuses;
create trigger project_statuses_set_slug
  before insert or update of name, slug on public.project_statuses
  for each row execute function public.project_statuses_set_slug();

-- Flipping is_done changes what the legacy mirror should read for every task
-- already in that column, and nothing on project_tasks fired to notice.
create or replace function public.project_statuses_resync_tasks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.project_tasks
     set status = case when new.is_done then 'done' else new.slug end
   where status_id = new.id
     and status is distinct from (case when new.is_done then 'done' else new.slug end);
  return null;
end;
$$;
drop trigger if exists project_statuses_resync_tasks on public.project_statuses;
create trigger project_statuses_resync_tasks
  after update of is_done on public.project_statuses
  for each row when (old.is_done is distinct from new.is_done)
  execute function public.project_statuses_resync_tasks();

-- Reorder in one statement: the array is the new left-to-right order, its
-- index becomes position. Doing it row by row from the client leaves the board
-- half-sorted if the network drops between calls.
create or replace function public.reorder_project_statuses(p_project uuid, p_ids uuid[])
returns setof public.project_statuses
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.my_org_id();
begin
  if v_org is null then raise exception 'Not signed in'; end if;
  -- Re-check the caller against THIS project, not "is this person a manager
  -- somewhere". Definer bypasses RLS, so the row check has to be explicit and
  -- it has to match project_statuses_write exactly: reordering the columns is
  -- reshaping the board, so it is a lead's call, not any member's.
  if not exists (
    select 1 from public.projects p
     where p.id = p_project and p.org_id = v_org
       and (public.is_projects_manager()
            or p.owner_id = auth.uid()
            or exists (select 1 from public.project_members m
                        where m.project_id = p.id and m.user_id = auth.uid() and m.role = 'lead'))
  ) then
    raise exception 'You cannot change this project.';
  end if;

  update public.project_statuses s
     set position = i.ord
    from unnest(p_ids) with ordinality as i(sid, ord)
   where s.id = i.sid and s.project_id = p_project and s.org_id = v_org;

  return query select * from public.project_statuses
    where project_id = p_project order by position, name;
end;
$$;
grant execute on function public.reorder_project_statuses(uuid, uuid[]) to authenticated;

alter table public.project_statuses enable row level security;

drop policy if exists project_statuses_select on public.project_statuses;
create policy project_statuses_select on public.project_statuses for select using (
  public.same_org(org_id) and (
    public.is_projects_manager()
    or public.is_project_member(project_id)
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
    or exists (select 1 from public.project_tasks t where t.project_id = project_statuses.project_id and t.assigned_to = auth.uid())
  )
);

-- Columns are the shape of the board, so only the people who run the project
-- reshape it. A member moves cards, a lead decides what the columns are.
-- Derive org_id from the project rather than trusting the client, and require
-- the project itself to be in the caller's org. Without this, is_projects_manager()
-- is a "holds a role somewhere" check: an admin of org A could insert a status
-- carrying org_id A but project_id belonging to org B. Org B can never SELECT
-- it, but two SECURITY DEFINER functions look statuses up by project_id with no
-- org filter and would hand it live behaviour, including as the destination
-- when org B deletes a column.
create or replace function public.project_statuses_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.projects where id = new.project_id;
  if v_org is null then raise exception 'Project not found'; end if;
  -- coalesce, and only enforce for a real signed-in caller. same_org() returns
  -- NULL when auth.uid() is NULL, and `not NULL` is NULL, so the bare check
  -- never fired: this guard had the very NULL-collapse it was written after.
  -- Service-role and migration writes have no JWT and still need to seed rows;
  -- they get the derived org_id, which is the integrity guarantee that matters.
  if auth.uid() is not null and not coalesce(public.same_org(v_org), false) then
    raise exception 'Not your organisation';
  end if;
  new.org_id := v_org;
  return new;
end;
$$;
drop trigger if exists project_statuses_guard_trg on public.project_statuses;
create trigger project_statuses_guard_trg
  before insert or update on public.project_statuses
  for each row execute function public.project_statuses_guard();

drop policy if exists project_statuses_write on public.project_statuses;
create policy project_statuses_write on public.project_statuses for all using (
  public.same_org(org_id) and (
    public.is_projects_manager()
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
    or exists (select 1 from public.project_members m
                where m.project_id = project_statuses.project_id and m.user_id = auth.uid() and m.role = 'lead')
  )
) with check (
  public.same_org(org_id) and public.has_projects_suite() and (
    public.is_projects_manager()
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
    or exists (select 1 from public.project_members m
                where m.project_id = project_statuses.project_id and m.user_id = auth.uid() and m.role = 'lead')
  )
);

-- ============================================================================
-- 4. TASK COMMENTS
--    Shaped on add_task_comment() in tasks_recurring_comments.sql, including
--    the bug that was fixed there: the person who CREATED a task could not
--    read comments on it once they had assigned it to somebody else. Both the
--    select policy and the RPC's permission gate below name created_by.
-- ============================================================================
create table if not exists public.project_task_comments (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id    uuid not null references public.project_tasks(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists ptcomments_task_idx on public.project_task_comments (task_id, created_at);

-- Derive rather than trust, the same guard project_task_deps has. The insert
-- policy gates on is_project_member(project_id), but project_id arrives from
-- the client while task_id is unconstrained, so a member of project X could
-- write a comment carrying project_id X and task_id belonging to project Y and
-- have it land in Y's thread. Deriving both from the task closes it before RLS
-- runs, and same_org(org_id) still gets the final say on the derived values.
create or replace function public.project_task_comments_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select id, org_id, project_id into t from public.project_tasks where id = new.task_id;
  if t.id is null then raise exception 'Task not found'; end if;
  -- same NULL-collapse guard as project_statuses_guard, see the note there
  if auth.uid() is not null and not coalesce(public.same_org(t.org_id), false) then
    raise exception 'Not your organisation';
  end if;
  new.project_id := t.project_id;
  new.org_id     := t.org_id;
  -- coalesce for the same reason as project_task_deps.created_by: auth.uid()
  -- is NULL on a service-role or maintenance write and the column is NOT NULL,
  -- so an unconditional override makes those writes fail outright.
  new.author_id  := coalesce(auth.uid(), new.author_id);
  return new;
end;
$$;
drop trigger if exists project_task_comments_guard_trg on public.project_task_comments;
create trigger project_task_comments_guard_trg
  before insert on public.project_task_comments
  for each row execute function public.project_task_comments_guard();

alter table public.project_task_comments enable row level security;

drop policy if exists project_task_comments_select on public.project_task_comments;
-- Note there is deliberately no bare `author_id = auth.uid()` branch: having
-- once written a comment must not keep the whole thread readable after you lose
-- access to the task itself.
create policy project_task_comments_select on public.project_task_comments for select using (
  public.same_org(org_id) and (
    public.is_projects_manager()
    or public.is_project_member(project_id)
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
    or public.is_on_project_task(task_id)
  )
);

-- Comments go in through the RPC so every one of them lands with a spine
-- event. This policy exists so a direct insert cannot skip that.
drop policy if exists project_task_comments_insert on public.project_task_comments;
create policy project_task_comments_insert on public.project_task_comments for insert with check (
  public.same_org(org_id) and public.has_projects_suite() and author_id = auth.uid() and (
    public.is_projects_manager()
    or public.is_project_member(project_id)
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
    or public.is_on_project_task(task_id)
  )
);

drop policy if exists project_task_comments_delete on public.project_task_comments;
create policy project_task_comments_delete on public.project_task_comments for delete using (
  public.same_org(org_id) and (author_id = auth.uid() or public.is_projects_manager())
);

create or replace function public.add_project_task_comment(p_task uuid, p_body text)
returns public.project_task_comments
language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid := public.my_org_id();
  v_me   uuid := auth.uid();
  t      record;
  v_owner uuid;
  v_name text;
  row    public.project_task_comments;
begin
  if v_org is null or v_me is null then raise exception 'Not signed in'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 1 then raise exception 'Empty comment'; end if;

  select * into t from public.project_tasks where id = p_task and org_id = v_org;
  if t.id is null then raise exception 'Task not found'; end if;

  select owner_id into v_owner from public.projects where id = t.project_id and org_id = v_org;

  -- Definer bypasses RLS, so re-check this caller against THIS task: being a
  -- projects manager in general is not the same question as being allowed
  -- near this row.
  --
  -- Every comparison is coalesced. On an unassigned task `t.assigned_to =
  -- v_me` is NULL, not false, so the whole OR chain evaluates to NULL, `not
  -- NULL` is NULL, and `if NULL then raise` never fires: the gate silently
  -- opens for everyone. Same trap as `where x = null`.
  if not (coalesce(t.assigned_to = v_me, false)
          or coalesce(t.created_by = v_me, false)
          or coalesce(v_owner = v_me, false)
          or public.is_project_member(t.project_id)
          or public.is_projects_manager()) then
    raise exception 'Only people on this task can comment';
  end if;

  insert into public.project_task_comments (org_id, project_id, task_id, author_id, body)
  values (v_org, t.project_id, t.id, v_me, left(trim(p_body), 2000))
  returning * into row;

  select name into v_name from public.profiles where id = v_me;
  insert into public.org_events (org_id, type, actor_id, payload)
  values (v_org, 'project.comment', v_me, jsonb_build_object(
    'projectId', t.project_id, 'taskId', t.id, 'title', t.title, 'by', v_name,
    'snippet', left(trim(p_body), 120),
    'for', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select distinct u as x from unnest(array[t.assigned_to, t.created_by, v_owner]) u
       where u is not null and u <> v_me) s)
  ));

  return row;
end;
$$;
grant execute on function public.add_project_task_comment(uuid, text) to authenticated;

-- ============================================================================
-- 6. THE DEPENDENCY HAS TO MEAN SOMETHING
--
-- Everything above lets you RECORD that task B waits for task A. None of it
-- stopped B being dragged into a Done column while A sat in To do, from the
-- board, the list, or a direct API call. A rule the UI draws and the database
-- ignores is decoration, and the CSV export was already emitting the
-- contradiction in one row: Status=Done, Blocked=Yes.
-- ============================================================================
create or replace function public.project_task_block_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_open text;
begin
  -- only when the task is MOVING INTO a finished status
  if new.status_id is null or new.status_id is not distinct from old.status_id then
    return new;
  end if;
  if not exists (select 1 from public.project_statuses s where s.id = new.status_id and s.is_done) then
    return new;
  end if;

  select string_agg(pre.title, ', ' order by pre.title) into v_open
  from public.project_task_deps d
  join public.project_tasks pre on pre.id = d.depends_on_id
  left join public.project_statuses ps on ps.id = pre.status_id
  where d.task_id = new.id and coalesce(ps.is_done, false) = false;

  if v_open is not null then
    raise exception 'This task is still waiting on: %. Finish those first, or remove the dependency.', v_open;
  end if;
  return new;
end;
$$;

drop trigger if exists project_task_block_guard_trg on public.project_tasks;
create trigger project_task_block_guard_trg
  before update of status_id on public.project_tasks
  for each row execute function public.project_task_block_guard();

-- Which tasks are blocked, answered by the SERVER.
--
-- The client was computing this by looking up each prerequisite in the tasks it
-- had fetched, and a prerequisite the viewer cannot READ simply wasn't there —
-- so an unknown prerequisite counted as finished and a genuinely blocked task
-- was announced as "Clear to start" in a green banner. Unknown must never
-- resolve to safe. This is SECURITY DEFINER so it sees every prerequisite,
-- and returns only ids the caller already has, never the hidden task's details.
create or replace function public.project_blocked_tasks(p_project uuid)
returns table (task_id uuid, waiting_on int)
language sql security definer stable set search_path = public as $$
  select d.task_id, count(*)::int
  from public.project_task_deps d
  join public.project_tasks t on t.id = d.task_id
  join public.project_tasks pre on pre.id = d.depends_on_id
  left join public.project_statuses ps on ps.id = pre.status_id
  where d.project_id = p_project
    and public.same_org(t.org_id)
    and coalesce(ps.is_done, false) = false
  group by d.task_id;
$$;
grant execute on function public.project_blocked_tasks(uuid) to authenticated;

-- Renaming a status has to obey the same uniqueness the create path enforces,
-- but NOT by recomputing the slug.
--
-- The first attempt added a trigger that recomputed slug from name on update.
-- It fired after project_statuses_set_slug, which deliberately FREEZES the slug
-- on rename precisely so the legacy project_tasks.status text keeps resolving.
-- Recomputing it meant renaming "In review" to "Checking" left every task
-- carrying status='in_review' with no column of that slug, and
-- project_tasks_sync_status then dumped those cards into the FIRST column.
--
-- The slug is an identity, the name is a label. Enforce the label's uniqueness
-- directly and leave the identity alone.
drop trigger if exists project_statuses_slug on public.project_statuses;
drop function if exists public.project_statuses_slug_trg();

create unique index if not exists project_statuses_name_uniq
  on public.project_statuses (project_id, lower(trim(name)));
