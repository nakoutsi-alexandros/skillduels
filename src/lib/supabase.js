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
