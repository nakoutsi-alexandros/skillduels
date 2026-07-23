# Skill Duels — Backend setup (Phase 1)

Accounts + unique nicknames + a real leaderboard on Supabase. This is written for
closed testing (a handful of known testers on an unshared Vercel URL). No public
launch, no app stores, no in-app purchases yet. The free Supabase tier is fine.

Follow the steps in order. It takes ~10 minutes.

---

## What you're setting up

- A silent **anonymous account** for every player on first load (no signup — the
  "play in 30 seconds" promise is preserved).
- A **unique nickname** per player, enforced by the database.
- A **real leaderboard** of actual testers instead of the hardcoded bots.
- A **delete-my-account** path (GDPR erasure).

When the two env keys are absent, the app still runs — it falls back to the demo
bot leaderboard. The real backend switches on the moment the keys are present.

---

## Step 1 — Run the database script

1. Open your project in the Supabase dashboard: <https://supabase.com/dashboard>
2. Left sidebar → **SQL Editor**.
3. Click **New query**.
4. Open the file `supabase/schema.sql` from this repo, copy its **entire**
   contents, and paste into the editor.
5. Click **Run** (bottom-right).

You should see "Success. No rows returned." The script is safe to re-run.

This creates the `profiles` and `scores` tables, the public `season_leaderboard`
view, all the security rules, the nickname validator, and the account-deletion
function. Every block is commented in plain language — open the file and read it.

---

## Step 2 — Turn on anonymous sign-ins

The app creates a silent account for each visitor. That has to be enabled:

1. Left sidebar → **Authentication** → **Providers** (or **Sign In / Providers**).
2. Find **Anonymous sign-ins** and toggle it **ON**. Save.

> Optional email recovery (magic link) is **Phase 2** — not needed for closed
> testing. The email provider can stay off for now. The client code is structured
> so it can be added later without touching the schema.

---

## Step 3 — Find your two keys

1. Left sidebar → **Project Settings** (gear icon) → **API**.
2. Copy two values:

| Value in dashboard | Goes into env var | Safe to expose? |
|---|---|---|
| **Project URL** | `VITE_SUPABASE_URL` | Yes — it's just your project address |
| **Project API keys → `anon` `public`** | `VITE_SUPABASE_ANON_KEY` | **Yes** — designed for the browser; the database security rules are what protect data |

### NEVER put these in the app or in Git:

- The **`service_role`** key (also on the API page) — it bypasses all security.
- The **database password** (under Project Settings → Database).

If either of those ever ends up in the client bundle or a commit, rotate it
immediately. The app never needs them.

---

## Step 4 — Local development

1. In the project root, copy `.env.example` to a new file named `.env`.
2. Paste your two values:

   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

3. `.env` is gitignored — it will not be committed. Good.
4. Run `npm run dev`. On first load you'll get an anonymous session and be asked
   to pick a nickname. Pick one, and it's saved to the database.

> Vite only reads env vars at startup. If you edit `.env`, restart `npm run dev`.

---

## Step 5 — Vercel (the closed-test deploy)

The keys must also be set in Vercel, because the local `.env` is never deployed.

1. Vercel dashboard → your **skillduels** project → **Settings** → **Environment
   Variables**.
2. Add both, for the **Production** (and **Preview**, if you test there)
   environments:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
3. **Redeploy** so the new build picks them up (Deployments → latest → Redeploy,
   or push a commit).

Share the resulting Vercel URL only with your testers.

---

## How to check it's working

- Open the deployed URL, pick a nickname → you should land in the app.
- In Supabase → **Table Editor** → `profiles`: your row appears (id, nickname,
  avatar).
- Have a second tester try the **same** nickname → they should see "That nickname
  is taken."
- Play a game → your Season Points save. Check `scores` in the Table Editor.
- Open **Ranking** → real testers appear instead of `nikos.dev` and friends.

If keys are missing/wrong, the app silently falls back to the bot leaderboard
(check the browser console for a `[supabase]` warning).

---

## Data & privacy notes (for the operator)

- A **nickname is public personal data** — it shows on the leaderboard. This is
  intended and must be stated in the privacy policy.
- **Account deletion**: the app can call `delete_my_account()`, which deletes the
  auth user and cascades to the profile and scores — full erasure, one call.
- The audience may include minors. Before this goes beyond a handful of known
  testers, get **`legal-compliance`** to review what's stored and the consent
  copy. That review is out of scope for this backend setup but is a hard gate
  before any wider release.
