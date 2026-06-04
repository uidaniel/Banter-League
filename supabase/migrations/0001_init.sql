-- Banter League — Phase 1 schema (Free-to-Play)
-- Run in Supabase SQL Editor, or via `supabase db push`.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Profile data mirroring auth.users (populated by trigger below).
create table public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player',
  email        text,
  created_at   timestamptz not null default now()
);

create table public.leagues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  admin_id    uuid not null references public.users (id) on delete cascade,
  invite_code text not null unique,
  type        text not null default 'free' check (type in ('free', 'money')),
  created_at  timestamptz not null default now()
);

create table public.league_members (
  id        uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id   uuid not null references public.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  unique (league_id, user_id)
);

create table public.gameweeks (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.leagues (id) on delete cascade,
  gw_number  int not null,
  status     text not null default 'draft'
             check (status in ('draft', 'predicting', 'locked', 'live', 'settled')),
  lock_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (league_id, gw_number)
);

create table public.fixtures (
  id            uuid primary key default gen_random_uuid(),
  gameweek_id   uuid not null references public.gameweeks (id) on delete cascade,
  home_team     text not null,
  away_team     text not null,
  kickoff_at    timestamptz,
  home_score    int,
  away_score    int,
  first_scorer  text,
  external_ref  text,          -- API-Football fixture id (Phase 2)
  created_at    timestamptz not null default now()
);

create table public.predictions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (id) on delete cascade,
  fixture_id        uuid not null references public.fixtures (id) on delete cascade,
  pred_home         int not null check (pred_home >= 0),
  pred_away         int not null check (pred_away >= 0),
  pred_first_scorer text,
  is_banker         boolean not null default false,
  points_awarded    int,        -- null until settled (idempotent re-scoring overwrites)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, fixture_id)
);

-- Present but UNUSED in v1 — money track only (see PRD §3).
create table public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  gameweek_id  uuid not null references public.gameweeks (id) on delete cascade,
  type         text not null check (type in ('entry', 'payout', 'platform_fee')),
  amount       numeric(12, 2) not null,
  currency     text not null default 'NGN',
  status       text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  provider_ref text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- New-user trigger: copy auth.users → public.users
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helper: is the current user a member of this league?
-- SECURITY DEFINER avoids recursive RLS when policies reference membership.
-- ---------------------------------------------------------------------------
create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_league_admin(p_league_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.leagues
    where id = p_league_id and admin_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.users          enable row level security;
alter table public.leagues        enable row level security;
alter table public.league_members enable row level security;
alter table public.gameweeks      enable row level security;
alter table public.fixtures       enable row level security;
alter table public.predictions    enable row level security;
alter table public.transactions   enable row level security;

-- users: everyone authed can read names (leaderboard); you edit only yourself.
create policy users_select on public.users
  for select to authenticated using (true);
create policy users_update on public.users
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- leagues: readable by members or the admin; anyone authed can create.
create policy leagues_select on public.leagues
  for select to authenticated
  using (admin_id = auth.uid() or public.is_league_member(id));
create policy leagues_insert on public.leagues
  for insert to authenticated with check (admin_id = auth.uid());
create policy leagues_update on public.leagues
  for update to authenticated using (admin_id = auth.uid());

-- league_members: members see their league's roster; you can join yourself.
create policy members_select on public.league_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_league_member(league_id));
create policy members_insert on public.league_members
  for insert to authenticated with check (user_id = auth.uid());

-- gameweeks: members read; admins write.
create policy gw_select on public.gameweeks
  for select to authenticated using (public.is_league_member(league_id));
create policy gw_admin on public.gameweeks
  for all to authenticated
  using (public.is_league_admin(league_id))
  with check (public.is_league_admin(league_id));

-- fixtures: members read; admins write.
create policy fixtures_select on public.fixtures
  for select to authenticated
  using (public.is_league_member((select league_id from public.gameweeks g where g.id = gameweek_id)));
create policy fixtures_admin on public.fixtures
  for all to authenticated
  using (public.is_league_admin((select league_id from public.gameweeks g where g.id = gameweek_id)))
  with check (public.is_league_admin((select league_id from public.gameweeks g where g.id = gameweek_id)));

-- predictions: members read all preds in their league (leaderboard transparency);
-- you write only your own. Write-window enforcement (status='predicting') is done
-- in the server action; tighten here later if desired.
create policy preds_select on public.predictions
  for select to authenticated
  using (
    public.is_league_member((
      select g.league_id
      from public.fixtures f join public.gameweeks g on g.id = f.gameweek_id
      where f.id = fixture_id
    ))
  );
create policy preds_write on public.predictions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- transactions: read your own only (unused in v1).
create policy tx_select on public.transactions
  for select to authenticated using (user_id = auth.uid());
