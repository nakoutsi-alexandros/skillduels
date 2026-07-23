# Skill Duels

Competitive daily mini-games app. React 18 + Vite, deployed on Vercel.

## The team

This project is run as a small company. Every piece of work belongs to someone.
**Route the request to the responsible role and let them answer** — do not answer
out of role, and do not do a specialist's work yourself.

| Role | Owns |
|---|---|
| `developer` | Application code, architecture, refactors, build tooling, bugs |
| `ui-ux` | Visual design, layout, interaction, accessibility, the v3 design system |
| `qa-tester` | Finding defects before users do — edge cases, devices, timing, contrast |
| `game-economy` | Coins, prices, drops, season points, ELO, streaks, retention loops |
| `backend-infra` | Server, auth, persistence, real leaderboards, anti-cheat, deploys |
| `marketing-social` | Positioning, store listing, social content, launch, growth |
| `consumer-feedback` | The player's voice — reviews, usability, onboarding friction, churn |
| `legal-compliance` | Age rating, gambling-adjacent mechanics, GDPR, ads/IAP consent |

### Routing rules

1. Name the role you are routing to before you delegate, so the user knows who is
   speaking. Prefix the reply with the role, e.g. **`[ui-ux]`**.
2. One role owns each request. If it spans several, the owning role answers and
   explicitly asks for the others — do not fan out by default.
3. Cross-cutting decisions (economy changes, anything touching money, ads, or
   betting mechanics) must get `legal-compliance` sign-off before shipping.
4. Trivia about the repo itself ("what branch am I on", "what did we just commit")
   is not a specialist question — answer it directly.
5. Subagents start cold. Give them the file paths, the decision, and the constraint
   in the prompt; they cannot see this conversation.

## Product shape

- **Daily run**: six mini-games, one scored attempt each per day. Fresh at midnight.
- **Scoring**: everything feeds one number, Season Points. Ranking derives from it.
  Seasons reset monthly; the top 3 earn permanent cosmetics that are never sold.
- **Duels**: 1v1 challenges where players stake Season Points. 3 free per day,
  up to 5 more via rewarded ads, hard cap 8.
- **Economy**: coins earned from scores and run drops, spent on cosmetic avatars
  and frames. Coin packs are IAP. Cosmetics only — never power.

## Architecture

- Everything lives in `src/App.jsx`. It is one large file on purpose; keep related
  code together rather than splitting for its own sake.
- **All state is in-memory React state.** There is no backend, no persistence, no
  accounts. Refreshing resets the app. Leaderboard opponents are `BOTS`, a constant.
- Avatar art is base64-inlined in two very long lines (~600KB). Never read those
  lines in full; they will blow up your context.
- Animated avatars are 8-frame sprite sheets in `public/avatars/`, run by a CSS
  `steps()` animation.

### Design system (v3, neo-brutalist)

Cream paper `#F3ECDC`, ink `#14120F`, hard offset shadows, no blur or glass.
Every surface uses the `sticker()` helper: solid fill, `2.5px` ink border, solid
drop shadow. Fonts: Archivo (display), Space Grotesk (numbers), Manrope (body).
`inkOn(color)` picks white or ink text for a given fill — use it rather than
hardcoding, or you will ship invisible text on a coloured block.

### Fairness model

`daySeed(id)` gives every player the same challenge each day, which is what makes
the leaderboard mean anything. `runSeed(id, fresh)` returns a random seed instead
when the attempt is unscored (practice or a replay), so players are not drilling
one memorised grid. Timed rounds read the clock off `performance.now()` against a
deadline — never count `setTimeout` ticks, that drifts with device speed and lets
slower phones score higher.

## Commands

```bash
npm run dev      # dev server, exposed on the LAN for phone testing
npm run build    # production build; run before every commit
```

## Conventions

- Verify in the browser, do not assume. The preview tools drive a real page.
- Never ship a reward, badge or stat that does not actually do anything.
- Commit messages: Conventional Commits, lowercase subject, body explains *why*.
- Commit and push only when asked.
