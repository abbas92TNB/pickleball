# CLAUDE.md — Pickleball Fun Day

Guidance for Claude Code working in this repo. Keep it current as the app evolves.

## What this is

A **social** pickleball app: random-feeling but provably fair round-robin play for
a one-off session. Any host, open self-registration by QR, host approval, players
enter their own scores. Deployed as a static Vite build on **Vercel**, with
**Firebase** (anonymous auth + Firestore) as the backend.

Explicitly **not** a tournament app — no ratings, no cross-session ranking, no
team selection. (That is the separate `GencoPickleball` project.)

**Stack:** Vite + React 19 + TypeScript + Tailwind + Framer Motion. Firestore
only — no Storage, no Cloud Functions.

## Commands

```bash
npm run dev          # Vite dev server (host: true, so phones can reach it)
npm test             # vitest - schedule fairness + stats
npm run build        # tsc -b && vite build (type-check + prod build)
npm run lint         # eslint
```

Always run `npm test` and `npm run build` before committing logic changes.

## Architecture map

- `src/types.ts` — all domain types (Player, Session, GameSlot, Schedule, ScoreDoc, stats).
- `src/lib/schedule.ts` — **the Americano generator. Pure and heavily tested.**
- `src/lib/stats.ts` — leaderboard + full stats. Pure.
- `src/lib/plan.ts` — session planning maths (games each, finish time, warnings). Pure.
- `src/lib/rng.ts` — seeded mulberry32, so a seed reproduces a draw exactly.
- `src/lib/db.ts` — **all Firestore access**: `useSession`, `usePlayers`, `useScores`
  and every mutation. Never inline Firestore calls in pages.
- `src/lib/firebase.ts` — init; `firebaseReady` is false until env vars are set.
- `src/auth/AuthProvider.tsx` — anonymous sign-in only. No accounts.
- `src/components/` — `GameCard` (score entry), `RoundTimer`, `QrPoster`, `TopBar`.
- `src/pages/` — `Landing`, `NewSession`, `Join`, `Me`, `Board`, `Standings`, `Stats`, `Host`.
- `src/App.tsx` — routes plus `SessionLayout`, which loads the session once and
  passes `SessionCtx` down through `Outlet` context. Use `useSessionCtx()`.
- `firestore.rules` — the security boundary (see below).

**Keep `src/lib/**` pure and unit-tested.** It is the fairness core and must stay
deterministic and explainable.

## Domain rules (do not violate these)

- **Both streaks are hard-capped.** Nobody sits out more than `restCap` rounds in
  a row AND nobody plays more than `playCap` in a row. Caps are derived in
  `streakCaps()` from each player's quota, **with a floor of 2**. The floor is not
  cosmetic: a cap of 1 forces strict alternation, which splits the roster into two
  halves that never meet. There is a test guarding exactly this
  (`does not lock the roster into two fixed halves`) — do not "optimise" it away.
- **Zero repeat partnerships** while a fresh partner exists (`partner` weight
  dominates the cost function).
- **The back-to-back load is spread**, not just capped — `loadSpread` charges the
  gap between the busiest and least-worked player. Fairness of the *pattern*, not
  just of the totals.
- **The draw is fixed but seeded randomly.** Random-feeling *and* balanced. Never
  make it deterministic across sessions; never make it unbalanced to feel random.
- **`DEFAULT_TUNING` was set by a parameter sweep, not intuition.** If you change
  a weight, re-measure across seeds and several session shapes rather than
  eyeballing one draw. Measured behaviour is documented in the test comments.
- **Draws are legal.** A level score at the horn stands. `goldenPoint` is an
  opt-in session setting. Fun points: 2 win / 1 draw / 1 for playing, so the table
  never leaves anyone on zero.
- **Score entry is deliberately unlocked.** Any of the four players on court can
  save *and later change* their game's score; the app records `enteredBy` and
  `editCount` instead of locking. Do not add a locking or confirmation flow
  without being asked — it was an explicit product decision.
- **Timer is derived, not pushed.** The session doc holds `timerStartedAt` +
  `timerElapsedMs`; each client computes the countdown. No device is the clock.
- **Approval gate.** Self-registration always arrives `status: 'pending'`. Only
  the host approves. Enforced in the rules, not just the UI.

## Firestore shape

```
sessions/{CODE}                    config + fixed schedule + round state
sessions/{CODE}/players/{ID}       doc id = normalised login ID -> unique for free
sessions/{CODE}/scores/{slotId}    one doc per game -> no write contention
```

Scores are separate documents specifically so four phones can write at once.
Players are separate documents specifically so open registration cannot clobber
the roster. Do not collapse either back into an array on the session doc.

## Security posture

- **A player ID is a lookup key, not a secret.** Anyone knowing an ID can sign in
  as that player. Accepted trade for a friendly game; stated on the sign-in
  screen and in the README. Do not store anything sensitive in player docs.
- Rules enforce: only the host mutates the session or players, the host cannot be
  reassigned, and self-registration cannot self-approve.
- Score writes are open to any signed-in device **on purpose** — restricting to
  the four names would mean reading the schedule inside a rule on every write.

## Deploy

Static build on Vercel (`vercel.json` handles build + SPA rewrite). Firestore
rules deploy separately via the Firebase CLI. Vite inlines `VITE_*` at build
time, so **changing env vars needs a redeploy**.
