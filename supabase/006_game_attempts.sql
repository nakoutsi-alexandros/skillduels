-- ============================================================================
-- Skill Duels — Migration 006: server-issued, single-use game attempts
-- Run after 005_wallet_inventory.sql, before deploying updated Edge/client.
-- ============================================================================

create table if not exists public.game_attempts (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  game_id      text not null check (
    game_id in ('draw', 'bullseye', 'numbers', 'oddone', 'chimp', 'quickmath')
  ),
  mode         text not null check (mode in ('daily', 'duel')),
  day          text not null,
  season       text not null,
  defender_id  uuid references public.profiles (id) on delete cascade,
  seed         bigint not null check (seed between 0 and 4294967295),
  started_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  input_trace  jsonb not null default '{}'::jsonb
);

create index if not exists game_attempts_owner_idx
  on public.game_attempts (profile_id, day, started_at desc);

alter table public.game_scores
  add column if not exists attempt_id uuid references public.game_attempts (id);
alter table public.duels
  add column if not exists attempt_id uuid references public.game_attempts (id);

create unique index if not exists game_scores_attempt_unique
  on public.game_scores (attempt_id) where attempt_id is not null;
create unique index if not exists duels_attempt_unique
  on public.duels (attempt_id) where attempt_id is not null;

alter table public.game_attempts enable row level security;
drop policy if exists game_attempts_select_own on public.game_attempts;
create policy game_attempts_select_own on public.game_attempts
  for select using (auth.uid() = profile_id);
revoke insert, update, delete on table public.game_attempts from anon, authenticated;
grant select on table public.game_attempts to anon, authenticated;

create or replace function public.start_game_attempt(
  p_game text,
  p_mode text,
  p_day text,
  p_season text,
  p_defender uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_id      uuid;
  v_seed    bigint;
  v_expires timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_game not in ('draw', 'bullseye', 'numbers', 'oddone', 'chimp', 'quickmath')
     or p_mode not in ('daily', 'duel') then
    return jsonb_build_object('ok', false, 'error', 'invalid_attempt');
  end if;
  if p_day <> to_char(current_date, 'YYYY-MM-DD')
     or p_season <> to_char(current_date, 'YYYY-MM') then
    return jsonb_build_object('ok', false, 'error', 'wrong_period');
  end if;
  if p_mode = 'daily' and p_defender is not null then
    return jsonb_build_object('ok', false, 'error', 'invalid_attempt');
  end if;
  if p_mode = 'duel' and (p_defender is null or p_defender = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'invalid_attempt');
  end if;
  if p_mode = 'daily' and exists (
    select 1 from public.game_scores
    where profile_id = v_uid and game_id = p_game and day = p_day
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_scored');
  end if;
  if p_mode = 'duel' and not exists (
    select 1 from public.game_scores
    where profile_id = p_defender and game_id = p_game and day = p_day
  ) then
    return jsonb_build_object('ok', false, 'error', 'no_target_score');
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('attempt-limit:' || v_uid::text || ':' || p_day, 0)
  );
  if (
    select count(*) >= 40 from public.game_attempts
    where profile_id = v_uid and day = p_day
  ) then
    return jsonb_build_object('ok', false, 'error', 'attempt_limit');
  end if;

  v_seed := floor(random() * 4294967296)::bigint;
  v_expires := now() + case when p_mode = 'duel' then interval '10 minutes'
                            else interval '15 minutes' end;
  insert into public.game_attempts (
    profile_id, game_id, mode, day, season, defender_id, seed, expires_at
  ) values (
    v_uid, p_game, p_mode, p_day, p_season, p_defender, v_seed, v_expires
  ) returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'attempt_id', v_id,
    'seed', v_seed,
    'expires_at', v_expires
  );
end;
$$;

create or replace function public.consume_game_attempt(
  p_attempt uuid,
  p_game text,
  p_mode text,
  p_day text,
  p_season text,
  p_defender uuid,
  p_inputs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_attempt public.game_attempts%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_attempt is null or pg_column_size(coalesce(p_inputs, '{}'::jsonb)) > 16384 then
    return jsonb_build_object('ok', false, 'error', 'invalid_attempt');
  end if;

  select * into v_attempt from public.game_attempts
    where id = p_attempt and profile_id = v_uid
    for update;
  if not found
     or v_attempt.game_id <> p_game
     or v_attempt.mode <> p_mode
     or v_attempt.day <> p_day
     or v_attempt.season <> p_season
     or v_attempt.defender_id is distinct from p_defender then
    return jsonb_build_object('ok', false, 'error', 'invalid_attempt');
  end if;
  if v_attempt.consumed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'attempt_used');
  end if;
  if now() > v_attempt.expires_at then
    return jsonb_build_object('ok', false, 'error', 'attempt_expired');
  end if;
  -- Blocks impossible instant submissions while leaving game-specific replay
  -- validation to the trace-verification layer.
  if now() < v_attempt.started_at + interval '250 milliseconds' then
    return jsonb_build_object('ok', false, 'error', 'attempt_too_fast');
  end if;

  update public.game_attempts
    set consumed_at = now(),
        input_trace = coalesce(p_inputs, '{}'::jsonb)
    where id = p_attempt;
  return jsonb_build_object('ok', true, 'seed', v_attempt.seed);
end;
$$;

create or replace function public.record_game_score(
  p_attempt   uuid,
  p_game      text,
  p_day       text,
  p_season    text,
  p_raw       numeric,
  p_label     text,
  p_secondary numeric,
  p_inputs    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check  jsonb;
  v_result jsonb;
begin
  v_check := public.consume_game_attempt(
    p_attempt, p_game, 'daily', p_day, p_season, null, p_inputs
  );
  if not coalesce((v_check->>'ok')::boolean, false) then
    return v_check;
  end if;

  v_result := public.record_game_score(
    p_game, p_day, p_season, p_raw, p_label, p_secondary
  );
  if coalesce((v_result->>'ok')::boolean, false)
     and not coalesce((v_result->>'duplicate')::boolean, false) then
    update public.game_scores set attempt_id = p_attempt
      where id = (
        select id from public.game_scores
        where profile_id = auth.uid() and game_id = p_game and day = p_day
        order by created_at desc limit 1
      ) and attempt_id is null;
  end if;
  return v_result;
end;
$$;

create or replace function public.settle_duel(
  p_attempt  uuid,
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
  v_check  jsonb;
  v_result jsonb;
  v_duel   uuid;
begin
  v_check := public.consume_game_attempt(
    p_attempt, p_game, 'duel', p_day, p_season, p_defender, p_inputs
  );
  if not coalesce((v_check->>'ok')::boolean, false) then
    return v_check;
  end if;

  v_result := public.settle_duel(
    p_defender, p_game, p_day, p_season, p_stake, p_raw, p_inputs
  );
  if coalesce((v_result->>'ok')::boolean, false) then
    v_duel := nullif(v_result->>'duel_id', '')::uuid;
    update public.duels set attempt_id = p_attempt
      where id = v_duel and attempt_id is null;
  end if;
  return v_result;
end;
$$;

revoke all on function public.start_game_attempt(text, text, text, text, uuid) from public;
revoke all on function public.consume_game_attempt(uuid, text, text, text, text, uuid, jsonb) from public;
revoke all on function public.record_game_score(uuid, text, text, text, numeric, text, numeric, jsonb) from public;
revoke all on function public.settle_duel(uuid, uuid, text, text, text, integer, numeric, jsonb) from public;

-- Old endpoints are no longer public: every scored action needs an attempt ID.
revoke all on function public.record_game_score(text, text, text, numeric, text, numeric) from anon, authenticated;
revoke all on function public.settle_duel(uuid, text, text, text, integer, numeric, jsonb) from anon, authenticated;

grant execute on function public.start_game_attempt(text, text, text, text, uuid) to anon, authenticated;
grant execute on function public.record_game_score(uuid, text, text, text, numeric, text, numeric, jsonb) to anon, authenticated;
grant execute on function public.settle_duel(uuid, uuid, text, text, text, integer, numeric, jsonb) to anon, authenticated;
