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

-- Lightweight job-board account (separate from a full Collarone customer: no
-- org, no plan, no payment). You register once here, then post freely — this is
-- the spam gate AND the lead capture (posters = employers = our ICP).
create table if not exists public.job_posters (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  email       text not null default '',
  phone       text not null default '',
  company     text not null default '',
  role        text not null default '',        -- their position, e.g. "HR Manager", "Owner"
  website     text not null default '',        -- company site or social handle (for verification)
  about       text not null default '',        -- "tell us about your business / what you hire for"
  status      text not null default 'pending' check (status in ('pending','approved','suspended','rejected')),
  mode        text not null default 'free',    -- free (10/day) | paid tiers later
  daily_limit integer not null default 10,      -- posts per day in the current mode
  created_at  timestamptz not null default now()
);
alter table public.job_posters enable row level security;
drop policy if exists "job_posters_self" on public.job_posters;
create policy "job_posters_self" on public.job_posters for select using (id = auth.uid());
-- inserts/updates go through the service-role endpoint (registration).

create table if not exists public.job_wall_posts (
  id             uuid primary key default gen_random_uuid(),
  poster_id      uuid references public.job_posters(id) on delete set null,
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
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.job_wall_posts(id) on delete cascade,
  reporter_ip text not null default '',   -- sha256(ip) — one report per reporter per post
  reason      text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.job_wall_reports add column if not exists reporter_ip text not null default '';
-- dedup: a reporter (IP) counts once per post, so a single actor can't hide a post
create unique index if not exists job_wall_reports_dedup on public.job_wall_reports (post_id, reporter_ip);

alter table public.job_wall_posts enable row level security;
alter table public.job_wall_reports enable row level security;

-- Public can READ only live, un-expired posts. Writes are service-role only
-- (the endpoint), so no insert/update/delete policy exists for anon/authenticated.
drop policy if exists "job_wall_public_read" on public.job_wall_posts;
create policy "job_wall_public_read" on public.job_wall_posts
  for select using (status = 'live' and expires_at > now());

-- reports: no public read (moderation data); service-role writes only.
