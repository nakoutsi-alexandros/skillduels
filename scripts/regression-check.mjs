import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { utcDayKey, utcSeasonEnd, utcSeasonKey, utcSeasonName, utcStreak } from "../src/lib/time.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const readBytes = (path) => readFile(new URL(path, root));
const [app, dataLayer, duelsSql, hardeningSql, edgeFunction, indexHtml, manifest, touchIcon] = await Promise.all([
  read("src/App.jsx"),
  read("src/lib/supabase.js"),
  read("supabase/003_duels.sql"),
  read("supabase/004_security_hardening.sql"),
  read("supabase/functions/settle-duel/index.ts"),
  read("index.html"),
  read("public/manifest.webmanifest"),
  readBytes("public/icon.png"),
]);

const december = Date.UTC(2026, 11, 15, 12);
assert.equal(utcDayKey(december), "2026-12-15");
assert.equal(utcSeasonKey(december), "2026-12");
assert.equal(utcSeasonEnd(december).toISOString(), "2027-01-01T00:00:00.000Z");
assert.equal(utcSeasonName(december), "December");
assert.equal(utcStreak("2026-07-27", ["2026-07-27", "2026-07-26", "2026-07-25"]), 3);
assert.equal(utcStreak("2026-07-27", ["2026-07-26", "2026-07-25"]), 2);
assert.equal(utcStreak("2026-07-27", ["2026-07-27", "2026-07-25"]), 1);
assert.equal(utcStreak("not-a-day", ["2026-07-27"]), 0);

assert.doesNotMatch(app, /\bsaveScore\s*\(/, "The browser must not submit a season total");
assert.match(dataLayer, /rpc\("record_game_score"/);
assert.match(dataLayer, /rpc\("claim_daily_bonus"/);
assert.match(dataLayer, /rpc\("get_my_season_score"/);
assert.match(hardeningSql, /revoke insert, update, delete on table public\.scores/i);
assert.match(hardeningSql, /drop policy if exists scores_update_own/i);
assert.match(hardeningSql, /pg_advisory_xact_lock/i);
assert.match(hardeningSql, /claim_daily_bonus/i);
assert.match(hardeningSql, /update public\.scores[\s\S]*where season_pts < 0/i);
assert.match(hardeningSql, /validate constraint scores_nonnegative/i);

assert.match(duelsSql, /duel_raw_is_plausible\(p_game, p_raw\)/);
assert.match(duelsSql, /profile_id in \(v_challenger, p_defender\)[\s\S]*for update/i);
assert.match(duelsSql, /count\(\*\) >= 3/i);
assert.ok(
  duelsSql.indexOf("'duel-limit:'") < duelsSql.indexOf("select count(*) >= 3"),
  "The challenger/day lock must be taken before checking the daily duel cap",
);
assert.match(duelsSql, /pg_column_size\(coalesce\(p_inputs/);
assert.match(edgeFunction, /oddone:\s*\{\s*min:\s*0,\s*max:\s*45\s*\}/);
assert.match(edgeFunction, /quickmath:\s*\{\s*min:\s*0,\s*max:\s*45\s*\}/);

assert.match(app, /challengesUsed,\s*adDuels\s*\}/);
assert.match(app, /run\.challengesUsed/);
assert.match(app, /run\.adDuels/);
assert.match(app, /const userEntry = seasonPts > 0/);
assert.match(app, /role="dialog"\s+aria-modal="true"/);
assert.match(app, /role="switch"\s+aria-checked=\{on\}/);
assert.match(app, /aria-label=\{dir < 0 \? "Previous section" : "Next section"\}/);
assert.match(app, /const \[coins, setCoins\] = useState\(0\)/);
assert.match(app, /if \(res && res\.error\) \{\s*setChallengesUsed\(\(n\) => Math\.max\(0, n - 1\)\)/);
assert.match(app, /const activePeriod = useRef\(\{ day: dayKey, season: seasonKey \}\)/);
assert.match(app, /result\.claimed === false[\s\S]*Daily gift was already claimed/);
assert.match(app, /current\?\.gameId === gameId[\s\S]*score: awarded/);
assert.match(app, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(app, /data:image\/png;base64/);
assert.doesNotMatch(indexHtml, /user-scalable\s*=\s*no/i);
assert.doesNotMatch(indexHtml, /maximum-scale/i);
assert.match(indexHtml, /rel="manifest"/);
assert.equal(JSON.parse(manifest).display, "standalone");
assert.ok(touchIcon.length > 1000, "The Apple touch icon must be a real PNG asset");

console.log("Regression checks passed.");
