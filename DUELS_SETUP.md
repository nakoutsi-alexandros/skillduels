# Duels backend — deploy runbook (real duels v1, backend foundation)

This is the **founder-only** deploy guide for the duel backend foundation. It has
two independent parts:

1. **Run the SQL migrations** `supabase/003_duels.sql`, then
   `supabase/004_security_hardening.sql`, then
   `supabase/005_wallet_inventory.sql` (settlement, anti-cheat,
   server-authoritative scores, wallet and inventory).
2. **Deploy the Edge Function** `supabase/functions/settle-duel` (the settlement front door).

Both need **your** Supabase login (dashboard or CLI). Claude cannot do either — it
has no access to your Supabase account, and these are outward-facing changes that
require your explicit confirmation.

Deploy `003_duels.sql`, then `004_security_hardening.sql`, then
`005_wallet_inventory.sql`, then the `settle-duel` Edge Function, and only then
deploy the updated client. Migration 004 preserves valid current score balances,
repairs any legacy negative score to zero, removes direct client writes to score
tables, and installs validated game/bonus RPCs. Migration 005 creates every
existing player's wallet at zero and installs server-authoritative coin rewards,
inventory purchases and equipment.

Nothing here deletes existing data. Migration 004 preserves current balances,
adds the hardened RPCs, and removes direct client write access to score tables.
Until the SQL and Edge Function changes are deployed, the updated client uses a
read-only compatibility fallback for the current score.

---

## Prerequisites (already true for this project)

- Supabase project ref `qavcuthbfppbxdvphkms`, region EU/Frankfurt.
- `schema.sql` and `002_daily_runs.sql` already run.
- Anonymous sign-ins already enabled.

---

## Part 1 — Run the SQL migration (2 minutes, dashboard)

1. Open the Supabase dashboard → your project → **SQL Editor** → **New query**.
2. Open `supabase/003_duels.sql` in the repo, copy the **whole file**, paste it in.
3. Click **Run**. It is safe to re-run (everything is `IF NOT EXISTS` /
   `CREATE OR REPLACE`).
4. Open `supabase/004_security_hardening.sql`, copy the **whole file**, paste it
   into a new query, and click **Run**.
5. Open `supabase/005_wallet_inventory.sql`, copy the **whole file**, paste it
   into a new query, and click **Run**.
6. Sanity check — run these in a new query and confirm they return without error:

   ```sql
   -- tables exist
   select count(*) from public.game_scores;
   select count(*) from public.duels;
   select count(*) from public.notifications;
   select count(*) from public.wallets;
   select count(*) from public.shop_catalog;

   -- scoring function works (should return 880)
   select public.duel_game_pts('draw', 120);
   ```

   `duel_game_pts('draw', 120)` returning **880** confirms the canonical scoring
   formula is installed.

**What this created**

- `game_scores` — cross-player index of "who scored what on game X today". The
  client appends to it whenever a daily game finishes.
- `duels` — audit log + the source of truth for the shield budget and the
  per-pair 24h cooldown.
- `notifications` — one row per event (the `duel_lost` hook).
- `duelable_targets(...)` and `settle_duel(...)` — the two `SECURITY DEFINER`
  functions that are the ONLY cross-player read/write path. Raw tables stay
  private (RLS own-rows-only, no public view).
- The production duel limit is three challenges per UTC day. Ad-earned duel
  unlocks remain disabled against the real backend until an ad provider supplies
  a receipt that the server can verify; a client-side "ad watched" flag is not
  trusted.
- `wallets`, `inventory`, `coin_transactions` and `shop_catalog` keep coins and
  cosmetics across refreshes/devices. Clients can read their own state but all
  rewards, purchases and equipment changes go through validating RPCs. Coin-pack
  purchases remain disabled in production until StoreKit/Play Billing receipts
  can be verified server-side.

---

## Part 2 — Deploy the `settle-duel` Edge Function

The Edge Function is the client's single entry point for settling a duel. It
authenticates the caller, bounds their raw performance, and calls `settle_duel`.

### Secrets it needs

**None to set manually.** The function only uses `SUPABASE_URL` and
`SUPABASE_ANON_KEY`, which the Supabase Edge runtime injects automatically. It does
**not** use the service-role key (it acts as the caller via their JWT, and the SQL
function is `SECURITY DEFINER` for the elevated parts). Do not add the service-role
key here.

### Option A — Supabase CLI (recommended)

Requires the Supabase CLI installed and **your** login.

```bash
# one-time, if not already linked
supabase login
supabase link --project-ref qavcuthbfppbxdvphkms

# deploy just this function
supabase functions deploy settle-duel
```

`supabase functions deploy` reads `supabase/functions/settle-duel/index.ts` from
the repo. Re-running redeploys; it does not affect data.

> JWT note: the function verifies the caller's JWT itself. If your CLI/project
> defaults to "verify JWT" at the gateway that is fine — the client calls it with a
> logged-in (even anonymous) session, so a valid JWT is always present.

### Option B — Dashboard

1. Dashboard → **Edge Functions** → **Create a new function** → name it exactly
   `settle-duel`.
2. Paste the contents of `supabase/functions/settle-duel/index.ts`.
3. Deploy.

### Verify the deploy

After deploying, the quickest real check is from the running app once the UI pass
wires it up. To smoke-test earlier, from the browser console **on the app** (so a
session cookie exists):

```js
// expects a rejection because there is no such defender / no snapshot — proves the
// function is reachable, authenticates you, and returns structured JSON.
const { data } = await window.supabase.functions.invoke("settle-duel", {
  body: { defenderId: "00000000-0000-0000-0000-000000000000",
          gameId: "draw", day: "2026-07-24", season: "2026-07",
          stake: 50, raw: 250 }
});
console.log(data); // → { ok:false, error:"no_target_score" } (or "self"/"out_of_band")
```

(`window.supabase` is only present if the app exposes it; otherwise verify via the
UI pass.) A structured `{ ok:false, error:... }` back = the function and the SQL
path are live.

---

## What is safe to ship before deploy

The client changes in this pass are **defensive and inert** until you deploy:

- `recordGameScore(...)` is called when a daily game finishes, but the data layer
  **no-ops and never throws** if `game_scores` does not exist yet. Worst case: a
  console warning. The run is unaffected.
- `getDuelableTargets / startDuel / settleDuel / getNotifications` are exported but
  **not yet wired into the duel UI** — the duel screen still uses the local
  fake-opponent path, so testers are not broken mid-build.
- The **seed-bug fix** (duel mini-games now get a fresh seed) is pure client logic
  and needs no backend.

So you can merge/deploy the frontend now; the duel backend simply "lights up" once
Parts 1 and 2 are done and the later UI pass points the duel screen at
`settleDuel`.

---

## Rollback

- Edge Function: redeploy the previous version, or delete the `settle-duel`
  function in the dashboard (the client falls back to the local path).
- SQL: the migration is additive. To fully remove it (destructive — only if you
  mean it), drop the added objects:

  ```sql
  drop function if exists public.settle_duel(uuid, text, text, text, integer, numeric, jsonb);
  drop function if exists public.duelable_targets(text, text, text, int);
  drop function if exists public.duel_game_pts(text, numeric);
  drop function if exists public.duel_band_lo(integer);
  drop function if exists public.duel_band_hi(integer);
  drop function if exists public.duel_shield_cap();
  drop table if exists public.notifications;
  drop table if exists public.duels;
  drop table if exists public.game_scores;
  ```

  Do this only deliberately — it deletes duel history and notifications.

---

## Hard gate before this ships to players

Per-game scores and duel history become **visible to other players** through the
duel functions (a challenger sees a defender's eligible score; a defender sees who
hit them). That is new personal-data exposure versus today's private daily-run
blob. The **privacy policy must be updated** before the duel UI goes live to
testers — this is a `legal-compliance` gate, tracked separately from this backend
pass.
