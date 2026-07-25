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
// Session — anonymous-first. Called once on app load. Creates a silent anon
// user the very first time, then reuses it forever after.
// ---------------------------------------------------------------------------
export async function getOrCreateSession() {
  if (!supabase) return null;
  try {
    const { data: existing } = await supabase.auth.getSession();
    if (existing?.session) return existing.session;

    // No session yet → mint a silent anonymous one. Requires "Anonymous sign-ins"
    // to be enabled in the Supabase dashboard (see SETUP.md).
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn("[supabase] anonymous sign-in failed:", error.message);
      return null;
    }
    return data.session;
  } catch (e) {
    console.warn("[supabase] getOrCreateSession error:", e?.message || e);
    return null;
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

// ---------------------------------------------------------------------------
// Save the player's Season Points for the current season. Upserts on
// (profile_id, season) so it overwrites the same row every time rather than
// piling up history within a season. Call this debounced from the UI.
//   season: a "YYYY-MM" string, e.g. "2026-07"
// ---------------------------------------------------------------------------
export async function saveScore(season, seasonPts) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return { ok: false, error: "offline" };

    const { error } = await supabase.from("scores").upsert(
      {
        profile_id: uid,
        season,
        season_pts: Math.round(seasonPts) || 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,season" }
    );

    if (error) {
      console.warn("[supabase] saveScore error:", error.message);
      return { ok: false, error: "unknown", message: error.message };
    }
    return { ok: true };
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

// ---------------------------------------------------------------------------
// Fetch the public leaderboard for a season. Returns rows in the exact shape the
// UI already uses for BOTS: { name, avatar, pts }. Empty array on any failure so
// callers can fall back to BOTS.
// ---------------------------------------------------------------------------
export async function fetchLeaderboard(season, limit = 100) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("season_leaderboard")
      .select("name, avatar, pts")
      .eq("season", season)
      .order("pts", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("[supabase] fetchLeaderboard error:", error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn("[supabase] fetchLeaderboard error:", e?.message || e);
    return [];
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
export async function recordGameScore(gameId, day, raw, pts, label) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return { ok: false, error: "offline" };

    const { error } = await supabase.from("game_scores").insert({
      profile_id: uid,
      game_id: gameId,
      day,
      raw: Number(raw) || 0,
      pts: Math.round(pts) || 0,
      label: label ? String(label) : "",
    });
    if (error) {
      // Table may not exist yet (migration not run) — degrade quietly.
      console.warn("[supabase] recordGameScore error:", error.message);
      return { ok: false, error: "unknown", message: error.message };
    }
    return { ok: true };
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
//   args: { defenderId, gameId, day, season, stake, raw, inputs? }
// ---------------------------------------------------------------------------
export async function settleDuel({ defenderId, gameId, day, season, stake, raw, inputs }) {
  if (!supabase) return { ok: false, error: "offline" };
  try {
    const { data, error } = await supabase.functions.invoke("settle-duel", {
      body: {
        defenderId,
        gameId,
        day,
        season,
        stake,
        raw,
        inputs: inputs || {},
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
