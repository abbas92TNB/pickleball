# Pickleball Fun Day

A social pickleball app for the kind of session where nobody cares about seeding.
Anyone can host, players register by scanning a QR, and the app draws a schedule
where **everyone plays the same number of games with a different partner every
time**. Players enter their own scores.

Not a tournament app. There is no rating, no ranking carried between sessions,
and no team selection — if you want that, that is a different app.

## What it guarantees

The schedule generator is the whole point of this thing, so it is worth being
precise about what it promises. For the common shape (16 players, 2 courts, 10
rounds) every draw satisfies:

| | |
| --- | --- |
| Games per player | exactly 5 — identical for everyone |
| Repeat partnerships | **zero** |
| Longest run on the bench | 2 rounds |
| Longest run on court | 2 rounds |
| Back-to-back games | 1–2 per player, spread evenly |
| Different people you meet | ~12 of the other 15 |

Both streaks are **hard-capped, not just discouraged**: three games in a row is
harder on the legs than three rounds off is on the patience, so the draw refuses
both. The caps come from the maths rather than a magic number — a player with `g`
games across `R` rounds has `g + 1` gaps to spread `R - g` byes into, and the
generator allows exactly the best any schedule could manage (with a floor of 2,
because a cap of 1 forces strict alternation and splits the roster into two
halves that never meet).

The draw is **fixed once generated, from a random seed**. So it is unpredictable
— a different schedule every session, and "Shuffle and redraw" gives you another
— while still being provably balanced. Random *and* fair, rather than random
*instead of* fair.

Verified by 49 unit tests in `src/lib/schedule.test.ts` and
`src/lib/stats.test.ts`, and the weights in `DEFAULT_TUNING` were chosen by a
parameter sweep rather than guessed.

## The format

- **Timed games.** Default 10 minutes, race to 13, rally scoring. At this level
  the timer is the real rule: 13 points takes 12–15 minutes, so expect most games
  to end on the horn. That is deliberate — it keeps every court finishing at the
  same time, which a rotation needs.
- **Leader at the horn wins.**
- **A draw is a valid result.** If the horn goes with the score level, save it
  level. There is an optional golden-point setting if you would rather settle it.
- **Fun points:** 2 for a win, 1 for a draw, 1 for playing at all. Ties broken on
  point difference. Nobody finishes on zero.

## How a session runs

| Who | What |
| --- | --- |
| **Host** (anyone) | Set courts, rounds and game length — the setup screen shows how many games each person gets and what time you finish before you invite anybody. Share the QR. Approve players as they register. Press **Start** to draw the schedule, then run the round clock. |
| **Player** | Scan the QR, register with a name and an ID, wait for the host to tick you off (the page updates itself). Then see who you are with, which court, and the clock. Enter the score when you are done. |

Any of the four players in a game can enter its score, and any of them can
change it afterwards — the app records who saved it last rather than locking it.

Screens: **My games** (the player view), **Board** (leave this open on a laptop
by the net), **Table** (the leaderboard), **Stats** (the full drill-down).

### Late arrivals

Approve them as normal, then press **Shuffle and redraw** — the host screen
flags anyone approved after the draw. A redraw changes matchups and resets to
round 1; scores already entered stay put, so redraw early rather than halfway
through.

## Setup

You need a Firebase project (free Spark tier is plenty — Firestore and anonymous
auth only, no Storage, no Functions) and somewhere to host the static build.

### 1. Firebase

1. Create a project in the [Firebase console](https://console.firebase.google.com).
2. **Authentication → Sign-in method →** enable **Anonymous**.
3. **Firestore Database →** create a database in production mode.
4. **Project settings → Your apps →** register a **Web app** and copy the
   `firebaseConfig` values.
5. Deploy the security rules:

```bash
npx firebase login && npx firebase deploy --only firestore:rules --project <your-project-id>
```

### 2. Run it locally

```bash
npm install
cp .env.example .env.local
```

Paste the config values into `.env.local`, then:

```bash
npm run dev
```

### 3. Deploy to Vercel

Import the repo in Vercel — `vercel.json` already sets the build command, output
directory and the SPA rewrite. Add the six `VITE_FIREBASE_*` variables under
**Project Settings → Environment Variables**, then deploy.

Vite inlines env vars at build time, so **redeploy after changing them**.

## Commands

```bash
npm run dev      # dev server (--host, so phones on the same wifi can reach it)
npm test         # vitest - schedule fairness + stats
npm run build    # tsc -b && vite build
npm run lint     # eslint
npm run preview  # serve the production build locally
```

## Architecture

```
src/
  types.ts                 all domain types
  lib/
    schedule.ts            the Americano generator - PURE, heavily tested
    schedule.test.ts       fairness guarantees as executable assertions
    stats.ts               leaderboard + full stats - PURE
    plan.ts                session planning maths (games each, finish time)
    rng.ts                 seeded PRNG, so a seed reproduces a draw exactly
    db.ts                  ALL Firestore access - hooks and mutations
    firebase.ts            init, anonymous auth
  auth/AuthProvider.tsx    anonymous sign-in
  components/              GameCard (score entry), RoundTimer, QrPoster, TopBar
  pages/                   Landing, NewSession, Join, Me, Board, Standings, Stats, Host
  ui/index.tsx             shared primitives
```

**Keep `src/lib/schedule.ts`, `stats.ts` and `plan.ts` pure and tested.** They
are the fairness core; the UI only reads from `db.ts` hooks.

### Firestore shape

```
sessions/{CODE}                    config + fixed schedule + round state
sessions/{CODE}/players/{ID}       one doc per player; doc id = normalised login
                                   ID, which makes IDs unique for free
sessions/{CODE}/scores/{slotId}    one doc per game, so four phones editing
                                   different courts never clobber each other
```

The round clock is derived from a timestamp on the session document, so every
phone and the big screen count down to the same second with no single device
acting as the source of truth.

## A note on ID logins

**A player ID is a lookup key, not a password.** Anyone who knows a colleague's
ID could sign in as them and edit their scores. That is a deliberate trade for a
friendly game — it means no accounts, no passwords and no email round-trips, and
the app says so on the sign-in screen.

The security rules do enforce the two things that matter: only the host can
change the session or approve players (self-registration is forced to arrive
`pending`, so nobody can approve themselves), and the host cannot be reassigned.
Score writing is intentionally open to every signed-in device — see the comments
in `firestore.rules`.

**So: do not put anything private in here.** Names and made-up IDs only.
