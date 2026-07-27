-- ============================================================================
-- Skill Duels — Migration 007: coin economy rebalance
-- Run after 006_game_attempts.sql.
-- ============================================================================
-- A complete six-game daily run should award roughly 180–220 coins:
--   * performance: 5–20 coins per game
--   * reward drop: weighted 5–50 coins per game
-- Existing balances and transactions are preserved. The new values apply only
-- to rewards that have not already been claimed.

create or replace function public.claim_game_coins(p_game text, p_day text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_pts      integer;
  v_amount   integer;
  v_balance  integer;
  v_key      text;
  v_existing integer;
begin
  if p_day <> to_char(current_date, 'YYYY-MM-DD')
     or p_game not in ('draw', 'bullseye', 'numbers', 'oddone', 'chimp', 'quickmath') then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;

  select pts into v_pts
    from public.game_scores
    where profile_id = v_uid and game_id = p_game and day = p_day
    order by created_at desc limit 1;
  if v_pts is null then
    return jsonb_build_object('ok', false, 'error', 'score_missing');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wallet:' || v_uid::text, 0));
  perform public.ensure_my_wallet();
  v_key := 'game:' || p_day || ':' || p_game;

  select delta into v_existing from public.coin_transactions
    where profile_id = v_uid and source_key = v_key;
  if found then
    select coin_balance into v_balance from public.wallets where profile_id = v_uid;
    return jsonb_build_object(
      'ok', true, 'claimed', false, 'amount', v_existing, 'coins', v_balance
    );
  end if;

  -- Reward performance without letting one game buy a premium cosmetic.
  v_amount := greatest(5, least(20, round(v_pts::numeric / 50)::integer));
  update public.wallets
    set coin_balance = coin_balance + v_amount, updated_at = now()
    where profile_id = v_uid
    returning coin_balance into v_balance;
  insert into public.coin_transactions (
    profile_id, source_key, delta, balance_after, metadata
  ) values (
    v_uid, v_key, v_amount, v_balance,
    jsonb_build_object('game', p_game, 'day', p_day, 'points', v_pts)
  );

  return jsonb_build_object(
    'ok', true, 'claimed', true, 'amount', v_amount, 'coins', v_balance
  );
end;
$$;

create or replace function public.claim_reward_drop(
  p_source text,
  p_game text,
  p_day text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_amount   integer;
  v_balance  integer;
  v_key      text;
  v_existing integer;
  v_valid    boolean := false;
  -- Mean 16.25 coins. The 50-coin jackpot has an 8.3% chance.
  v_amounts  integer[] := array[5, 5, 5, 10, 10, 10, 15, 15, 20, 25, 25, 50];
begin
  if p_day <> to_char(current_date, 'YYYY-MM-DD') then
    return jsonb_build_object('ok', false, 'error', 'wrong_period');
  end if;

  if p_source = 'game'
     and p_game in ('draw', 'bullseye', 'numbers', 'oddone', 'chimp', 'quickmath') then
    select exists(
      select 1 from public.game_scores
      where profile_id = v_uid and game_id = p_game and day = p_day
    ) into v_valid;
    v_key := 'drop:game:' || p_day || ':' || p_game;
  elsif p_source = 'daily_bonus' then
    select exists(
      select 1 from public.daily_bonus_claims
      where profile_id = v_uid and day = p_day
    ) into v_valid;
    v_key := 'drop:daily_bonus:' || p_day;
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;

  if not v_valid then
    return jsonb_build_object('ok', false, 'error', 'source_missing');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wallet:' || v_uid::text, 0));
  perform public.ensure_my_wallet();
  select delta into v_existing from public.coin_transactions
    where profile_id = v_uid and source_key = v_key;
  if found then
    select coin_balance into v_balance from public.wallets where profile_id = v_uid;
    return jsonb_build_object(
      'ok', true, 'claimed', false, 'amount', v_existing, 'coins', v_balance
    );
  end if;

  v_amount := v_amounts[1 + floor(random() * array_length(v_amounts, 1))::integer];
  update public.wallets
    set coin_balance = coin_balance + v_amount, updated_at = now()
    where profile_id = v_uid
    returning coin_balance into v_balance;
  insert into public.coin_transactions (
    profile_id, source_key, delta, balance_after, metadata
  ) values (
    v_uid, v_key, v_amount, v_balance,
    jsonb_build_object('source', p_source, 'game', p_game, 'day', p_day)
  );

  return jsonb_build_object(
    'ok', true, 'claimed', true, 'amount', v_amount, 'coins', v_balance
  );
end;
$$;

revoke all on function public.claim_game_coins(text, text) from public;
revoke all on function public.claim_reward_drop(text, text, text) from public;
grant execute on function public.claim_game_coins(text, text) to anon, authenticated;
grant execute on function public.claim_reward_drop(text, text, text) to anon, authenticated;
