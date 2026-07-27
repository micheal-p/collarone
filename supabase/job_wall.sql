-- ============================================================================
-- Collarone — Community Job Wall (public growth funnel)
-- An OPEN wall: anyone posts a job (no login), by filling a form OR pasting raw
-- WhatsApp job text that we AI-structure. Each post gets a clean shareable page
-- so posters forward a collarone.app link to their WhatsApp groups instead of
-- raw text — pulling that traffic onto the platform. Posts auto-expire after
-- ~21 days so the wall stays fresh. Separate from careers.sql (that's per-
-- customer recruiting; this is public, org-less community posts).
--
-- Writes go through the service-role endpoint client/api/job-post.js (spam
-- scoring + AI structuring live there). Reads are public via RLS.
-- ============================================================================

create table if not exists public.job_wall_posts (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,                    -- /jobs/<slug> share link
  title          text not null,
  company        text not null default '',
  location       text not null default '',
  pay_text       text not null default '',                -- free text, e.g. "₦150k/mo" or "Negotiable"
  description    text not null,
  apply_method   text not null default 'whatsapp' check (apply_method in ('whatsapp','phone','email','link')),
  apply_contact  text not null default '',                -- the number / email / URL seekers use
  source         text not null default 'form' check (source in ('form','paste')),
  status         text not null default 'live' check (status in ('live','hidden','expired')),
  spam_score     numeric not null default 0,              -- 0–1, AI-assigned on ingest
  report_count   integer not null default 0,
  poster_contact text not null default '',                -- optional, for light verification / takedown
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '21 days')
);
create index if not exists job_wall_live_idx on public.job_wall_posts (status, expires_at desc);

create table if not exists public.job_wall_reports (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.job_wall_posts(id) on delete cascade,
  reason     text not null default '',
  created_at timestamptz not null default now()
);

alter table public.job_wall_posts enable row level security;
alter table public.job_wall_reports enable row level security;

-- Public can READ only live, un-expired posts. Writes are service-role only
-- (the endpoint), so no insert/update/delete policy exists for anon/authenticated.
drop policy if exists "job_wall_public_read" on public.job_wall_posts;
create policy "job_wall_public_read" on public.job_wall_posts
  for select using (status = 'live' and expires_at > now());

-- reports: no public read (moderation data); service-role writes only.
