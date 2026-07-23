-- ============================================================================
-- Skill Duels — Migration 002: daily_runs (persist today's run + its score)
-- ============================================================================
-- WHAT THIS IS
--   A SECOND, SMALL script. Run it ONCE, AFTER schema.sql. It adds one table so
--   that a player's daily run survives a page refresh. Do NOT re-run schema.sql —
--   just paste and run THIS file.
--
-- WHY IT EXISTS
--   Until now the six daily mini-games, the daily +50 gift, and the net points
--   won/lost in duels all lived only in the browser's memory. A refresh wiped
--   them: the day's score collapsed to zero AND the "one scored attempt per day"
--   lock was lost, so games became replayable — exploitable on the leaderboard.
--   This table stores that day's run server-side, keyed by the calendar day, so a
--   refresh restores exactly what the player had and the lock holds.
--
-- HOW TO RUN IT (short version)
--   Supabase dashboard → your project → SQL Editor → New query →
--   paste this whole file → Run.  Safe to re-run: IF NOT EXISTS / CREATE OR
--   REPLACE everywhere, so running it twice does not destroy data.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. daily_runs — one row per player per calendar day
-- ----------------------------------------------------------------------------
-- `profile_id` is the player (same id as their auth user + profile row). The FK
-- with "on delete cascade" means: if the account is erased, its daily runs are
-- automatically deleted too — no orphaned data left behind (same GDPR path as
-- profiles/scores).
--
-- `day` is a plain 'YYYY-MM-DD' string in the PLAYER'S local calendar day — the
-- SAME notion of "today" the app uses to pick the daily challenge (daySeed). A
-- new day is simply a new string, so it naturally starts with no row = a fresh
-- run, while yesterday's row is kept untouched.
--
-- `games` is a JSON blob holding the WHOLE daily run: the played games and their
-- scores, plus the two other things that also reset at midnight and feed the
-- day's Season Points — the +50 daily gift and the net duel points. Keeping them
-- together in one blob means the restored score matches exactly what the player
-- had before the refresh (see the reconciliation note in App.jsx).
--
-- UNIQUE(profile_id, day) means each player has at most ONE row per day, so
-- saving again just overwrites that one row instead of piling up duplicates.
--
-- NOTE: this is gameplay progress, not new personal data — no nicknames, emails
-- or identifiers beyond the id the profile already carries.
create table if not exists public.daily_runs (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day        text not null,
  games      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (profile_id, day)
);


-- ----------------------------------------------------------------------------
-- 2. Row Level Security — deny by default, then let a player touch only its own
-- ----------------------------------------------------------------------------
-- Same lockdown as profiles/scores: with RLS on, nobody can read or write a row
-- unless a policy explicitly allows it. `auth.uid()` is the id of whoever is
-- making the request; matching it to profile_id scopes access to "just me".
-- There is deliberately NO public view here — a player's daily run is private.
alter table public.daily_runs enable row level security;

drop policy if exists daily_runs_select_own on public.daily_runs;
create policy daily_runs_select_own on public.daily_runs
  for select using (auth.uid() = profile_id);

drop policy if exists daily_runs_insert_own on public.daily_runs;
create policy daily_runs_insert_own on public.daily_runs
  for insert with check (auth.uid() = profile_id);

drop policy if exists daily_runs_update_own on public.daily_runs;
create policy daily_runs_update_own on public.daily_runs
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

drop policy if exists daily_runs_delete_own on public.daily_runs;
create policy daily_runs_delete_own on public.daily_runs
  for delete using (auth.uid() = profile_id);


-- ============================================================================
-- DONE. After running this the app can save and restore today's run, so a
-- refresh no longer wipes the day's score or unlocks already-played games.
-- ============================================================================
