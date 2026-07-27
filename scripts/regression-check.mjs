import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { utcDayKey, utcSeasonEnd, utcSeasonKey, utcSeasonName, utcStreak } from "../src/lib/time.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const readBytes = (path) => readFile(new URL(path, root));
const [app, dataLayer, duelsSql, hardeningSql, walletSql, attemptsSql, economySql, edgeFunction, indexHtml, manifest, touchIcon] = await Promise.all([
  read("src/App.jsx"),
  read("src/lib/supabase.js"),
  read("supabase/003_duels.sql"),
  read("supabase/004_security_hardening.sql"),
  read("supabase/005_wallet_inventory.sql"),
  read("supabase/006_game_attempts.sql"),
  read("supabase/007_economy_rebalance.sql"),
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
assert.match(walletSql, /create table if not exists public\.wallets/i);
assert.match(walletSql, /coin_balance\s+integer not null default 0/i);
assert.match(walletSql, /equipped_avatar\s+text references public\.shop_catalog/i);
assert.match(walletSql, /equipped_frame\s+text references public\.shop_catalog/i);
assert.match(walletSql, /unique \(profile_id, source_key\)/i);
assert.match(walletSql, /create table if not exists public\.inventory/i);
assert.match(walletSql, /revoke insert, update, delete on table public\.wallets/i);
assert.match(walletSql, /create or replace function public\.claim_game_coins/i);
assert.match(walletSql, /create or replace function public\.claim_reward_drop/i);
assert.match(walletSql, /create or replace function public\.purchase_cosmetic/i);
assert.match(walletSql, /pg_advisory_xact_lock\(hashtextextended\('wallet:'/i);
const clientCatalog = [...app.matchAll(
  /\{ id: "((?:av|fr)_[^"]+)",\s+type: "(?:avatar|frame)",\s+name: "[^"]+",\s*cost:\s*(\d+)/g,
)].map(([, id, cost]) => [id, Number(cost)]).sort();
const serverCatalog = [...walletSql.matchAll(
  /\('((?:av|fr)_[^']+)', '(?:avatar|frame)', (\d+)\)/g,
)].map(([, id, cost]) => [id, Number(cost)]).sort();
assert.deepEqual(serverCatalog, clientCatalog, "Server catalog IDs/prices must match the shop UI");
assert.match(attemptsSql, /create table if not exists public\.game_attempts/i);
assert.match(attemptsSql, /consumed_at\s+timestamptz/i);
assert.match(attemptsSql, /seed\s+bigint not null/i);
assert.match(attemptsSql, /create or replace function public\.start_game_attempt/i);
assert.match(attemptsSql, /create or replace function public\.consume_game_attempt/i);
assert.match(attemptsSql, /revoke all on function public\.record_game_score\(text/i);
assert.match(attemptsSql, /revoke all on function public\.settle_duel\(uuid, text/i);
assert.match(economySql, /greatest\(5, least\(20, round\(v_pts::numeric \/ 50\)::integer\)\)/i);
assert.match(economySql, /array\[5, 5, 5, 10, 10, 10, 15, 15, 20, 25, 25, 50\]/i);
assert.match(app, /const DROP_AMOUNTS = \[5, 5, 5, 10, 10, 10, 15, 15, 20, 25, 25, 50\]/);
const dropAmounts = JSON.parse(`[${app.match(/const DROP_AMOUNTS = \[([^\]]+)\]/)[1]}]`);
const expectedDrop = dropAmounts.reduce((sum, amount) => sum + amount, 0) / dropAmounts.length;
const expectedSixGameCoinsAt700Pts = 6 * (14 + expectedDrop);
assert.ok(
  expectedSixGameCoinsAt700Pts >= 180 && expectedSixGameCoinsAt700Pts <= 220,
  "A six-game run at 700 points/game should award roughly 180–220 coins",
);

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
assert.match(edgeFunction, /p_attempt:\s*attemptId/);

assert.match(app, /challengesUsed,\s*adDuels\s*\}/);
assert.match(app, /run\.challengesUsed/);
assert.match(app, /run\.adDuels/);
assert.match(app, /const userEntry = seasonPts > 0/);
assert.match(app, /role="dialog"\s+aria-modal="true"/);
assert.match(app, /role="switch"\s+aria-checked=\{on\}/);
assert.match(app, /aria-label=\{dir < 0 \? "Previous section" : "Next section"\}/);
assert.match(app, /const \[coins, setCoins\] = useState\(0\)/);
assert.match(dataLayer, /rpc\("get_wallet_state"/);
assert.match(dataLayer, /rpc\("claim_game_coins"/);
assert.match(dataLayer, /rpc\("claim_reward_drop"/);
assert.match(dataLayer, /rpc\("purchase_cosmetic"/);
assert.match(dataLayer, /rpc\("equip_cosmetic"/);
assert.match(dataLayer, /rpc\("start_game_attempt"/);
assert.match(dataLayer, /p_slot: slot/);
assert.match(dataLayer, /auth\.signUp\(/);
assert.match(dataLayer, /auth\.signInWithPassword\(/);
assert.match(dataLayer, /auth\.signInWithOAuth\(/);
assert.match(dataLayer, /auth\.signInAnonymously\(/);
assert.match(dataLayer, /auth\.linkIdentity\(/);
assert.match(app, /function AuthGateway\(/);
assert.match(app, /Continue with Google/);
assert.match(app, /Secure with Google/);
assert.match(app, /const session = await getExistingSession\(\)/);
assert.doesNotMatch(app, /await getOrCreateSession\(/);
assert.match(app, /equippedAvatar=\{equippedAvatar\} equippedFrame=\{equippedFrame\}/);
assert.match(app, /if \(!hasSupabase\) setCoins\(\(c\) => c \+ Math\.round\(pts \/ 10\)\)/);
assert.match(app, /Coin packs require verified StoreKit \/ Play Billing/);
assert.match(app, /disabled=\{!isOwned && !canAfford\}/);
assert.match(app, /startGameAttempt\(gameId, "daily"/);
assert.match(app, /startGameAttempt\(gameId, "duel"/);
assert.match(app, /attemptSeed=\{activeAttempt\?\.seed\}/);
assert.match(app, /if \(res && res\.error\) \{\s*setChallengesUsed\(\(n\) => Math\.max\(0, n - 1\)\)/);
assert.match(app, /const activePeriod = useRef\(\{ day: dayKey, season: seasonKey \}\)/);
assert.match(app, /result\.claimed === false[\s\S]*Daily gift was already claimed/);
assert.match(app, /current\?\.gameId === gameId[\s\S]*score: awarded/);
assert.match(app, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(app, /\.sprite-avatar\s*\{[\s\S]*animation:\s*spriteRun 1\.6s steps\(8\) infinite !important/);
assert.match(app, /className="sprite-avatar"/);
assert.doesNotMatch(app, /data:image\/png;base64/);
assert.doesNotMatch(indexHtml, /user-scalable\s*=\s*no/i);
assert.doesNotMatch(indexHtml, /maximum-scale/i);
assert.match(indexHtml, /rel="manifest"/);
assert.equal(JSON.parse(manifest).display, "standalone");
assert.ok(touchIcon.length > 1000, "The Apple touch icon must be a real PNG asset");

console.log("Regression checks passed.");
