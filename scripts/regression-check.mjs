import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { utcDayKey, utcSeasonEnd, utcSeasonKey, utcSeasonName } from "../src/lib/time.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [app, dataLayer, duelsSql, hardeningSql, edgeFunction] = await Promise.all([
  read("src/App.jsx"),
  read("src/lib/supabase.js"),
  read("supabase/003_duels.sql"),
  read("supabase/004_security_hardening.sql"),
  read("supabase/functions/settle-duel/index.ts"),
]);

const december = Date.UTC(2026, 11, 15, 12);
assert.equal(utcDayKey(december), "2026-12-15");
assert.equal(utcSeasonKey(december), "2026-12");
assert.equal(utcSeasonEnd(december).toISOString(), "2027-01-01T00:00:00.000Z");
assert.equal(utcSeasonName(december), "December");

assert.doesNotMatch(app, /\bsaveScore\s*\(/, "The browser must not submit a season total");
assert.match(dataLayer, /rpc\("record_game_score"/);
assert.match(dataLayer, /rpc\("claim_daily_bonus"/);
assert.match(dataLayer, /rpc\("get_my_season_score"/);
assert.match(hardeningSql, /revoke insert, update, delete on table public\.scores/i);
assert.match(hardeningSql, /drop policy if exists scores_update_own/i);
assert.match(hardeningSql, /pg_advisory_xact_lock/i);
assert.match(hardeningSql, /claim_daily_bonus/i);

assert.match(duelsSql, /duel_raw_is_plausible\(p_game, p_raw\)/);
assert.match(duelsSql, /profile_id in \(v_challenger, p_defender\)[\s\S]*for update/i);
assert.match(duelsSql, /count\(\*\) >= 8/i);
assert.match(edgeFunction, /oddone:\s*\{\s*min:\s*0,\s*max:\s*45\s*\}/);
assert.match(edgeFunction, /quickmath:\s*\{\s*min:\s*0,\s*max:\s*45\s*\}/);

assert.match(app, /challengesUsed,\s*adDuels\s*\}/);
assert.match(app, /run\.challengesUsed/);
assert.match(app, /run\.adDuels/);
assert.match(app, /const userEntry = seasonPts > 0/);
assert.match(app, /role="dialog"\s+aria-modal="true"/);
assert.match(app, /role="switch"\s+aria-checked=\{on\}/);
assert.match(app, /aria-label=\{dir < 0 \? "Previous section" : "Next section"\}/);

console.log("Regression checks passed.");
