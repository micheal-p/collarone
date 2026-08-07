-- ============================================================================
-- App errors are an INBOX, not a museum. Idempotent.
--
-- Fixed things lingered forever ("if it has been healed then no need to still
-- be here" — founder, looking at a July crash flood in August). resolved_at
-- lets a platform admin mark an error group dealt-with: it leaves the default
-- view, stops counting toward the health threshold, and stays queryable as
-- history. Resolution is an acknowledgement, not a deletion — the record
-- survives, the noise doesn't.
-- ============================================================================

alter table public.client_errors add column if not exists resolved_at timestamptz;
alter table public.client_errors add column if not exists resolved_by uuid;

create index if not exists client_errors_unresolved_idx
  on public.client_errors (occurred_at desc) where resolved_at is null;

-- Platform admins may resolve. The trigger pins everything else so "resolve"
-- can never quietly rewrite what the error said.
drop policy if exists "client_errors_platform_resolve" on public.client_errors;
create policy "client_errors_platform_resolve" on public.client_errors
  for update using (public.is_platform_admin())
  with check (public.is_platform_admin());

create or replace function public.guard_client_error_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.message     := old.message;
  new.stack       := old.stack;
  new.path        := old.path;
  new.occurred_at := old.occurred_at;
  new.user_agent  := old.user_agent;
  return new;
end; $$;
drop trigger if exists trg_guard_client_error_update on public.client_errors;
create trigger trg_guard_client_error_update
  before update on public.client_errors
  for each row execute function public.guard_client_error_update();
