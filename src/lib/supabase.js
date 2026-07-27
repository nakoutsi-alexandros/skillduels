// ============================================================================
// Skill Duels — Supabase data layer (Phase 1: accounts + nicknames + leaderboard)
// ----------------------------------------------------------------------------
// This is the ONLY file that talks to the backend. The rest of the app calls the
// functions exported here and never touches the Supabase client directly.
//
// Design rules for this module:
//  - If the two env vars are missing (a dev/preview run with no keys), we DO NOT
//    crash. `hasSupabase` is false, every function returns a safe empty/null
//    result, and App.jsx falls back to the in-memory BOTS behaviour it had before.
//  - Every function catches its own errors and returns a typed result object.
//    Nothing here throws at the caller. UI code can trust the return shape.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { utcStreak } from "./time";

// Vite exposes only variables prefixed with VITE_ to the browser bundle.
// The anon key is designed to be public (Row Level Security is what protects
// data) — it is safe to ship in the client. NEVER put the service_role key or
// the database password here.
const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// True only when both keys are present. The whole app checks this to decide
// between the real backend path and the offline BOTS fallback.
export const hasSupabase = Boolean(URL && ANON);

// Create the client once, module-level. `null` when there are no keys.
export const supabase = hasSupabase
  ? createClient(URL, ANON, {
      auth: {
        // Keep the anonymous session in localStorage and refresh it silently so a
        // returning tester keeps the same identity (and nickname) across reloads.
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

// Postgres error codes we care about mapping to friendly outcomes.
const UNIQUE_VIOLATION = "23505"; // duplicate key — nickname already taken
const RAISE_EXCEPTION = "P0001"; // our validation trigger rejected the name

// ---------------------------------------------------------------------------
// Authentication. New visitors choose how they want to enter the app instead of
// receiving an anonymous account automatically. Existing sessions are verified
// against Supabase before any private data is loaded.
// ---------------------------------------------------------------------------
export async function getExistingSession() {
  if (!supabase) return null;
  try {
    const { data: existing } = await supabase.auth.getSession();
    if (!existing?.session) return null;
    const { data: verified, error } = await supabase.auth.getUser();
    if (error || !verified?.user) return null;
    return { ...existing.session, user: verified.user };
  } catch (e) {
    console.warn("[supabase] getExistingSession error:", e?.message || e);
    return null;
  }
}

export async function signInAsGuest() {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) return { ok: false, error: "auth", message: error.message };
    return { ok: true, session: data.session, user: data.user };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

export async function signUpWithEmail(email, password) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    });
    if (error) return { ok: false, error: "auth", message: error.message };
    return {
      ok: true,
      session: data.session,
      user: data.user,
      confirmationRequired: !data.session,
    };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

export async function signInWithEmail(email, password) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, error: "auth", message: error.message };
    return { ok: true, session: data.session, user: data.user };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

export async function signInWithGoogle() {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) return { ok: false, error: "auth", message: error.message };
    return { ok: true, url: data.url };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

// Upgrades an anonymous account in place. The auth user id stays the same, so
// the profile, wallet, inventory and scores remain attached to the player.
export async function linkGoogleIdentity() {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
    const { data, error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) return { ok: false, error: "auth", message: error.message };
    return { ok: true, url: data?.url };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

export async function signOutAccount() {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return { ok: false, error: "auth", message: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

// ---------------------------------------------------------------------------
// Profile — the player's public identity (nickname + avatar). Returns null when
// the anon user has not chosen a nickname yet (→ show onboarding).
// ---------------------------------------------------------------------------
export async function getProfile() {
  if (!supabase) return null;
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, nickname, avatar, created_at")
      .eq("id", uid)
      .maybeSingle();

    if (error) {
      console.warn("[supabase] getProfile error:", error.message);
      return null;
    }
    return data; // null when no row yet
  } catch (e) {
    console.warn("[supabase] getProfile error:", e?.message || e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Claim a nickname (creates the profile row). The UNIQUE citext constraint in
// the DB is the real enforcer — this returns a friendly result the UI can show.
//   { ok: true, profile }                         → success
//   { ok: false, error: "taken" }                 → nickname already exists
//   { ok: false, error: "invalid", message }      → rejected by the DB validator
//   { ok: false, error: "offline" }               → no backend configured
//   { ok: false, error: "unknown", message }      → anything else
// ---------------------------------------------------------------------------
export async function setNickname(nickname, avatar) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return { ok: false, error: "offline" };

    // upsert so a returning anon user who re-picks doesn't hit a PK clash on their
    // own row; a clash with SOMEONE ELSE'S nickname still trips the UNIQUE index.
    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        { id: uid, nickname: nickname.trim(), avatar },
        { onConflict: "id" }
      )
      .select("id, nickname, avatar, created_at")
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return { ok: false, error: "taken" };
      if (error.code === RAISE_EXCEPTION)
        return { ok: false, error: "invalid", message: error.message };
      console.warn("[supabase] setNickname error:", error.message);
      return { ok: false, error: "unknown", message: error.message };
    }
    return { ok: true, profile: data };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

export async function updateAvatar(avatar) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return { ok: false, error: "offline" };
    const { error } = await supabase
      .from("profiles")
      .update({ avatar: String(avatar || "").slice(0, 64) })
      .eq("id", uid);
    if (error) {
      console.warn("[supabase] updateAvatar error:", error.message);
      return { ok: false, error: "unknown", message: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

// The total is server-authoritative. Game, bonus and duel RPCs are its only
// writers; the browser may read it but can never submit an arbitrary total.
export async function getMySeasonScore(season) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("get_my_season_score", {
      p_season: season,
    });
    if (error) {
      // Rolling-deploy compatibility: before migration 004 reaches the database,
      // RLS still permits a read of the caller's own row. This fallback is read-only.
      const { data: row, error: readError } = await supabase
        .from("scores")
        .select("season_pts")
        .eq("season", season)
        .maybeSingle();
      if (readError) {
        console.warn("[supabase] getMySeasonScore error:", readError.message);
        return null;
      }
      const fallback = Number(row?.season_pts);
      return Number.isFinite(fallback) ? fallback : 0;
    }
    const score = Number(data);
    return Number.isFinite(score) ? score : 0;
  } catch (e) {
    console.warn("[supabase] getMySeasonScore error:", e?.message || e);
    return null;
  }
}

export async function claimDailyBonus(day, season) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { data, error } = await supabase.rpc("claim_daily_bonus", {
      p_day: day,
      p_season: season,
    });
    if (error) {
      console.warn("[supabase] claimDailyBonus error:", error.message);
      return { ok: false, error: "unknown", message: error.message };
    }
    return data || { ok: false, error: "unknown" };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

// ---------------------------------------------------------------------------
// Wallet + inventory. Migration 005 owns every write; browser only requests a
// validated reward, purchase or equip action and adopts returned server state.
// ---------------------------------------------------------------------------
export async function getWalletState() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("get_wallet_state");
    if (error) {
      console.warn("[supabase] getWalletState error:", error.message);
      return null;
    }
    if (!data?.ok) return null;
    return {
      ok: true,
      coins: Math.max(0, Number(data.coins) || 0),
      owned: Array.isArray(data.owned) ? data.owned : [],
      equippedAvatar: typeof data.equipped_avatar === "string" ? data.equipped_avatar : null,
      equippedFrame: typeof data.equipped_frame === "string" ? data.equipped_frame : null,
    };
  } catch (e) {
    console.warn("[supabase] getWalletState error:", e?.message || e);
    return null;
  }
}

export async function claimGameCoins(gameId, day) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { data, error } = await supabase.rpc("claim_game_coins", {
      p_game: gameId,
      p_day: day,
    });
    if (error) {
      console.warn("[supabase] claimGameCoins error:", error.message);
      return { ok: false, error: "unknown", message: error.message };
    }
    return data || { ok: false, error: "unknown" };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

export async function claimRewardDrop(source, gameId, day) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { data, error } = await supabase.rpc("claim_reward_drop", {
      p_source: source,
      p_game: gameId || null,
      p_day: day,
    });
    if (error) {
      console.warn("[supabase] claimRewardDrop error:", error.message);
      return { ok: false, error: "unknown", message: error.message };
    }
    return data || { ok: false, error: "unknown" };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

export async function purchaseCosmetic(itemId) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { data, error } = await supabase.rpc("purchase_cosmetic", {
      p_item: itemId,
    });
    if (error) {
      console.warn("[supabase] purchaseCosmetic error:", error.message);
      return { ok: false, error: "unknown", message: error.message };
    }
    return data || { ok: false, error: "unknown" };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

export async function equipCosmetic(itemId, slot) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { data, error } = await supabase.rpc("equip_cosmetic", {
      p_item: itemId || null,
      p_slot: slot,
    });
    if (error) {
      console.warn("[supabase] equipCosmetic error:", error.message);
      return { ok: false, error: "unknown", message: error.message };
    }
    return data || { ok: false, error: "unknown" };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

// ---------------------------------------------------------------------------
// Save today's daily run. Upserts on (profile_id, day) so it overwrites the same
// row every time rather than piling up. `run` is the whole daily-run blob the app
// needs to restore a refresh intact: the played games + their scores, plus the
// day's other Season-Points contributors that also reset at midnight (the +50
// daily gift and the net duel points). Call this debounced from the UI.
//   day: a "YYYY-MM-DD" string in the player's local calendar day
//   run: a plain object, e.g. { played, bonusPts, rewardClaimed, challengeDelta }
// ---------------------------------------------------------------------------
export async function saveDailyRun(day, run) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return { ok: false, error: "offline" };

    const { error } = await supabase.from("daily_runs").upsert(
      {
        profile_id: uid,
        day,
        games: run && typeof run === "object" ? run : {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,day" }
    );

    if (error) {
      console.warn("[supabase] saveDailyRun error:", error.message);
      return { ok: false, error: "unknown", message: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

// ---------------------------------------------------------------------------
// Read today's daily run back. Returns the stored run blob (the object last
// passed to saveDailyRun) or null when there is no row for this day yet — which
// is exactly what a fresh new day should look like. Never throws.
//   day: a "YYYY-MM-DD" string in the player's local calendar day
// ---------------------------------------------------------------------------
export async function getDailyRun(day) {
  if (!supabase) return null;
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return null;

    const { data, error } = await supabase
      .from("daily_runs")
      .select("games")
      .eq("profile_id", uid)
      .eq("day", day)
      .maybeSingle();

    if (error) {
      console.warn("[supabase] getDailyRun error:", error.message);
      return null;
    }
    return data?.games ?? null; // null when no row for today yet
  } catch (e) {
    console.warn("[supabase] getDailyRun error:", e?.message || e);
    return null;
  }
}

// Consecutive scored days for the current player. Empty placeholder rows do not
// count; a streak may continue through yesterday before today's first game.
export async function getMyStreak(referenceDay) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("daily_runs")
      .select("day, games")
      .order("day", { ascending: false })
      .limit(400);
    if (error) {
      console.warn("[supabase] getMyStreak error:", error.message);
      return null;
    }

    const playedDays = new Set(
      (data || [])
        .filter((row) => row?.games?.played && Object.keys(row.games.played).length > 0)
        .map((row) => row.day),
    );
    return utcStreak(referenceDay, playedDays);
  } catch (e) {
    console.warn("[supabase] getMyStreak error:", e?.message || e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch the public leaderboard for a season. Returns rows in the exact shape the
// UI uses: { name, avatar, pts }. Null means the request failed; [] means the
// production leaderboard is genuinely empty.
// ---------------------------------------------------------------------------
export async function fetchLeaderboard(season, limit = 100) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("season_leaderboard")
      .select("name, avatar, pts")
      .eq("season", season)
      .order("pts", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("[supabase] fetchLeaderboard error:", error.message);
      return null;
    }
    return data || [];
  } catch (e) {
    console.warn("[supabase] fetchLeaderboard error:", e?.message || e);
    return null;
  }
}

// ===========================================================================
// DUELS (Phase: real duels v1) — see supabase/003_duels.sql + the settle-duel
// Edge Function. Every function here keeps the module's contract: no throw, safe
// empty/false result when there is no backend or the tables/function are not
// deployed yet, so the app never crashes mid-build and the old fake-oppScore path
// keeps working for testers until the UI pass wires these in.
// ===========================================================================

// ---------------------------------------------------------------------------
// Append the player's just-finished daily game score to the cross-player index
// (game_scores). This is what makes a player DUELABLE on that game today: a
// challenger's snapshot reads the latest same-day row here. Call it from the
// daily-game finish handler, fire-and-forget. No-op offline / not signed in.
//   day: "YYYY-MM-DD" (same local day as daySeed/dayKey)
// ---------------------------------------------------------------------------
export async function startGameAttempt(gameId, mode, day, season, defenderId = null) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { data, error } = await supabase.rpc("start_game_attempt", {
      p_game: gameId,
      p_mode: mode,
      p_day: day,
      p_season: season,
      p_defender: defenderId,
    });
    if (error) {
      console.warn("[supabase] startGameAttempt error:", error.message);
      return { ok: false, error: "unknown", message: error.message };
    }
    return data || { ok: false, error: "unknown" };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

export async function recordGameScore(attemptId, gameId, day, season, raw, label, secondary, inputs = {}) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    // `secondary` is the finer tiebreak metric for this game (see 003_duels.sql
    // §6b). It is the DEFENDER's snapshot value a later duel breaks a points-tie
    // against, so it must be persisted alongside raw/pts. Nullable: send null when
    // the attempt produced no finer signal (e.g. 0 correct in a timed game).
    const secNum = Number(secondary);
    const { data, error } = await supabase.rpc("record_game_score", {
      p_attempt: attemptId,
      p_game: gameId,
      p_day: day,
      p_season: season,
      p_raw: Number(raw),
      p_label: label ? String(label) : "",
      p_secondary: Number.isFinite(secNum) ? secNum : null,
      p_inputs: inputs && typeof inputs === "object" ? inputs : {},
    });
    if (error) {
      // Table may not exist yet (migration not run) — degrade quietly.
      console.warn("[supabase] recordGameScore error:", error.message);
      return { ok: false, error: "unknown", message: error.message };
    }
    return data || { ok: false, error: "unknown" };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

// ---------------------------------------------------------------------------
// Who can this challenger duel on `gameId` today? Goes through the
// duelable_targets SECURITY DEFINER RPC (the ONLY cross-player read path). Returns
// an array of eligible targets already filtered by band / grace / shield /
// per-pair-cooldown / has-a-same-day-score, in a shape the leaderboard/duel UI can
// use directly. Empty array on any failure so callers fall back to the local path.
//   Each row: { defenderId, name, avatar, pts, snapshotPts, snapshotLabel }
// ---------------------------------------------------------------------------
export async function getDuelableTargets(gameId, day, season, limit = 40) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.rpc("duelable_targets", {
      p_game: gameId,
      p_day: day,
      p_season: season,
      p_limit: limit,
    });
    if (error) {
      console.warn("[supabase] getDuelableTargets error:", error.message);
      return [];
    }
    return (data || []).map((r) => ({
      defenderId: r.defender_id,
      name: r.name,
      avatar: r.avatar,
      pts: r.pts,
      snapshotPts: r.snapshot_pts,
      snapshotLabel: r.snapshot_label,
    }));
  } catch (e) {
    console.warn("[supabase] getDuelableTargets error:", e?.message || e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Pre-flight before the VS screen. In the async, non-consensual model there is NO
// server "pending duel" row — the authoritative write happens at settleDuel. This
// re-checks (right before play) that the chosen target is STILL duelable and locks
// in the snapshot the UI shows, so a target who got shielded/played-again between
// leaderboard load and challenge is caught early. Returns:
//   { ok: true, target }                  → still eligible, includes fresh snapshot
//   { ok: false, error: "unavailable" }   → no longer duelable (grey it out)
//   { ok: false, error: "offline" }       → no backend (UI keeps the local path)
// ---------------------------------------------------------------------------
export async function startDuel(defenderId, gameId, day, season) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const targets = await getDuelableTargets(gameId, day, season, 100);
    const target = targets.find((t) => t.defenderId === defenderId);
    if (!target) return { ok: false, error: "unavailable" };
    return { ok: true, target };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

// ---------------------------------------------------------------------------
// Settle a duel server-side. Sends ONLY the raw performance + duel context to the
// settle-duel Edge Function; the server recomputes the score, decides the winner,
// enforces shield/floor/cooldown/band, and moves points atomically. NEVER sends a
// points value or a win verdict. Returns the server's verdict object:
//   { ok, won, server_pts, defender_pts, defender_label, stake, transferred,
//     partial, outcome, duel_id }
// or { ok:false, error } — including "rejected" for an implausible raw. On any
// failure the caller can fall back to the existing local path so testing isn't
// blocked before deploy.
//   args: { defenderId, gameId, day, season, stake, raw, secondary?, inputs? }
//
// TIEBREAKER: the challenger's `secondary` (the finer, same-skill metric) is folded
// into `inputs.secondary` on purpose. The settle-duel Edge Function already forwards
// `inputs` verbatim into the SQL settle_duel's challenger_inputs, where it is bounded
// and used to break a points tie — so the tiebreaker needs NO Edge Function change or
// redeploy. Only the SQL (003_duels.sql) has to be re-run.
// ---------------------------------------------------------------------------
export async function settleDuel({ attemptId, defenderId, gameId, day, season, stake, raw, secondary, inputs }) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const secNum = Number(secondary);
    const mergedInputs = {
      ...(inputs || {}),
      ...(Number.isFinite(secNum) ? { secondary: secNum } : {}),
    };
    const { data, error } = await supabase.functions.invoke("settle-duel", {
      body: {
        attemptId,
        defenderId,
        gameId,
        day,
        season,
        stake,
        raw,
        inputs: mergedInputs,
      },
    });
    if (error) {
      console.warn("[supabase] settleDuel error:", error.message);
      return { ok: false, error: "unknown", message: error.message };
    }
    return data; // the Edge Function's JSON verdict (already { ok, ... })
  } catch (e) {
    console.warn("[supabase] settleDuel error:", e?.message || e);
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

// ---------------------------------------------------------------------------
// The player's own notifications, newest first (e.g. "someone dueled you and took
// N points"). Own-rows-only via RLS. `unreadOnly` filters to notifications not yet
// marked read.
//
// RETURN CONTRACT: an ARRAY on success (possibly empty when there are genuinely no
// rows), or `null` on ANY failure (no backend / not signed in / query error). The
// null-vs-[] distinction matters for the incoming-duel reconciliation: an EMPTY
// result means "authoritatively zero losses" (safe to zero the local incoming
// delta), whereas a FAILED fetch must NOT be read as zero or it would clobber a
// real, persisted deduction and let the next saveScore revert it. Callers that
// only render should treat null like []; callers that reconcile MUST branch on it.
// ---------------------------------------------------------------------------
export async function getNotifications({ unreadOnly = false, limit = 50 } = {}) {
  if (!supabase) return null;
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return null;

    let q = supabase
      .from("notifications")
      .select("id, type, payload, read_at, created_at")
      .eq("profile_id", uid)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (unreadOnly) q = q.is("read_at", null);

    const { data, error } = await q;
    if (error) {
      console.warn("[supabase] getNotifications error:", error.message);
      return null;
    }
    return data || [];
  } catch (e) {
    console.warn("[supabase] getNotifications error:", e?.message || e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Mark notifications read (own rows only). Pass an array of ids, or omit to mark
// all of the player's unread notifications read. No-op offline. Never throws.
// ---------------------------------------------------------------------------
export async function markNotificationsRead(ids) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return { ok: false, error: "offline" };

    let q = supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("profile_id", uid)
      .is("read_at", null);
    if (Array.isArray(ids) && ids.length) q = q.in("id", ids);

    const { error } = await q;
    if (error) {
      console.warn("[supabase] markNotificationsRead error:", error.message);
      return { ok: false, error: "unknown", message: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}

// ---------------------------------------------------------------------------
// GDPR erasure — deletes the player's auth user, which CASCADEs to their profile
// and scores. Runs via a SECURITY DEFINER RPC (see schema.sql) because deleting
// from auth.users needs elevated rights the anon key does not have.
// ---------------------------------------------------------------------------
export async function deleteAccount() {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      console.warn("[supabase] deleteAccount error:", error.message);
      return { ok: false, error: "unknown", message: error.message };
    }
    // Drop the local session so the next load starts a fresh anonymous identity.
    await supabase.auth.signOut();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "unknown", message: e?.message || String(e) };
  }
}
