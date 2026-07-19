-- =============================================================================
-- Client-side crash log.
-- The /status uptime checks only prove the API and database answer — they
-- cannot see a JavaScript error inside a user's browser. Rows here are
-- written exclusively by the /api/track serverless function (service role);
-- there is deliberately NO insert policy, so the browser can never write
-- directly. Platform admins read them in Platform Control.
-- =============================================================================

create table if not exists public.client_errors (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  message     text not null,
  stack       text,
  path        text,
  user_agent  text
);

create index if not exists client_errors_occurred_idx
  on public.client_errors (occurred_at desc);

alter table public.client_errors enable row level security;

drop policy if exists "client_errors_platform_read" on public.client_errors;
create policy "client_errors_platform_read" on public.client_errors
  for select using ( public.is_platform_admin() );
