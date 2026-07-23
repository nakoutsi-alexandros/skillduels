-- ============================================================================
-- Skill Duels — Phase 1 database setup
-- ============================================================================
-- WHAT THIS IS
--   One script you paste into the Supabase SQL editor and run ONCE. It builds
--   the accounts + nicknames + leaderboard backend and locks it down so players
--   can only touch their own data.
--
-- HOW TO RUN IT (short version — full click-path is in SETUP.md)
--   Supabase dashboard → your project → SQL Editor → New query →
--   paste this whole file → Run.  Safe to re-run: it uses IF NOT EXISTS / CREATE
--   OR REPLACE everywhere, so running it twice does not destroy data.
--
-- READING THIS FILE
--   Every block has a plain-language comment above it explaining WHY it exists.
--   You do not need to be a database expert. Read the comments; the SQL is the
--   machinery under each one.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Extensions
-- ----------------------------------------------------------------------------
-- `citext` = "case-insensitive text". We store nicknames in a citext column so
-- that "Alex", "alex" and "ALEX" all count as the SAME name. That is how we stop
-- two people from grabbing what is really the same nickname.
create extension if not exists citext;


-- ----------------------------------------------------------------------------
-- 2. profiles — one row per player = their public identity
-- ----------------------------------------------------------------------------
-- `id` is the SAME id as the anonymous user Supabase Auth created for them. The
-- FK with "on delete cascade" means: if the auth user is deleted (account
-- erasure), this profile row is automatically deleted too. That is our GDPR
-- delete path — no orphaned personal data left behind.
--
-- `nickname` is citext + UNIQUE + NOT NULL. This UNIQUE constraint is the REAL
-- enforcement of "nicknames must be unique". The app also checks as you type,
-- but that is only for a nice UX — the database is the source of truth.
--
-- NOTE: a nickname is PUBLIC PERSONAL DATA (it shows on the leaderboard). That
-- is intended and disclosed in the privacy policy.
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nickname   citext unique not null,
  avatar     text not null default 'knight',
  created_at timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 3. scores — a player's Season Points, one row per player per season
-- ----------------------------------------------------------------------------
-- Kept SEPARATE from profiles on purpose. Seasons reset monthly; keeping scores
-- in their own table means a reset is just "start a new season string" and the
-- old season's rows are still there as history — we never overwrite identity.
--
-- `season` is a plain string like '2026-07' (year-month). The UNIQUE(profile_id,
-- season) rule means each player has at most ONE score row per season, so saving
-- a new total just overwrites that one row instead of piling up duplicates.
create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  season     text not null,
  season_pts integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (profile_id, season)
);

-- Helps the leaderboard sort quickly once there are many players.
create index if not exists scores_season_pts_idx
  on public.scores (season, season_pts desc);


-- ----------------------------------------------------------------------------
-- 4. Nickname validation — server-side guard
-- ----------------------------------------------------------------------------
-- The client does length/character checks for UX, but a cheater can bypass the
-- client. This trigger runs INSIDE the database on every insert/update, so it
-- cannot be skipped. It enforces: length 3–16, only letters/numbers/_ . -, and a
-- small profanity/impersonation denylist.
--
-- If you want a bigger, smarter denylist later, the right home is a Supabase
-- Edge Function (a small serverless function) called before insert — but for
-- closed testing this in-database check is enough and needs no extra deploy.
create or replace function public.validate_nickname()
returns trigger
language plpgsql
as $$
declare
  n text := lower(trim(new.nickname::text));
begin
  -- length
  if char_length(n) < 3 or char_length(n) > 16 then
    raise exception 'Nickname must be 3–16 characters';
  end if;

  -- allowed characters only (letters, numbers, underscore, dot, hyphen)
  if n !~ '^[a-z0-9_.-]+$' then
    raise exception 'Nickname can only use letters, numbers and _ . -';
  end if;

  -- basic denylist (substring match). Extend this list as needed.
  if n ~ '(admin|moderator|support|official|skillduels|fuck|shit|cunt|nigg|f4g|rape|nazi)' then
    raise exception 'That nickname is not allowed';
  end if;

  -- store the trimmed value
  new.nickname := trim(new.nickname::text);
  return new;
end;
$$;

drop trigger if exists trg_validate_nickname on public.profiles;
create trigger trg_validate_nickname
  before insert or update of nickname on public.profiles
  for each row execute function public.validate_nickname();


-- ----------------------------------------------------------------------------
-- 5. season_leaderboard — the PUBLIC view everyone can read
-- ----------------------------------------------------------------------------
-- Players' raw tables are locked down (see RLS below). The public only ever sees
-- this view, which exposes ONLY three fields: name, avatar, points. No ids, no
-- emails, no timestamps. It joins each score to its profile for the display name
-- and avatar. Filter by season on the client side.
--
-- A view runs with its OWNER's privileges, so `anon` reading this view can see
-- the joined rows even though the underlying tables are otherwise private. Since
-- the view only selects three harmless columns, that is exactly what we want.
create or replace view public.season_leaderboard as
select
  p.nickname   as name,
  p.avatar     as avatar,
  s.season_pts as pts,
  s.season     as season
from public.scores s
join public.profiles p on p.id = s.profile_id
order by s.season_pts desc;

-- Let anonymous and logged-in clients read the leaderboard view.
grant select on public.season_leaderboard to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 6. Row Level Security (RLS) — deny by default, then open the minimum
-- ----------------------------------------------------------------------------
-- RLS means: unless a policy explicitly ALLOWS a row, nobody can read or write
-- it. We turn it on for both tables (so the default is "no access"), then add
-- narrow policies that let a player touch ONLY their own rows. Public reads do
-- NOT go through these tables — they go through the view above.

alter table public.profiles enable row level security;
alter table public.scores   enable row level security;

-- profiles: a player may read / create / edit / delete ONLY their own row.
-- `auth.uid()` is the id of whoever is making the request. Matching it to the
-- row id is what scopes access to "just me".
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles
  for delete using (auth.uid() = id);

-- scores: same idea — a player only reads/writes their own score rows.
drop policy if exists scores_select_own on public.scores;
create policy scores_select_own on public.scores
  for select using (auth.uid() = profile_id);

drop policy if exists scores_insert_own on public.scores;
create policy scores_insert_own on public.scores
  for insert with check (auth.uid() = profile_id);

drop policy if exists scores_update_own on public.scores;
create policy scores_update_own on public.scores
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

drop policy if exists scores_delete_own on public.scores;
create policy scores_delete_own on public.scores
  for delete using (auth.uid() = profile_id);


-- ----------------------------------------------------------------------------
-- 7. Account deletion (GDPR erasure)
-- ----------------------------------------------------------------------------
-- A player must be able to delete themselves. Deleting from auth.users is a
-- privileged action the public anon key is NOT allowed to do directly. So we
-- wrap it in this function marked SECURITY DEFINER, which means "run with the
-- function owner's elevated rights". It deletes ONLY the caller's own auth user
-- (auth.uid()), and the ON DELETE CASCADE from section 2 & 3 automatically
-- removes their profile and scores. One call, everything about them is gone.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

-- Only a logged-in (even anonymous) user can call it, and it only ever deletes
-- the caller — there are no parameters to point it at anyone else.
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated, anon;


-- ============================================================================
-- DONE. After running this:
--   - Enable "Anonymous sign-ins" in Authentication → Providers (see SETUP.md).
--   - The app can now create silent accounts, claim unique nicknames, save
--     Season Points, show a real leaderboard, and delete accounts on request.
-- ============================================================================
