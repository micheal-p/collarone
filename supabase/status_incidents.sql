-- ============================================================================
-- Collarone — real incident tracking on the status page
-- A trigger on status_checks watches for a failing check (api_ok=false or
-- db_ok=false) and opens an incident if one isn't already open; the next
-- healthy check closes the most recent open incident and records duration.
-- Matches status.anthropic.com-style incident history: start, resolution,
-- how long it took to come back.
-- ============================================================================

create table if not exists public.status_incidents (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('api_down', 'db_down', 'degraded')),
  started_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  duration_sec int,
  notes        text not null default ''
);

alter table public.status_incidents enable row level security;
drop policy if exists "status_incidents_select" on public.status_incidents;
create policy "status_incidents_select" on public.status_incidents for select using (true);
-- No insert/update/delete policy for authenticated/anon — only the trigger below writes here.

create or replace function public.log_status_incident()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_open public.status_incidents;
  v_kind text;
begin
  if new.api_ok and new.db_ok then
    -- Healthy check: close the most recent open incident, if any.
    select * into v_open from public.status_incidents where resolved_at is null order by started_at desc limit 1;
    if v_open.id is not null then
      update public.status_incidents
      set resolved_at = new.checked_at, duration_sec = extract(epoch from (new.checked_at - v_open.started_at))::int
      where id = v_open.id;
    end if;
  else
    -- Failing check: open a new incident only if one isn't already open.
    v_kind := case when not new.db_ok then 'db_down' when not new.api_ok then 'api_down' else 'degraded' end;
    select * into v_open from public.status_incidents where resolved_at is null order by started_at desc limit 1;
    if v_open.id is null then
      insert into public.status_incidents (kind, started_at) values (v_kind, new.checked_at);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_status_incident on public.status_checks;
create trigger trg_log_status_incident
  after insert on public.status_checks
  for each row execute function public.log_status_incident();
