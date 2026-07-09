# Rank coin rewards — spec (backend milestone)

Reward top finishers with **coins** (cosmetic currency, never power). Ships **with
the Supabase backend** — a real, server-computed leaderboard is a hard prerequisite.
On the current bots-only build ranks are fake, so do **not** pay out client-side.

## Tiers & amounts

| Period | Scope | 1st | 2nd | 3rd | Notes |
|--------|-------|----:|----:|----:|-------|
| **Daily**  | daily leaderboard (Season Points earned that day) | 100 | 60 | 40 | core loop incentive; paid next day |
| **Weekly** | league promotion group (top 3 promote) | 300 | 200 | 150 | on weekly rollover |
| **Season** | monthly final standings top 3 | 1500 | 900 | 600 | **plus** the existing exclusive frame + avatar + badge |

Season top-3 keep their earned-only cosmetics as the prestige; coins are an add-on.

## When / how paid

- **Server-computed, server-paid.** A scheduled job (Supabase Edge Function on cron)
  ranks the closed period and credits coins. Never trust the client for rank.
- **Payout timing:** daily job at season/day rollover (midnight UTC, matching
  `daily_seeds`); weekly + season on their rollovers.
- **Idempotent:** one payout row per `(user, period_type, period_id, rank)` — a unique
  constraint prevents double-credit on retries/re-runs.
- **Notify:** push + an in-app "Rank reward" toast/claim card on next open, reading the
  ledger. Show the pending reward on the Ranking screen ("Top 3 today earn coins").

## Data model (extends the prepped schema)

Prepped tables: `profiles, seasons, season_scores, daily_results, challenges,
owned_cosmetics, daily_seeds` + `add_season_points` fn + leaderboard view.

Add:

```sql
create table rank_rewards (
  id           bigint generated always as identity primary key,
  user_id      uuid    not null references profiles(id),
  period_type  text    not null check (period_type in ('daily','weekly','season')),
  period_id    text    not null,                    -- e.g. '2026-07-09', 'week-2026-28', 'season-2026-07'
  rank         int     not null check (rank between 1 and 3),
  coins        int     not null,
  created_at   timestamptz default now(),
  unique (user_id, period_type, period_id)          -- idempotency
);
```

- Credit coins via a `grant_rank_rewards(period_type, period_id)` SQL fn that:
  1. reads the ranked standings (existing leaderboard view / `daily_results`),
  2. inserts the top-3 rows (`on conflict do nothing`),
  3. increments `profiles.coins` for the newly inserted rows only.
- RLS: `rank_rewards` readable by owner; writable only by the service role (the job).

## Balance / economy (@money)

- Cosmetics-only → paying skilled players in coins is fair, not pay-to-win.
- Keep amounts modest so **legendary** avatars stay aspirational and **coin packs**
  still have a reason to exist. A daily-1st player earns ~3k coins/month ≈ 2–3
  legendaries — acceptable for the best player.
- Revisit amounts after the first real season's data.

## Anti-abuse (@dev)

- Ranks derived only from server-recorded `daily_results` on the shared `daily_seeds`
  (same challenge for everyone — already implemented client-side).
- `unique(user, date, game)` blocks replay farming (already in prep schema).
- Rank + payout computed entirely server-side; client only displays the ledger.

## Backend order (insert into the existing plan)

auth+save → daily results → **shared leaderboard** → cosmetics → **rank rewards (this
doc)** → real duels → edge-fn anti-cheat → push.
