-- Banter League — autonomous gameweek management. Safe to run on top of 0002.

-- Per-league automation config.
alter table public.leagues
  add column if not exists auto_manage boolean not null default true;
-- How long before the first kickoff the prediction window opens (hours).
alter table public.leagues
  add column if not exists predict_lead_hours int not null default 120; -- ~5 days

-- Lifecycle audit timestamps on each gameweek (idempotency + observability).
alter table public.gameweeks
  add column if not exists announced_at  timestamptz;
alter table public.gameweeks
  add column if not exists opened_at     timestamptz;
alter table public.gameweeks
  add column if not exists settled_at    timestamptz;
alter table public.gameweeks
  add column if not exists last_synced_at timestamptz;

-- Audit log of every scheduled engine run (production observability).
create table if not exists public.job_runs (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  ok         boolean not null default true,
  summary    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.job_runs enable row level security;
-- Only the service role (engine) writes; authenticated users may read the log.
create policy job_runs_select on public.job_runs
  for select to authenticated using (true);

-- Helpful index for the engine's "find fixtures by kickoff" scans.
create index if not exists fixtures_gw_kickoff_idx on public.fixtures (gameweek_id, kickoff_at);
