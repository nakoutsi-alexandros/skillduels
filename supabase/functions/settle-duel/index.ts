// ============================================================================
// Skill Duels — Edge Function: settle-duel
// ----------------------------------------------------------------------------
// WHAT THIS IS
//   The single server-side front door for settling a duel. A challenger's client
//   calls it (via supabase.functions.invoke("settle-duel", ...)) after playing a
//   FRESH attempt of one game. It:
//     1. authenticates the caller from their JWT (they are the challenger),
//     2. validates the request shape and BOUNDS the raw performance to a
//        human-plausible range, rejecting absurd values BEFORE any DB write,
//     3. recomputes the challenger's points from raw server-side (JS mirror of
//        the SQL formula) as a first line of defence,
//     4. calls the settle_duel SQL function (which independently recomputes the
//        points, enforces shield/floor/cooldown/band, and moves points atomically
//        in one transaction), and returns its verdict.
//
// TRUST MODEL
//   The client sends only its RAW result (reaction ms, accuracy %, count, …) plus
//   the duel context. It NEVER sends its points or a win/loss verdict — those are
//   computed here and, authoritatively, in the SQL function. See the anti-cheat
//   coverage table below for exactly what is validated vs. only bounded this pass.
//
// DEPLOY
//   supabase functions deploy settle-duel   (needs the founder's login)
//   The default secrets SUPABASE_URL and SUPABASE_ANON_KEY are injected by the
//   Supabase runtime automatically — no manual secret setup needed. See
//   DUELS_SETUP.md.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Anti-cheat coverage (HONEST, this pass)
// ---------------------------------------------------------------------------
// FULLY server-authoritative for ALL six games:
//   - points are a pure function of raw and are recomputed server-side (here AND
//     in SQL). The client's points/verdict are never trusted. A client cannot
//     claim "I scored 1000" — the score is derived from the raw it reports.
// Server-issued attempt IDs are single-use, short-lived, bound to player/game/
// day/season/defender, and carry a server seed. Raw is still ONLY BOUNDED:
//   - the RAW value itself is checked against a human-plausible band and rejected
//     if impossible, but we cannot yet PROVE the player truly achieved that raw,
//     because the client does not emit a per-event input trace. Reconstructing raw
//     from a signed, timestamped input trace is the next hardening pass; the
//     duels.challenger_inputs column and this function are the seam for it.
// So: score-inflation is fully closed; raw-inflation is bounded, not eliminated.
const RAW_BOUNDS: Record<string, { min: number; max: number }> = {
  draw: { min: 90, max: 5000 },   // avg reaction ms (elite ~120; reject sub-90)
  bullseye: { min: 0, max: 100 }, // accuracy %
  numbers: { min: 5, max: 300 },  // seconds for 25 tiles (reject sub-5s)
  oddone: { min: 0, max: 45 },    // scoring cap for tiles found in 30s
  chimp: { min: 0, max: 25 },     // memory length (grid is 25 cells)
  quickmath: { min: 0, max: 45 }, // scoring cap for correct answers in 30s
};

// JS mirror of public.duel_game_pts — keep in lockstep with 003_duels.sql §5 and
// the client formulas in src/App.jsx. This is defence-in-depth; the SQL function
// is the final authority.
function serverPts(game: string, raw: number): number {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  switch (game) {
    case "draw":
      return Math.max(100, Math.round(1000 - clamp(raw, 120, 3000)));
    case "bullseye":
      return Math.round(120 + (clamp(raw, 0, 100) / 100) * 880);
    case "numbers":
      return clamp(Math.round(1000 - (clamp(raw, 7, 120) - 9) * 42), 120, 1000);
    case "oddone":
      return clamp(Math.round(clamp(raw, 0, 45) * 55 + 100), 120, 1000);
    case "chimp":
      return clamp(Math.round((clamp(raw, 0, 25) - 3) * 140 + 140), 120, 1000);
    case "quickmath":
      return clamp(Math.round(clamp(raw, 0, 45) * 45 + 100), 120, 1000);
    default:
      return 0;
  }
}

const VALID_GAMES = Object.keys(RAW_BOUNDS);
const VALID_STAKES = [50, 100, 200];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ ok: false, error: "not_authenticated" }, 401);

  // Client carrying the caller's JWT, so the SQL function sees auth.uid() = the
  // challenger and RLS scopes their own reads. The SECURITY DEFINER function does
  // the cross-player work.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // --- who is calling ------------------------------------------------------
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const challenger = userData?.user?.id;
  if (userErr || !challenger) {
    return json({ ok: false, error: "not_authenticated" }, 401);
  }

  // --- parse + validate the request ---------------------------------------
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const defenderId = String(body?.defenderId ?? "");
  const attemptId = String(body?.attemptId ?? "");
  const gameId = String(body?.gameId ?? "");
  const day = String(body?.day ?? "");
  const season = String(body?.season ?? "");
  const stake = Number(body?.stake);
  const raw = Number(body?.raw);
  const inputs = body?.inputs && typeof body.inputs === "object" ? body.inputs : {};

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)) {
    return json({ ok: false, error: "invalid_attempt" }, 400);
  }
  if (!defenderId || defenderId === challenger) {
    return json({ ok: false, error: "self" }, 400);
  }
  if (!VALID_GAMES.includes(gameId)) {
    return json({ ok: false, error: "bad_game" }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return json({ ok: false, error: "bad_day" }, 400);
  }
  if (!/^\d{4}-\d{2}$/.test(season)) {
    return json({ ok: false, error: "bad_season" }, 400);
  }
  if (!VALID_STAKES.includes(stake)) {
    return json({ ok: false, error: "bad_stake" }, 400);
  }
  if (!Number.isFinite(raw)) {
    return json({ ok: false, error: "bad_raw" }, 400);
  }
  if (new TextEncoder().encode(JSON.stringify(inputs)).byteLength > 16_384) {
    return json({ ok: false, error: "inputs_too_large" }, 413);
  }

  // --- BOUND the raw performance (reject impossible values) ----------------
  const b = RAW_BOUNDS[gameId];
  if (raw < b.min || raw > b.max) {
    return json({ ok: false, error: "implausible_raw", status: "rejected" }, 422);
  }

  // First-line server recompute (the SQL function is the final authority).
  const pts = serverPts(gameId, raw);

  // --- settle atomically in the DB ----------------------------------------
  const { data, error } = await supabase.rpc("settle_duel", {
    p_attempt: attemptId,
    p_defender: defenderId,
    p_game: gameId,
    p_day: day,
    p_season: season,
    p_stake: stake,
    p_raw: raw,
    p_inputs: inputs,
  });

  if (error) {
    return json({ ok: false, error: "settle_failed", message: error.message }, 500);
  }

  // The SQL function returns a jsonb verdict; include our first-line pts for
  // parity/debugging. `data.server_pts` (SQL) is the authoritative one.
  return json({ ...data, edge_pts: pts });
});
