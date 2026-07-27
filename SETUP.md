# Skill Duels — Backend setup (Phase 1)

Accounts + unique nicknames + a real leaderboard on Supabase. This is written for
closed testing (a handful of known testers on an unshared Vercel URL). No public
launch, no app stores, no in-app purchases yet. The free Supabase tier is fine.

Follow the steps in order. It takes ~15 minutes.

---

## What you're setting up

- A choice between **email/password**, **Google**, or a **guest account**.
- Guest accounts can be linked to Google later without losing their profile,
  scores, wallet, coins, or inventory.
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

## Step 2 — Configure sign-in providers

### Email and guest access

1. Left sidebar → **Authentication** → **Providers** (or **Sign In / Providers**).
2. Enable **Email** with email/password sign-in.
3. Enable **Anonymous sign-ins** for the explicit "Continue as guest" option.
4. Under **URL Configuration**, set the Site URL to the deployed app URL and add
   both the deployed URL and local development URL (for example
   `http://localhost:5173`) to the redirect allow list.

When **Confirm email** is enabled, a new player must click the confirmation email
before signing in. This is recommended outside local testing.

### Google sign-in

1. In Google Cloud Console, create an OAuth 2.0 Client ID of type **Web
   application**.
2. Add the app's local and deployed URLs as authorized JavaScript origins.
3. Add Supabase's callback URL as an authorized redirect URI:
   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
4. In Supabase → **Authentication** → **Providers** → **Google**, enable Google
   and paste the Google Client ID and Client Secret.
5. Enable **Manual identity linking** in Supabase Auth settings. This lets a guest
   press "Secure with Google" while keeping the same Supabase user id and all
   existing progress.

The app requests only Google's basic OpenID profile and email scopes. It does not
request access to Gmail messages.

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
4. Run `npm run dev`. On first load, choose email, Google, or guest access, then
   pick a nickname. The account and nickname are saved to the database.

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

- Open the deployed URL → the account gateway should offer email, Google and guest.
- Create an email account, confirm it if required, then sign in and pick a nickname.
- Test Google sign-in. Also create a guest, play once, then use **Settings →
  Secure with Google** and confirm the same nickname, coins and progress remain.
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
