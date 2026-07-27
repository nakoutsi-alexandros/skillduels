-- ============================================================================
-- Skill Duels — Migration 004: server-authoritative scores
-- Run after schema.sql, 002_daily_runs.sql and 003_duels.sql.
-- ============================================================================

-- The browser may read its balance, but it must never submit a total directly.
drop policy if exists scores_insert_own on public.scores;
drop policy if exists scores_update_own on public.scores;
drop policy if exists scores_delete_own on public.scores;
revoke insert, update, delete on table public.scores from anon, authenticated;
grant select on table public.scores to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'scores_nonnegative'
  ) then
    alter table public.scores
      add constraint scores_nonnegative check (season_pts >= 0) not valid;
  end if;
end;
$$;

-- A daily game is also written through a validating RPC. Keeping direct INSERT
-- permission would let a modified client forge pts and create unlimited rows.
drop policy if exists game_scores_insert_own on public.game_scores;
revoke insert, update, delete on table public.game_scores from anon, authenticated;
grant select on table public.game_scores to anon, authenticated;

create table if not exists public.daily_bonus_claims (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day        text not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, day)
);

alter table public.daily_bonus_claims enable row level security;
drop policy if exists daily_bonus_claims_select_own on public.daily_bonus_claims;
create policy daily_bonus_claims_select_own on public.daily_bonus_claims
  for select using (auth.uid() = profile_id);
revoke insert, update, delete on table public.daily_bonus_claims from anon, authenticated;
grant select on table public.daily_bonus_claims to anon, authenticated;

-- Shared defence-in-depth. The Edge Function performs the same validation, but
-- this check also protects direct RPC calls.
create or replace function public.duel_raw_is_plausible(p_game text, p_raw numeric)
returns boolean
language sql
immutable
as $$
  select p_raw is not null and case p_game
    when 'draw'      then p_raw between 90 and 5000
    when 'bullseye'  then p_raw between 0 and 100
    when 'numbers'   then p_raw between 5 and 300
    when 'oddone'    then p_raw between 0 and 45
    when 'chimp'     then p_raw between 0 and 25
    when 'quickmath' then p_raw between 0 and 45
    else false
  end;
$$;

create or replace function public.get_my_season_score(p_season text)
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce((
    select season_pts
      from public.scores
      where profile_id = auth.uid() and season = p_season
  ), 0);
$$;

create or replace function public.record_game_score(
  p_game      text,
  p_day       text,
  p_season    text,
  p_raw       numeric,
  p_label     text,
  p_secondary numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_pts       integer;
  v_balance   integer;
  v_existing  public.game_scores%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_day <> to_char(current_date, 'YYYY-MM-DD')
     or p_season <> to_char(current_date, 'YYYY-MM') then
    return jsonb_build_object('ok', false, 'error', 'wrong_period');
  end if;
  if not public.duel_raw_is_plausible(p_game, p_raw) then
    return jsonb_build_object('ok', false, 'error', 'implausible_raw');
  end if;

  -- One scored attempt per player/game/day, including concurrent requests.
  perform pg_advisory_xact_lock(
    hashtextextended(v_uid::text || ':' || p_game || ':' || p_day, 0)
  );
  select * into v_existing
    from public.game_scores
    where profile_id = v_uid and game_id = p_game and day = p_day
    order by created_at desc
    limit 1;
  if found then
    select coalesce(season_pts, 0) into v_balance
      from public.scores where profile_id = v_uid and season = p_season;
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'points', v_existing.pts,
      'balance', coalesce(v_balance, 0)
    );
  end if;

  v_pts := public.duel_game_pts(p_game, p_raw);
  insert into public.game_scores (
    profile_id, game_id, day, raw, pts, label, secondary
  ) values (
    v_uid,
    p_game,
    p_day,
    p_raw,
    v_pts,
    left(coalesce(p_label, ''), 64),
    public.duel_bound_secondary(p_game, p_raw, p_secondary)
  );

  insert into public.scores (profile_id, season, season_pts, updated_at)
    values (v_uid, p_season, v_pts, now())
    on conflict (profile_id, season) do update
      set season_pts = public.scores.season_pts + excluded.season_pts,
          updated_at = now()
    returning season_pts into v_balance;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'points', v_pts,
    'balance', v_balance
  );
end;
$$;

create or replace function public.claim_daily_bonus(p_day text, p_season text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_inserted integer := 0;
  v_balance  integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_day <> to_char(current_date, 'YYYY-MM-DD')
     or p_season <> to_char(current_date, 'YYYY-MM') then
    return jsonb_build_object('ok', false, 'error', 'wrong_period');
  end if;

  insert into public.daily_bonus_claims (profile_id, day)
    values (v_uid, p_day)
    on conflict (profile_id, day) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    insert into public.scores (profile_id, season, season_pts, updated_at)
      values (v_uid, p_season, 50, now())
      on conflict (profile_id, season) do update
        set season_pts = public.scores.season_pts + 50,
            updated_at = now()
      returning season_pts into v_balance;
  else
    select coalesce(season_pts, 0) into v_balance
      from public.scores where profile_id = v_uid and season = p_season;
  end if;

  return jsonb_build_object(
    'ok', true,
    'claimed', v_inserted = 1,
    'points', case when v_inserted = 1 then 50 else 0 end,
    'balance', coalesce(v_balance, 0)
  );
end;
$$;

revoke all on function public.get_my_season_score(text) from public;
revoke all on function public.record_game_score(text, text, text, numeric, text, numeric) from public;
revoke all on function public.claim_daily_bonus(text, text) from public;

grant execute on function public.get_my_season_score(text) to anon, authenticated;
grant execute on function public.record_game_score(text, text, text, numeric, text, numeric) to anon, authenticated;
grant execute on function public.claim_daily_bonus(text, text) to anon, authenticated;

-- Existing scores are preserved. If the database was publicly tested before this
-- migration, review unusually high balances once because past client-written
-- totals cannot be distinguished from legitimate historical values.
