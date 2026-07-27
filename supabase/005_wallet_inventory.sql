-- ============================================================================
-- Skill Duels — Migration 005: server-authoritative wallet + inventory
-- Run after 004_security_hardening.sql.
-- ============================================================================

create table if not exists public.shop_catalog (
  item_id    text primary key,
  item_type  text not null check (item_type in ('avatar', 'frame')),
  coin_cost  integer not null check (coin_cost >= 0),
  active     boolean not null default true
);

insert into public.shop_catalog (item_id, item_type, coin_cost) values
  ('av_sprout', 'avatar', 120),
  ('av_beefae', 'avatar', 140),
  ('av_moth', 'avatar', 160),
  ('av_seahorse', 'avatar', 180),
  ('av_potion', 'avatar', 200),
  ('av_orb', 'avatar', 220),
  ('av_comet', 'avatar', 240),
  ('av_mushroom', 'avatar', 260),
  ('av_cactusmage', 'avatar', 280),
  ('av_wizard', 'avatar', 300),
  ('av_reaper', 'avatar', 320),
  ('av_lavacup', 'avatar', 350),
  ('av_bluebun', 'avatar', 350),
  ('av_tomatocomet', 'avatar', 350),
  ('av_ninjastar', 'avatar', 350),
  ('av_ghostwiz', 'avatar', 500),
  ('av_acornknight', 'avatar', 500),
  ('av_crystalcac', 'avatar', 500),
  ('av_frogmage', 'avatar', 650),
  ('av_catmask', 'avatar', 650),
  ('av_mintwitch', 'avatar', 650),
  ('av_stormcloud', 'avatar', 650),
  ('av_moongolem', 'avatar', 800),
  ('av_battlebot', 'avatar', 800),
  ('av_pinkbot', 'avatar', 800),
  ('av_frostflask', 'avatar', 800),
  ('av_coralaxo', 'avatar', 1100),
  ('av_sugarskull', 'avatar', 1100),
  ('av_galaxyslime', 'avatar', 1300),
  ('av_sushidragon', 'avatar', 1300),
  ('av_eyeegg', 'avatar', 1500),
  ('av_mossalch', 'avatar', 1600),
  ('av_origami', 'avatar', 1700),
  ('av_sungolem', 'avatar', 1800),
  ('av_jellymonk', 'avatar', 1900),
  ('av_mimicbard', 'avatar', 2000),
  ('av_candlemoth', 'avatar', 2100),
  ('av_koioracle', 'avatar', 2200),
  ('av_radish', 'avatar', 2300),
  ('av_glassowl', 'avatar', 2400),
  ('av_volcano', 'avatar', 2500),
  ('fr_ocean', 'frame', 1200),
  ('fr_aurora', 'frame', 1600),
  ('fr_magma', 'frame', 2000),
  ('fr_void', 'frame', 2600)
on conflict (item_id) do update
  set item_type = excluded.item_type,
      coin_cost = excluded.coin_cost;

create table if not exists public.wallets (
  profile_id       uuid primary key references public.profiles (id) on delete cascade,
  coin_balance     integer not null default 0 check (coin_balance >= 0),
  equipped_avatar  text references public.shop_catalog (item_id) on delete set null,
  equipped_frame   text references public.shop_catalog (item_id) on delete set null,
  updated_at       timestamptz not null default now()
);

create table if not exists public.inventory (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  item_id     text not null references public.shop_catalog (item_id),
  source      text not null default 'shop',
  acquired_at timestamptz not null default now(),
  primary key (profile_id, item_id)
);

create table if not exists public.coin_transactions (
  id            bigint generated always as identity primary key,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  source_key    text not null,
  delta         integer not null check (delta <> 0),
  balance_after integer not null check (balance_after >= 0),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (profile_id, source_key)
);

create index if not exists coin_transactions_owner_idx
  on public.coin_transactions (profile_id, created_at desc);

insert into public.wallets (profile_id, coin_balance)
  select id, 0 from public.profiles
on conflict (profile_id) do nothing;

alter table public.shop_catalog enable row level security;
alter table public.wallets enable row level security;
alter table public.inventory enable row level security;
alter table public.coin_transactions enable row level security;

drop policy if exists shop_catalog_read on public.shop_catalog;
create policy shop_catalog_read on public.shop_catalog for select using (true);

drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own on public.wallets
  for select using (auth.uid() = profile_id);

drop policy if exists inventory_select_own on public.inventory;
create policy inventory_select_own on public.inventory
  for select using (auth.uid() = profile_id);

drop policy if exists coin_transactions_select_own on public.coin_transactions;
create policy coin_transactions_select_own on public.coin_transactions
  for select using (auth.uid() = profile_id);

revoke insert, update, delete on table public.shop_catalog from anon, authenticated;
revoke insert, update, delete on table public.wallets from anon, authenticated;
revoke insert, update, delete on table public.inventory from anon, authenticated;
revoke insert, update, delete on table public.coin_transactions from anon, authenticated;
grant select on table public.shop_catalog to anon, authenticated;
grant select on table public.wallets to anon, authenticated;
grant select on table public.inventory to anon, authenticated;
grant select on table public.coin_transactions to anon, authenticated;

create or replace function public.ensure_my_wallet()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_missing';
  end if;
  insert into public.wallets (profile_id, coin_balance)
    values (v_uid, 0)
    on conflict (profile_id) do nothing;
end;
$$;

create or replace function public.get_wallet_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_balance   integer;
  v_avatar    text;
  v_frame     text;
  v_owned     jsonb;
begin
  perform public.ensure_my_wallet();
  select coin_balance, equipped_avatar, equipped_frame
    into v_balance, v_avatar, v_frame
    from public.wallets where profile_id = v_uid;
  select coalesce(jsonb_agg(item_id order by item_id), '[]'::jsonb)
    into v_owned from public.inventory where profile_id = v_uid;
  return jsonb_build_object(
    'ok', true,
    'coins', v_balance,
    'owned', v_owned,
    'equipped_avatar', v_avatar,
    'equipped_frame', v_frame
  );
end;
$$;

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

  v_amount := greatest(1, round(v_pts::numeric / 10)::integer);
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
  v_amounts  integer[] := array[60, 120, 180, 250, 400];
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

create or replace function public.purchase_cosmetic(p_item text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_cost     integer;
  v_type     text;
  v_balance  integer;
  v_avatar   text;
  v_frame    text;
begin
  select coin_cost, item_type into v_cost, v_type from public.shop_catalog
    where item_id = p_item and active;
  if v_cost is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_item');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wallet:' || v_uid::text, 0));
  perform public.ensure_my_wallet();
  select coin_balance into v_balance from public.wallets where profile_id = v_uid;

  if exists (
    select 1 from public.inventory where profile_id = v_uid and item_id = p_item
  ) then
    select equipped_avatar, equipped_frame into v_avatar, v_frame
      from public.wallets where profile_id = v_uid;
    return jsonb_build_object(
      'ok', true, 'already_owned', true, 'coins', v_balance,
      'equipped_avatar', v_avatar, 'equipped_frame', v_frame
    );
  end if;
  if v_balance < v_cost then
    return jsonb_build_object(
      'ok', false, 'error', 'insufficient_coins', 'coins', v_balance
    );
  end if;

  if v_type = 'avatar' then
    update public.wallets
      set coin_balance = coin_balance - v_cost,
          equipped_avatar = p_item,
          updated_at = now()
      where profile_id = v_uid
      returning coin_balance, equipped_avatar, equipped_frame
        into v_balance, v_avatar, v_frame;
  else
    update public.wallets
      set coin_balance = coin_balance - v_cost,
          equipped_frame = p_item,
          updated_at = now()
      where profile_id = v_uid
      returning coin_balance, equipped_avatar, equipped_frame
        into v_balance, v_avatar, v_frame;
  end if;
  insert into public.inventory (profile_id, item_id, source)
    values (v_uid, p_item, 'shop');
  insert into public.coin_transactions (
    profile_id, source_key, delta, balance_after, metadata
  ) values (
    v_uid, 'purchase:' || p_item, -v_cost, v_balance,
    jsonb_build_object('item', p_item)
  );

  return jsonb_build_object(
    'ok', true, 'already_owned', false, 'coins', v_balance,
    'equipped_avatar', v_avatar, 'equipped_frame', v_frame
  );
end;
$$;

create or replace function public.equip_cosmetic(
  p_item text,
  p_slot text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_balance integer;
  v_avatar  text;
  v_frame   text;
begin
  if p_slot not in ('avatar', 'frame') then
    return jsonb_build_object('ok', false, 'error', 'invalid_slot');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || v_uid::text, 0));
  perform public.ensure_my_wallet();
  if p_item is not null and not exists (
    select 1 from public.inventory i
    join public.shop_catalog c on c.item_id = i.item_id
    where i.profile_id = v_uid
      and i.item_id = p_item
      and c.item_type = p_slot
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_owned');
  end if;

  if p_slot = 'avatar' then
    update public.wallets
      set equipped_avatar = p_item, updated_at = now()
      where profile_id = v_uid
      returning coin_balance, equipped_avatar, equipped_frame
        into v_balance, v_avatar, v_frame;
  else
    update public.wallets
      set equipped_frame = p_item, updated_at = now()
      where profile_id = v_uid
      returning coin_balance, equipped_avatar, equipped_frame
        into v_balance, v_avatar, v_frame;
  end if;
  return jsonb_build_object(
    'ok', true, 'coins', v_balance,
    'equipped_avatar', v_avatar, 'equipped_frame', v_frame
  );
end;
$$;

revoke all on function public.ensure_my_wallet() from public;
revoke all on function public.get_wallet_state() from public;
revoke all on function public.claim_game_coins(text, text) from public;
revoke all on function public.claim_reward_drop(text, text, text) from public;
revoke all on function public.purchase_cosmetic(text) from public;
revoke all on function public.equip_cosmetic(text, text) from public;

grant execute on function public.get_wallet_state() to anon, authenticated;
grant execute on function public.claim_game_coins(text, text) to anon, authenticated;
grant execute on function public.claim_reward_drop(text, text, text) to anon, authenticated;
grant execute on function public.purchase_cosmetic(text) to anon, authenticated;
grant execute on function public.equip_cosmetic(text, text) to anon, authenticated;
