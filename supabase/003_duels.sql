-- ============================================================================
-- Skill Duels — Migration 003: real duels (data model + settlement + anti-cheat)
-- ============================================================================
-- WHAT THIS IS
--   The THIRD script. Run it ONCE, AFTER schema.sql and 002_daily_runs.sql, in
--   the Supabase SQL editor. It adds the tables + server-side functions that make
--   real, point-transferring 1v1 duels possible WITHOUT trusting the client.
--
--   It does NOT touch the existing tables' data. It only ADDS. Safe to re-run:
--   IF NOT EXISTS / CREATE OR REPLACE everywhere.
--
-- WHY IT EXISTS
--   Until now duels were faked entirely in the browser: the opponent's score was
--   invented client-side, and the win/loss + point change were computed and
--   applied on trust. The moment Season Points are real and ranked, that is a
--   free cheat: a client can just POST "I won, +200". This migration moves the
--   authority to the server. The client sends only its RAW performance (e.g. the
--   reaction time in ms); the SERVER recomputes the points, decides the winner,
--   and moves the points inside ONE database transaction that a client cannot
--   forge, race, or bypass.
--
-- THE DUEL MODEL (approved game-economy design)
--   * Async, non-consensual. The challenger plays a FRESH attempt of one game and
--     is scored against the DEFENDER'S most-recent SAME-DAY recorded score for
--     that game. Only players who actually played that game today are duelable on
--     it. Never an all-time best.
--   * Zero-sum steal. Win => points move from defender to challenger. The amount
--     moved is capped by three floors (see settle_duel) and can be PARTIAL.
--   * Shield. A defender can lose at most 300 points per rolling 24h across ALL
--     incoming duels; the same attacker can hit the same defender at most once per
--     24h; brand-new players get a 48h grace.
--   * Matchmaking band. A challenger can only pick defenders whose season points
--     are within ~0.5x..2x of their own (with an additive floor so a zero-point
--     player still has opponents).
--
-- TRUST BOUNDARY (read this before editing)
--   The raw private tables (game_scores, duels, notifications) stay locked by RLS
--   to own-rows-only, exactly like profiles/scores/daily_runs. There is NO public
--   view onto them. Every CROSS-PLAYER read or write a duel needs — reading a
--   defender's eligible score, checking who is duelable, moving another player's
--   points, writing another player's notification — happens ONLY inside the
--   SECURITY DEFINER functions at the bottom of this file. Those functions are the
--   single, audited hole in the wall. Do not add a public view onto these tables.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Extensions
-- ----------------------------------------------------------------------------
-- gen_random_uuid() lives in pgcrypto. Supabase usually has it already; this is a
-- no-op if so.
create extension if not exists pgcrypto;


-- ----------------------------------------------------------------------------
-- 1. game_scores — a cross-player index of "who scored what, on which game, today"
-- ----------------------------------------------------------------------------
-- Today the per-game daily scores live ONLY inside the daily_runs.games JSON blob,
-- which is private to each player and has no cross-player index — so there is no
-- way for a challenger to find a defender's score for game X. This table fixes
-- that: every time a player finishes a scored daily game, the client ALSO appends
-- one row here. It is the lookup a duel settles against.
--
-- Append-only by design. A daily game is one scored attempt per day, so normally
-- one row per (player, game, day); "most recent same-day" is defined by created_at
-- so the model is robust even if more than one ever lands.
--
-- PRIVACY NOTE: a per-game score becoming visible to OTHER players (via the duel
-- functions below) is new personal-data exposure vs. today's private blob. That is
-- a legal-compliance gate (privacy-policy update) BEFORE this ships — tracked
-- separately; this migration only builds the machinery.
create table if not exists public.game_scores (
  id         bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  game_id    text not null,
  day        text not null,                       -- 'YYYY-MM-DD', player's local day
  raw        numeric not null,                    -- the game's RAW result (ms, %, count, seconds…)
  pts        integer not null,                    -- points as the CLIENT computed them (display only)
  label      text not null default '',            -- human label, e.g. "212 ms avg"
  secondary  numeric,                             -- TIEBREAK metric: a FINER measure of the same skill
                                                  -- than pts (see §6 duel_bound_secondary). Nullable:
                                                  -- legacy rows + games/attempts with no finer signal.
  created_at timestamptz not null default now()
);

-- Idempotent add for DATABASES CREATED BEFORE the tiebreaker pass: `create table
-- if not exists` above is a no-op on an existing table, so the new column must be
-- added explicitly. Safe to re-run.
alter table public.game_scores add column if not exists secondary numeric;

-- "Latest same-day score for game X by player Y" — the exact shape a duel reads.
create index if not exists game_scores_lookup_idx
  on public.game_scores (game_id, day, profile_id, created_at desc);
-- "All of a player's scores" — for own-row reads.
create index if not exists game_scores_owner_idx
  on public.game_scores (profile_id, game_id, day);


-- ----------------------------------------------------------------------------
-- 2. duels — the audit log AND the source of truth for shield + cooldown
-- ----------------------------------------------------------------------------
-- One row per settled (or rejected) duel. We deliberately DERIVE the shield budget
-- and the per-pair cooldown from THIS table's timestamps rather than keeping
-- separate counters, so there is a single source of truth and a true ROLLING 24h
-- window (a counter keyed by calendar-day cannot express "rolling 24h" honestly).
--
-- server_pts is what the SERVER recomputed from the challenger's raw — never the
-- client's claim. defender_score_snapshot is the target's points at settle time.
-- transferred_amount is what ACTUALLY moved (may be < stake when a floor bit).
create table if not exists public.duels (
  id                      uuid primary key default gen_random_uuid(),
  challenger_id           uuid not null references public.profiles (id) on delete cascade,
  defender_id             uuid not null references public.profiles (id) on delete cascade,
  game_id                 text not null,
  day                     text not null,
  stake                   integer not null,
  defender_score_snapshot integer not null,       -- defender's pts for this game today, at settle time
  challenger_inputs       jsonb not null default '{}'::jsonb, -- reserved: future input-trace replay
  server_pts              integer not null,        -- SERVER-recomputed challenger pts
  status                  text not null default 'settled',    -- settled | rejected
  outcome                 text,                    -- challenger_win | defender_win
  transferred_amount      integer not null default 0,
  created_at              timestamptz not null default now()
);

-- Shield budget: sum(transferred) where defender = X in the last 24h.
create index if not exists duels_defender_idx
  on public.duels (defender_id, created_at desc);
-- Per-pair cooldown: did A already hit B in the last 24h?
create index if not exists duels_pair_idx
  on public.duels (challenger_id, defender_id, created_at desc);


-- ----------------------------------------------------------------------------
-- 3. notifications — one row per event addressed to a player
-- ----------------------------------------------------------------------------
-- Settling a duel that TOOK points writes a 'duel_lost' notification for the
-- defender: who hit them, on which game, for how many points, and their new
-- balance. This is the hook a later "duel back" flow reads. Only the settlement
-- function (SECURITY DEFINER) inserts here; players can read and mark-read their
-- own rows, never insert.
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type       text not null,                        -- 'duel_lost' | 'duel_defended'
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_owner_idx
  on public.notifications (profile_id, created_at desc);


-- ----------------------------------------------------------------------------
-- 4. Row Level Security — deny by default, own-rows-only, NO public view
-- ----------------------------------------------------------------------------
-- Same lockdown philosophy as every other table. Cross-player access does NOT go
-- through these policies — it goes through the SECURITY DEFINER functions below.

alter table public.game_scores   enable row level security;
alter table public.duels         enable row level security;
alter table public.notifications enable row level security;

-- game_scores: a player may read and append ONLY their own rows. No update/delete
-- (append-only); erasure happens via the FK cascade when the account is deleted.
drop policy if exists game_scores_select_own on public.game_scores;
create policy game_scores_select_own on public.game_scores
  for select using (auth.uid() = profile_id);

drop policy if exists game_scores_insert_own on public.game_scores;
create policy game_scores_insert_own on public.game_scores
  for insert with check (auth.uid() = profile_id);

-- duels: a player may READ duels they were part of (as challenger or defender),
-- for a "recent duels" / history view. They may NOT insert/update/delete — only
-- settle_duel (SECURITY DEFINER) writes here, so the audit log cannot be forged.
drop policy if exists duels_select_involved on public.duels;
create policy duels_select_involved on public.duels
  for select using (auth.uid() = challenger_id or auth.uid() = defender_id);

-- notifications: a player may read and mark-read (update) ONLY their own. No
-- client insert — the server function is the only writer.
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (auth.uid() = profile_id);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);


-- ----------------------------------------------------------------------------
-- 5. duel_game_pts — the ONE canonical, server-authoritative scoring formula
-- ----------------------------------------------------------------------------
-- Every game's points are a PURE FUNCTION of its raw result. This function is the
-- server's copy of that formula, mirrored EXACTLY from the client (src/App.jsx:
-- draw 1159, bullseye 1237, numbers 1287, oddone 1354, chimp 1419, quickmath 1489).
-- Because points are recomputed here from raw, a client CANNOT inflate its points:
-- the worst it can do is lie about its raw (see the anti-cheat notes in the Edge
-- Function). Each branch also CLAMPS raw into a human-plausible band before
-- computing, so an absurd raw (reaction time of 1 ms, 25 tiles in 0.5 s) cannot
-- yield an impossible score.
--
--   game       raw means                    plausible raw band   points formula
--   ---------- ---------------------------- -------------------- ------------------------------
--   draw       avg reaction ms (lower=better)  [120 .. 3000]     max(100, 1000 - raw)
--   bullseye   accuracy %                      [0 .. 100]        round(120 + raw/100 * 880)
--   numbers    seconds to tap 1..25            [7 .. 120]        clamp(1000 - (raw-9)*42, 120,1000)
--   oddone     tiles found in 30s              [0 .. 45]         clamp(raw*55 + 100, 120,1000)
--   chimp      memory length reached           [0 .. 25]         clamp((raw-3)*140 + 140, 120,1000)
--   quickmath  correct answers in 30s          [0 .. 45]         clamp(raw*45 + 100, 120,1000)
create or replace function public.duel_game_pts(p_game text, p_raw numeric)
returns integer
language sql
immutable
as $$
  select case p_game
    when 'draw'      then greatest(100, round(1000 - greatest(120, least(3000, p_raw))))::int
    when 'bullseye'  then round(120 + (greatest(0, least(100, p_raw)) / 100.0) * 880)::int
    when 'numbers'   then greatest(120, least(1000, round(1000 - (greatest(7, least(120, p_raw)) - 9) * 42)))::int
    when 'oddone'    then greatest(120, least(1000, round(greatest(0, least(45, p_raw)) * 55 + 100)))::int
    when 'chimp'     then greatest(120, least(1000, round((greatest(0, least(25, p_raw)) - 3) * 140 + 140)))::int
    when 'quickmath' then greatest(120, least(1000, round(greatest(0, least(45, p_raw)) * 45 + 100)))::int
    else 0
  end;
$$;


-- ----------------------------------------------------------------------------
-- 6. GAME-ECONOMY TUNABLES — matchmaking band + shield constants
-- ----------------------------------------------------------------------------
-- Pulled out so game-economy can tune them without reading the whole function.
-- Band is multiplicative (0.5x..2x) with an ADDITIVE floor of +/-150 so a low- or
-- zero-point challenger (Season Points start at 0 and, today, don't accumulate
-- across days) still has reachable opponents instead of an empty band [0,0].
-- Implemented as SQL functions so both settle_duel and duelable_targets share ONE
-- definition and can never drift apart.
create or replace function public.duel_band_lo(p_pts integer)
returns integer language sql immutable as $$
  select least( floor(0.5 * p_pts)::int, p_pts - 150 );
$$;
create or replace function public.duel_band_hi(p_pts integer)
returns integer language sql immutable as $$
  select greatest( ceil(2.0 * p_pts)::int, p_pts + 150 );
$$;
-- Max points a defender may lose per rolling 24h across ALL incoming duels.
create or replace function public.duel_shield_cap()
returns integer language sql immutable as $$ select 300; $$;

-- New-player grace: a player can't be dueled until this long after signup, so
-- brand-new accounts can't be farmed instantly. LOWERED to 2 minutes for CLOSED
-- TESTING — every tester is a fresh account, and the original 48h blocked all
-- duels for the whole test. RAISE this back to interval '24 hours' (or '48 hours')
-- before any public launch. Referenced by both duelable_targets and settle_duel.
create or replace function public.duel_grace()
returns interval language sql immutable as $$ select interval '2 minutes'; $$;


-- ----------------------------------------------------------------------------
-- 6b. TIEBREAKER — the secondary metric: bounding + direction
-- ----------------------------------------------------------------------------
-- When a challenger's server-recomputed points EQUAL the defender's snapshot
-- points, the duel is decided by a SECONDARY metric: a FINER measure of the SAME
-- skill than the (rounded/coarse) points. Per game (mirrored from src/App.jsx):
--
--   game       secondary means                          BETTER =   why it's finer
--   ---------- ---------------------------------------- ---------- --------------------------------
--   draw       unrounded avg reaction ms                LOWER      pts round avg ms → equal pts can
--                                                                   hide a faster true average
--   bullseye   unrounded avg accuracy (0..100)          HIGHER     pts round the % → finer accuracy
--   numbers    full-precision completion seconds        LOWER      pts derive from 0.1s-rounded time
--   oddone     ms elapsed to reach the final count      LOWER      same count found faster = better
--   chimp      avg ms per correct recall tap            LOWER      same length recalled faster
--   quickmath  ms elapsed to the last correct answer    LOWER      same count answered faster
--
-- ANTI-CHEAT: the client sends its secondary inside challenger_inputs.secondary
-- (it rides the EXISTING settle-duel payload — no Edge Function change). We do NOT
-- trust it: duel_bound_secondary rejects out-of-band values, and for the three
-- games whose secondary is just the UNROUNDED version of raw it also cross-checks
-- that the secondary is consistent with the (already-bounded) raw. Returns NULL
-- for any implausible / inconsistent / absent value. What we still CANNOT prove
-- (same limit as raw): that a plausible, self-consistent secondary was genuinely
-- achieved — there is no input-trace replay yet. So: absurd secondaries are
-- rejected; a plausible lie is bounded, not eliminated (honest, matches raw).
create or replace function public.duel_bound_secondary(p_game text, p_raw numeric, p_sec numeric)
returns numeric language sql immutable as $$
  select case
    when p_sec is null then null
    -- UNROUNDED-OF-RAW games: must be in band AND round back to the same raw.
    when p_game = 'draw'     and p_sec >= 90 and p_sec <= 5000
                             and abs(round(p_sec) - round(p_raw)) <= 1            then p_sec
    when p_game = 'bullseye' and p_sec >= 0  and p_sec <= 100
                             and abs(round(p_sec) - round(p_raw)) <= 1            then p_sec
    when p_game = 'numbers'  and p_sec >= 5  and p_sec <= 300
                             and abs(round(p_sec * 10) / 10 - p_raw) <= 0.15      then p_sec
    -- TIMING-of-count games: band-checked only (not derivable from raw).
    when p_game = 'oddone'    and p_sec >= 0 and p_sec <= 40000 then p_sec
    when p_game = 'quickmath' and p_sec >= 0 and p_sec <= 40000 then p_sec
    when p_game = 'chimp'     and p_sec >  0 and p_sec <= 60000 then p_sec
    else null
  end;
$$;

-- Compare two ALREADY-BOUNDED (non-null) secondaries. Returns 1 if the challenger
-- is BETTER, -1 if worse, 0 if identical — encoding the per-game direction above so
-- settle_duel and any future caller share ONE definition. Null-handling (absent /
-- rejected secondary, incl. the anti-suppression rule) lives in settle_duel.
create or replace function public.duel_secondary_cmp(p_game text, p_ch numeric, p_def numeric)
returns integer language sql immutable as $$
  select case
    when p_ch is null or p_def is null then 0
    when p_game = 'bullseye' then                              -- HIGHER accuracy is better
      case when p_ch > p_def then 1 when p_ch < p_def then -1 else 0 end
    else                                                       -- everyone else: LOWER (faster) is better
      case when p_ch < p_def then 1 when p_ch > p_def then -1 else 0 end
  end;
$$;


-- ----------------------------------------------------------------------------
-- 7. duelable_targets — who can this challenger duel on game X today?
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER: it reads OTHER players' game_scores + scores, which RLS
-- otherwise forbids. It only ever returns rows to the authenticated caller, and
-- only ELIGIBLE targets, so it never leaks a score the challenger could not
-- already have earned the right to see by challenging. It applies the full
-- eligibility rule set so the UI can grey out / hide non-selectable players:
--   * has a same-day score for this game (the snapshot to beat)
--   * inside the matchmaking band
--   * NOT within 48h new-player grace, and HAS completed at least one daily run
--   * NOT fully shielded (still has budget under the 300/24h cap)
--   * NOT already hit by THIS challenger in the last 24h
--   * has > 0 points (nothing to steal from a floored target)
create or replace function public.duelable_targets(
  p_game text,
  p_day text,
  p_season text,
  p_limit int default 40
)
returns table(
  defender_id    uuid,
  name           text,
  avatar         text,
  pts            integer,
  snapshot_pts   integer,
  snapshot_label text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenger uuid := auth.uid();
  v_ch_pts     integer;
  v_lo         integer;
  v_hi         integer;
begin
  if v_challenger is null then
    return; -- unauthenticated → empty set
  end if;

  select coalesce(season_pts, 0) into v_ch_pts
    from public.scores where profile_id = v_challenger and season = p_season;
  v_ch_pts := coalesce(v_ch_pts, 0);
  v_lo := public.duel_band_lo(v_ch_pts);
  v_hi := public.duel_band_hi(v_ch_pts);

  return query
  with latest as (
    -- the defender's MOST RECENT same-day score for this game
    select distinct on (gs.profile_id) gs.profile_id, gs.pts, gs.label
    from public.game_scores gs
    where gs.game_id = p_game and gs.day = p_day
    order by gs.profile_id, gs.created_at desc
  )
  select
    p.id,
    p.nickname::text,
    p.avatar,
    coalesce(s.season_pts, 0),
    l.pts,
    l.label
  from latest l
  join public.profiles p on p.id = l.profile_id
  join public.scores   s on s.profile_id = p.id and s.season = p_season
  where p.id <> v_challenger
    and coalesce(s.season_pts, 0) between v_lo and v_hi
    and coalesce(s.season_pts, 0) > 0
    and now() >= p.created_at + public.duel_grace()
    and exists (select 1 from public.daily_runs dr where dr.profile_id = p.id)
    and (
      public.duel_shield_cap() - coalesce((
        select sum(d.transferred_amount) from public.duels d
        where d.defender_id = p.id and d.status = 'settled'
          and d.outcome = 'challenger_win'
          and d.created_at > now() - interval '24 hours'
      ), 0)
    ) > 0
    and not exists (
      select 1 from public.duels d2
      where d2.challenger_id = v_challenger and d2.defender_id = p.id
        and d2.status = 'settled'
        and d2.created_at > now() - interval '24 hours'
    )
  order by coalesce(s.season_pts, 0) desc
  limit p_limit;
end;
$$;


-- ----------------------------------------------------------------------------
-- 8. settle_duel — the atomic, server-authoritative heart of the whole feature
-- ----------------------------------------------------------------------------
-- Called by the settle-duel Edge Function with the CHALLENGER's JWT (so auth.uid()
-- is the challenger). SECURITY DEFINER so it can read the defender's score and
-- move BOTH players' points, which RLS forbids to normal callers. Everything below
-- runs in ONE transaction (a plpgsql function is one transaction), so the snapshot
-- read, the floor/shield math, the point moves, and the audit row are atomic — a
-- client cannot race two duels through the gap.
--
-- CONCURRENCY: the very first thing it does is SELECT ... FOR UPDATE the DEFENDER's
-- score row. That serializes every incoming duel against the same defender, so the
-- rolling-24h shield sum and the floor can never be double-spent by two concurrent
-- attackers. (Same-challenger concurrency is a non-issue at closed-testing scale:
-- the client fires one duel at a time behind a 20s cooldown.)
--
-- IT NEVER TRUSTS CLIENT POINTS. It recomputes the challenger's points from p_raw
-- via duel_game_pts, and decides the winner itself. The client's job is only to
-- report its raw performance; the Edge Function bounds that before we ever get here.
create or replace function public.settle_duel(
  p_defender uuid,
  p_game     text,
  p_day      text,
  p_season   text,
  p_stake    integer,
  p_raw      numeric,
  p_inputs   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenger  uuid := auth.uid();
  v_now         timestamptz := now();
  v_ch_pts      integer;
  v_def_pts     integer;
  v_def_created timestamptz;
  v_has_run     boolean;
  v_snap_pts    integer;
  v_snap_label  text;
  v_snap_raw    numeric;
  v_snap_sec    numeric;
  v_ch_sec      numeric;
  v_def_sec     numeric;
  v_cmp         integer;
  v_points_tie  boolean := false;
  v_is_tie      boolean := false;
  v_server_pts  integer;
  v_won         boolean;
  v_lost_24h    integer;
  v_remaining   integer;
  v_transferred integer := 0;
  v_ch_name     text;
  v_ch_avatar   text;
  v_duel_id     uuid;
  v_lo          integer;
  v_hi          integer;
  v_outcome     text;
begin
  -- --- guards -------------------------------------------------------------
  if v_challenger is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_defender = v_challenger then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;
  if p_stake not in (50, 100, 200) then
    return jsonb_build_object('ok', false, 'error', 'bad_stake');
  end if;

  -- --- lock the defender's score row (serializes incoming duels) -----------
  select season_pts into v_def_pts
    from public.scores
    where profile_id = p_defender and season = p_season
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_target_score');
  end if;

  -- --- challenger's current points ----------------------------------------
  select coalesce(season_pts, 0) into v_ch_pts
    from public.scores where profile_id = v_challenger and season = p_season;
  v_ch_pts := coalesce(v_ch_pts, 0);

  -- --- matchmaking band ---------------------------------------------------
  v_lo := public.duel_band_lo(v_ch_pts);
  v_hi := public.duel_band_hi(v_ch_pts);
  if v_def_pts < v_lo or v_def_pts > v_hi then
    return jsonb_build_object('ok', false, 'error', 'out_of_band');
  end if;

  -- --- new-player grace ---------------------------------------------------
  -- Shielded while within 48h of signup OR before their first completed daily
  -- run (whichever is later): a target only becomes duelable once BOTH the 48h
  -- has elapsed AND they have at least one recorded run.
  select created_at into v_def_created from public.profiles where id = p_defender;
  select exists(select 1 from public.daily_runs where profile_id = p_defender) into v_has_run;
  if v_now < v_def_created + public.duel_grace() or not v_has_run then
    return jsonb_build_object('ok', false, 'error', 'graced');
  end if;

  -- --- per-pair 24h cooldown ---------------------------------------------
  if exists (
    select 1 from public.duels
    where challenger_id = v_challenger and defender_id = p_defender
      and status = 'settled' and created_at > v_now - interval '24 hours'
  ) then
    return jsonb_build_object('ok', false, 'error', 'pair_cooldown');
  end if;

  -- --- defender snapshot: latest same-day score for this game -------------
  -- raw + secondary come along too so the tiebreaker can be settled server-side.
  select gs.pts, gs.label, gs.raw, gs.secondary
    into v_snap_pts, v_snap_label, v_snap_raw, v_snap_sec
    from public.game_scores gs
    where gs.profile_id = p_defender and gs.game_id = p_game and gs.day = p_day
    order by gs.created_at desc
    limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_target_score');
  end if;

  -- --- SERVER-AUTHORITATIVE score + verdict ------------------------------
  -- Points are recomputed from raw (never trusted from the client). On an EXACT
  -- points tie we break it by the secondary metric (see §6b). Both secondaries are
  -- bounded/validated before use; the challenger's rides in through p_inputs.
  v_server_pts := public.duel_game_pts(p_game, p_raw);
  v_ch_sec  := public.duel_bound_secondary(p_game, p_raw,      (p_inputs->>'secondary')::numeric);
  v_def_sec := public.duel_bound_secondary(p_game, v_snap_raw, v_snap_sec);

  if v_server_pts > v_snap_pts then
    v_won := true;  v_outcome := 'challenger_win';
  elsif v_server_pts < v_snap_pts then
    v_won := false; v_outcome := 'defender_win';
  else
    -- POINTS TIE → decide on the secondary metric.
    v_points_tie := true;
    if v_def_sec is null then
      -- No comparable defender secondary (legacy row / no finer signal): we cannot
      -- fairly break the tie, so it is a genuine push. Don't punish the challenger
      -- for the defender's missing data.
      v_cmp := 0;
    elsif v_ch_sec is null then
      -- Challenger's secondary is absent or implausible while the defender's is
      -- valid → challenger LOSES the tiebreak. This closes the suppression exploit
      -- (omit/garble your secondary on a points tie to force a free push).
      v_cmp := -1;
    else
      v_cmp := public.duel_secondary_cmp(p_game, v_ch_sec, v_def_sec);
    end if;

    if v_cmp > 0 then
      v_won := true;  v_outcome := 'challenger_win';
    elsif v_cmp < 0 then
      v_won := false; v_outcome := 'defender_win';
    else
      -- Dead heat: identical points AND identical (or incomparable) secondary.
      -- PUSH — no points move, no notification, and the client refunds the duel.
      v_is_tie := true; v_won := false; v_outcome := 'tie';
    end if;
  end if;

  if v_outcome = 'challenger_win' then
    -- Shield budget: at most 300 may leave a defender per rolling 24h.
    select coalesce(sum(transferred_amount), 0) into v_lost_24h
      from public.duels
      where defender_id = p_defender and status = 'settled'
        and outcome = 'challenger_win'
        and created_at > v_now - interval '24 hours';
    v_remaining := greatest(0, public.duel_shield_cap() - v_lost_24h);

    -- Amount moved = min(stake, defender's current points [floor at 0], remaining
    -- shield budget). Can be PARTIAL, or 0 if a race let the target get shielded
    -- between selection and settle.
    v_transferred := greatest(0, least(p_stake, v_def_pts, v_remaining));

    -- Zero-sum: defender loses exactly what the challenger gains.
    update public.scores
      set season_pts = season_pts - v_transferred, updated_at = v_now
      where profile_id = p_defender and season = p_season;
    insert into public.scores (profile_id, season, season_pts, updated_at)
      values (v_challenger, p_season, v_ch_pts + v_transferred, v_now)
      on conflict (profile_id, season) do update
        set season_pts = public.scores.season_pts + v_transferred, updated_at = v_now;

    v_outcome := 'challenger_win';
  elsif v_outcome = 'defender_win' then
    -- LOSS handling. The approved brief specifies only the WIN transfer. To keep
    -- the economy zero-sum and match the existing client's symmetric +/-stake,
    -- the challenger forfeits the stake to the defender, floored at the
    -- challenger's own 0. >>> FLAGGED for game-economy sign-off (see report). <<<
    v_transferred := greatest(0, least(p_stake, v_ch_pts));
    update public.scores
      set season_pts = season_pts - v_transferred, updated_at = v_now
      where profile_id = v_challenger and season = p_season;
    update public.scores
      set season_pts = season_pts + v_transferred, updated_at = v_now
      where profile_id = p_defender and season = p_season;
    v_outcome := 'defender_win';
  else
    -- PUSH (outcome = 'tie'): equal points AND equal/incomparable secondary. No
    -- points move at all — the audit row below still records the encounter (which
    -- keeps the per-pair 24h cooldown honest, so a draw can't be re-rolled for
    -- free), but the client is told to REFUND the daily duel so a no-op doesn't
    -- cost a try. Zero-sum holds trivially: nothing changed hands.
    v_transferred := 0;
  end if;

  -- --- audit row ----------------------------------------------------------
  insert into public.duels (
    challenger_id, defender_id, game_id, day, stake,
    defender_score_snapshot, challenger_inputs, server_pts,
    status, outcome, transferred_amount, created_at
  ) values (
    v_challenger, p_defender, p_game, p_day, p_stake,
    v_snap_pts, coalesce(p_inputs, '{}'::jsonb), v_server_pts,
    'settled', v_outcome, v_transferred, v_now
  ) returning id into v_duel_id;

  -- --- defender notification ---------------------------------------------
  -- The defender is passive in the async model, so notifications are the ONLY
  -- record their client can see of a duel that touched their points — and the
  -- client mirrors these into its Season Points so a re-save cannot revert the
  -- server's transfer (see src/App.jsx reconcileIncoming). We therefore write a
  -- notification on BOTH point-moving outcomes, with DISTINCT types so the client
  -- can sum them with the right SIGN:
  --   * 'duel_lost'     → the attacker BEAT the defender's recorded score and took
  --                       points (defender −). Already existed.
  --   * 'duel_defended' → the attacker CHALLENGED but LOST; the defender passively
  --                       won the forfeited stake (defender +). Without this the
  --                       defender's gain is invisible to their client and their
  --                       next saveScore reverts it, destroying the attacker's
  --                       forfeited stake (a zero-sum break). Confirmed economics:
  --                       symmetric loss model — challenger forfeits stake to the
  --                       defender.
  if v_outcome = 'challenger_win' and v_transferred > 0 then
    select nickname::text, avatar into v_ch_name, v_ch_avatar
      from public.profiles where id = v_challenger;
    insert into public.notifications (profile_id, type, payload, created_at)
    values (p_defender, 'duel_lost', jsonb_build_object(
      'attacker_name',   v_ch_name,
      'attacker_avatar', v_ch_avatar,
      'game',            p_game,
      'points',          v_transferred,
      'partial',         (v_transferred < p_stake),
      'new_balance',     v_def_pts - v_transferred,
      'duel_id',         v_duel_id
    ), v_now);
  elsif v_outcome = 'defender_win' and v_transferred > 0 then
    select nickname::text, avatar into v_ch_name, v_ch_avatar
      from public.profiles where id = v_challenger;
    insert into public.notifications (profile_id, type, payload, created_at)
    values (p_defender, 'duel_defended', jsonb_build_object(
      'attacker_name',   v_ch_name,
      'attacker_avatar', v_ch_avatar,
      'game',            p_game,
      'points',          v_transferred,
      'new_balance',     v_def_pts + v_transferred,
      'duel_id',         v_duel_id
    ), v_now);
  end if;

  return jsonb_build_object(
    'ok',             true,
    'duel_id',        v_duel_id,
    'won',            v_won,
    'server_pts',     v_server_pts,
    'defender_pts',   v_snap_pts,
    'defender_label', v_snap_label,
    'stake',          p_stake,
    'transferred',    v_transferred,
    'partial',        (v_won and v_transferred < p_stake),
    'outcome',        v_outcome,
    -- tiebreaker signalling for the client's result screen:
    'points_tie',     v_points_tie,     -- true when points were equal and the secondary decided it
    'tie',            v_is_tie,         -- true only on an EXACT push (refund the duel, no transfer)
    'ch_secondary',   v_ch_sec,         -- the validated secondaries (display/debug)
    'def_secondary',  v_def_sec
  );
end;
$$;


-- ----------------------------------------------------------------------------
-- 9. Grants
-- ----------------------------------------------------------------------------
-- The two cross-player functions are callable by any (even anonymous) logged-in
-- player; they enforce their own rules and only ever act for / return data to the
-- authenticated caller. duel_game_pts / band / shield helpers are pure and safe.
--
-- SEAM FOR THE NEXT HARDENING PASS: once the client emits a full input trace and
-- the Edge Function replays it, lock settle_duel down to service_role only and
-- have the Edge Function call it with the service key + a verified challenger id,
-- so the ONLY way to settle is through the validating function. For now, calling
-- settle_duel directly gains a cheater nothing the Edge Function does not already
-- bound (points are recomputed from raw here regardless of entry point).
revoke all on function public.settle_duel(uuid, text, text, text, integer, numeric, jsonb) from public;
grant execute on function public.settle_duel(uuid, text, text, text, integer, numeric, jsonb) to authenticated, anon;

revoke all on function public.duelable_targets(text, text, text, int) from public;
grant execute on function public.duelable_targets(text, text, text, int) to authenticated, anon;

grant execute on function public.duel_game_pts(text, numeric) to authenticated, anon;
grant execute on function public.duel_bound_secondary(text, numeric, numeric) to authenticated, anon;
grant execute on function public.duel_secondary_cmp(text, numeric, numeric) to authenticated, anon;
grant execute on function public.duel_band_lo(integer) to authenticated, anon;
grant execute on function public.duel_band_hi(integer) to authenticated, anon;
grant execute on function public.duel_shield_cap() to authenticated, anon;


-- ============================================================================
-- DONE. After running this the backend can: index per-game daily scores, list
-- duelable targets for a challenger, and SETTLE a duel server-side (recompute the
-- score, enforce shield/floor/cooldown/band, move points atomically, notify the
-- defender) — none of it forgeable by the client. The settle-duel Edge Function
-- (supabase/functions/settle-duel) is the front door; deploy it too (see
-- DUELS_SETUP.md).
-- ============================================================================
