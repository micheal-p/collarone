-- ATS Phase 2: structured interview scorecards. Idempotent.
-- scorecard: [{ "k": "skills"|"communication"|"experience"|"culture", "s": 1..5 }]
alter table public.interviews add column if not exists scorecard jsonb not null default '[]';
