-- Banter League — adds the full scoring depth + API-Football sync support.
-- Safe to run on top of 0001.

-- Chips: one strategic multiplier per user per gameweek.
alter table public.predictions
  add column if not exists chip text not null default 'none'
    check (chip in ('none', 'banker', 'goal_rush'));

-- Migrate existing banker flags onto the chip column.
update public.predictions set chip = 'banker' where is_banker = true and chip = 'none';

-- Player-centric props + flexible metadata (legend bonus, future props).
alter table public.predictions
  add column if not exists pred_anytime_scorer text;
alter table public.predictions
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Match-event data from API-Football (anytime scorers).
alter table public.fixtures
  add column if not exists all_scorers text[];

-- API-Football wiring on the league + gameweek.
alter table public.leagues
  add column if not exists api_league_id int;   -- e.g. 39 = Premier League
alter table public.leagues
  add column if not exists api_season int;       -- e.g. 2024
alter table public.gameweeks
  add column if not exists api_round text;        -- e.g. 'Regular Season - 12'

-- Profile field used by the cinematic reveal.
alter table public.users
  add column if not exists avatar_emoji text not null default '⚽';
