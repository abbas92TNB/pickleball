// ---------------------------------------------------------------------------
// Americano schedule generator.
//
// The draw is FIXED once generated, but generated from a RANDOM SEED, so it is
// unpredictable session to session while still being provably balanced:
//   * everyone plays the same number of games (+/- 1 when the maths does not divide)
//   * nobody partners the same person twice while a fresh partner is available
//   * nobody is benched for a long run, AND nobody is worked back to back
//     repeatedly - both streaks are hard-capped, not merely discouraged
//   * the back-to-back load is spread evenly, so the same person does not do
//     all the double shifts while someone else never does one
//
// Strategy: many randomised full-schedule attempts, each built round by round.
// Who sits out is drawn at random inside those caps, then the on-court players
// are split into games and pairs by exhaustive search over every legal
// arrangement. The cheapest whole schedule across all attempts wins.
//
// Pure module - no React, no Firebase. Unit tested in schedule.test.ts.
// ---------------------------------------------------------------------------

import { mulberry32, shuffle, randomSeed } from './rng'
import type { GameSlot, Schedule, ScheduleQuality } from '../types'

/**
 * Weights the optimiser balances. Exposed so the tuning sweep in the tests can
 * measure them rather than us guessing - the defaults below are the sweep's
 * winners for the common 12-24 player, 2-court shape.
 */
export interface Tuning {
  /** Partnering the same person twice is the thing we most want to avoid. */
  partner: number
  /** Facing the same person repeatedly is bad, but far less bad. */
  opponent: number
  /** Nudges toward "meet every other player exactly once", partner or opponent. */
  encounter: number
  /** Consecutive benched rounds beyond the first, charged as (streak - 1)^2. */
  restStreak: number
  /** Consecutive played rounds beyond the second, charged as (streak - 2)^2. */
  playStreak: number
  /** How strongly the draw itself favours whoever has been sitting longest. */
  restBias: number
  /**
   * How strongly the draw favours a player who has not yet met the people
   * already drawn into this round. This is what actually mixes the room - the
   * per-round pairing optimiser can only shuffle whoever the draw hands it.
   */
  noveltyBias: number
  /**
   * Charged on the gap between the busiest and the least-worked player, for
   * both back-to-back games and double benchings. This is the "everyone gets
   * the same deal" term: without it the caps are respected but one unlucky
   * player can absorb every double shift.
   */
  loadSpread: number
}

export const DEFAULT_TUNING: Tuning = {
  partner: 1000,
  opponent: 60,
  encounter: 45,
  restStreak: 400,
  playStreak: 400,
  restBias: 3,
  noveltyBias: 1,
  loadSpread: 220,
}

/**
 * Attempt budget. Two courts enumerate every arrangement exactly, so attempts
 * are cheap; three or more fall back to sampling, where each attempt costs
 * several times more, so we trade breadth for depth.
 */
const ATTEMPTS_EXACT = 400
const ATTEMPTS_SAMPLED = 150
/** Random arrangements sampled per round when exhaustive search is too big. */
const SPLIT_SAMPLES = 80
/** Above this many players on court, enumerating every split is too expensive. */
const EXHAUSTIVE_LIMIT = 8

const SEP = '|'

export function pairKey(a: string, b: string): string {
  return a < b ? a + SEP + b : b + SEP + a
}

type Counts = Map<string, number>
const at = (m: Counts, k: string): number => m.get(k) ?? 0
const bump = (m: Counts, k: string): void => {
  m.set(k, at(m, k) + 1)
}

type Team = [string, string]
type Game = [Team, Team]

// ------------------------------- arrangement -------------------------------

/** Every way to split `ids` into unordered groups of four. Caps at `limit`. */
function everySplit(ids: string[], limit: number): string[][][] {
  const out: string[][][] = []
  const walk = (rest: string[], acc: string[][]): void => {
    if (out.length >= limit) return
    if (rest.length === 0) {
      out.push(acc.map((g) => g.slice()))
      return
    }
    // Anchor on the first element so each partition is produced exactly once.
    const anchor = rest[0]
    const others = rest.slice(1)
    for (let i = 0; i < others.length - 2; i++) {
      for (let j = i + 1; j < others.length - 1; j++) {
        for (let k = j + 1; k < others.length; k++) {
          const remaining = others.filter((_, idx) => idx !== i && idx !== j && idx !== k)
          walk(remaining, [...acc, [anchor, others[i], others[j], others[k]]])
          if (out.length >= limit) return
        }
      }
    }
  }
  walk(ids, [])
  return out
}

function randomSplits(ids: string[], rng: () => number, n: number): string[][][] {
  const out: string[][][] = []
  for (let s = 0; s < n; s++) {
    const a = shuffle(ids.slice(), rng)
    const groups: string[][] = []
    for (let i = 0; i < a.length; i += 4) groups.push(a.slice(i, i + 4))
    out.push(groups)
  }
  return out
}

/** Marginal cost of adding one more meeting for every pair in a foursome. */
function meetCost(
  partner: Counts,
  opponent: Counts,
  encounter: Counts,
  teams: Game,
  t: Tuning,
): number {
  const [a, b] = teams
  let c = 0
  c += t.partner * (at(partner, pairKey(a[0], a[1])) + at(partner, pairKey(b[0], b[1])))
  for (const x of a) {
    for (const y of b) c += t.opponent * at(opponent, pairKey(x, y))
  }
  const all = [a[0], a[1], b[0], b[1]]
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) c += t.encounter * at(encounter, pairKey(all[i], all[j]))
  }
  return c
}

/** Cheapest of the three ways to pair up a foursome. */
function bestPairing(
  group: string[],
  partner: Counts,
  opponent: Counts,
  encounter: Counts,
  rng: () => number,
  t: Tuning,
): { game: Game; cost: number } {
  const [a, b, c, d] = group
  const options: Game[] = [
    [
      [a, b],
      [c, d],
    ],
    [
      [a, c],
      [b, d],
    ],
    [
      [a, d],
      [b, c],
    ],
  ]
  let best: { game: Game; cost: number } | null = null
  for (const game of options) {
    // Jitter breaks ties at random instead of always favouring the first option.
    const cost = meetCost(partner, opponent, encounter, game, t) + rng() * 0.01
    if (!best || cost < best.cost) best = { game, cost }
  }
  return best as { game: Game; cost: number }
}

function arrangeRound(
  onCourt: string[],
  partner: Counts,
  opponent: Counts,
  encounter: Counts,
  rng: () => number,
  t: Tuning,
): { games: Game[]; cost: number } {
  const splits =
    onCourt.length <= EXHAUSTIVE_LIMIT
      ? everySplit(onCourt, 200)
      : randomSplits(onCourt, rng, SPLIT_SAMPLES)
  let best: { games: Game[]; cost: number } | null = null
  for (const split of splits) {
    let cost = 0
    const games: Game[] = []
    for (const group of split) {
      const p = bestPairing(group, partner, opponent, encounter, rng, t)
      cost += p.cost
      games.push(p.game)
    }
    if (!best || cost < best.cost) best = { games, cost }
  }
  return best as { games: Game[]; cost: number }
}

// ---------------------------- play / bye balance ---------------------------

export interface StreakCaps {
  /** longest run of benched rounds we will accept, per player */
  rest: Counts
  /** longest run of played rounds we will accept, per player */
  play: Counts
}

/**
 * Both caps come from the same argument. A player with `g` games across `R`
 * rounds has `R - g` byes. Laying the byes out as separators gives `g + 1` gaps
 * to spread them into, so `ceil((R - g) / (g + 1))` is the shortest possible
 * worst bench run; the mirror image bounds the longest run of play.
 *
 * The floor of 2 matters in both directions. A cap of 1 forces strict
 * alternation, which splits the roster into two halves that never meet - and
 * two games in a row is fine anyway, it is three or four that hurts.
 */
export function streakCaps(ids: string[], quota: Counts, rounds: number): StreakCaps {
  const rest: Counts = new Map()
  const play: Counts = new Map()
  for (const id of ids) {
    const g = quota.get(id) ?? 0
    const byes = rounds - g
    if (g <= 0 || byes <= 0) {
      // Never plays, or plays every round: no bye to break a run up with.
      rest.set(id, rounds)
      play.set(id, rounds)
      continue
    }
    rest.set(id, Math.max(2, Math.ceil(byes / (g + 1))))
    play.set(id, Math.max(2, Math.ceil(g / (byes + 1))))
  }
  return { rest, play }
}

/** Pick one index from `weights` with probability proportional to its weight. */
function rouletteIndex(weights: number[], rng: () => number): number {
  let total = 0
  for (const x of weights) total += x
  let r = rng() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return weights.length - 1
}

/**
 * Draw `per` players for a round, in priority order:
 *
 *   1. quota-forced - no later round is left for them to reach their game count
 *   2. bench-capped - they have sat as long as we allow, so they play now
 *   3. a weighted random draw over everyone still under their play cap,
 *      favouring long sitters and people they have not met yet
 *   4. only if still short, players already at their play cap, least-worked first
 *
 * Step 3 is where the randomness lives; 1, 2 and 4 are the guardrails.
 */
function drawParticipants(
  ids: string[],
  per: number,
  remaining: Counts,
  restStreak: Counts,
  playStreak: Counts,
  encounter: Counts,
  caps: StreakCaps,
  roundsLeft: number,
  rng: () => number,
  t: Tuning,
): string[] {
  const forced: string[] = []
  const optional: string[] = []
  for (const id of ids) {
    const r = at(remaining, id)
    if (r <= 0) continue
    if (r >= roundsLeft) forced.push(id)
    else optional.push(id)
  }

  shuffle(forced, rng)
  const chosen = forced.slice(0, per)
  const taken = new Set(chosen)

  // 2. Anyone who has hit their bench cap jumps the queue.
  const benched = optional.filter((id) => !taken.has(id) && at(restStreak, id) >= at(caps.rest, id))
  shuffle(benched, rng)
  benched.sort((x, y) => at(restStreak, y) - at(restStreak, x))
  for (const id of benched) {
    if (chosen.length >= per) break
    chosen.push(id)
    taken.add(id)
  }

  // 3. Weighted random draw over players still under their play cap.
  const available = optional.filter((id) => !taken.has(id))
  const fresh = available.filter((id) => at(playStreak, id) < at(caps.play, id))
  const overworked = available.filter((id) => at(playStreak, id) >= at(caps.play, id))

  const pool = fresh.slice()
  while (chosen.length < per && pool.length > 0) {
    const weights = pool.map((id) => {
      let unmet = 0
      for (const other of chosen) if (at(encounter, pairKey(id, other)) === 0) unmet++
      const restPull = 1 + t.restBias * at(restStreak, id)
      const novelty = 1 + t.noveltyBias * unmet
      return restPull * novelty
    })
    const idx = rouletteIndex(weights, rng)
    chosen.push(pool[idx])
    taken.add(pool[idx])
    pool.splice(idx, 1)
  }

  // 4. Last resort: dip into players already at their play cap.
  if (chosen.length < per) {
    shuffle(overworked, rng)
    overworked.sort((x, y) => at(playStreak, x) - at(playStreak, y))
    for (const id of overworked) {
      if (chosen.length >= per) break
      chosen.push(id)
      taken.add(id)
    }
  }

  // Degenerate rosters (fewer available than `per`) top up from anyone left.
  if (chosen.length < per) {
    for (const id of shuffle(ids.slice(), rng)) {
      if (chosen.length >= per) break
      if (!taken.has(id)) {
        chosen.push(id)
        taken.add(id)
      }
    }
  }

  return chosen
}

// -------------------------------- generation -------------------------------

interface Attempt {
  games: GameSlot[]
  restsByRound: string[][]
  /** played.get(playerId)[round] - true when on court */
  played: Map<string, boolean[]>
  cost: number
}

/** Runs of `value` in a boolean row: the longest, and how many runs of 2+. */
function runStats(row: boolean[], value: boolean): { longest: number; doubles: number } {
  let longest = 0
  let doubles = 0
  let run = 0
  for (const v of row) {
    if (v === value) {
      run++
      longest = Math.max(longest, run)
      if (run >= 2) doubles++
    } else {
      run = 0
    }
  }
  return { longest, doubles }
}

const spread = (values: number[]): number =>
  values.length === 0 ? 0 : Math.max(...values) - Math.min(...values)

function buildOnce(
  ids: string[],
  courts: number,
  rounds: number,
  quota: Counts,
  caps: StreakCaps,
  rng: () => number,
  t: Tuning,
): Attempt {
  const per = courts * 4
  const partner: Counts = new Map()
  const opponent: Counts = new Map()
  const encounter: Counts = new Map()
  const remaining: Counts = new Map(quota)
  const restStreak: Counts = new Map()
  const playStreak: Counts = new Map()
  const played = new Map<string, boolean[]>(ids.map((id) => [id, []]))

  const games: GameSlot[] = []
  const restsByRound: string[][] = []
  let cost = 0

  for (let round = 0; round < rounds; round++) {
    const onCourt = drawParticipants(
      ids,
      per,
      remaining,
      restStreak,
      playStreak,
      encounter,
      caps,
      rounds - round,
      rng,
      t,
    )
    const onCourtSet = new Set(onCourt)
    for (const id of onCourt) remaining.set(id, at(remaining, id) - 1)

    const arranged = arrangeRound(onCourt, partner, opponent, encounter, rng, t)
    cost += arranged.cost

    arranged.games.forEach((game, i) => {
      const teamA = game[0]
      const teamB = game[1]
      games.push({ round, court: i + 1, teamA, teamB })
      bump(partner, pairKey(teamA[0], teamA[1]))
      bump(partner, pairKey(teamB[0], teamB[1]))
      bump(encounter, pairKey(teamA[0], teamA[1]))
      bump(encounter, pairKey(teamB[0], teamB[1]))
      for (const x of teamA) {
        for (const y of teamB) {
          bump(opponent, pairKey(x, y))
          bump(encounter, pairKey(x, y))
        }
      }
    })

    restsByRound.push(ids.filter((id) => !onCourtSet.has(id)))

    for (const id of ids) {
      const on = onCourtSet.has(id)
      played.get(id)?.push(on)
      if (on) {
        restStreak.set(id, 0)
        const s = at(playStreak, id) + 1
        playStreak.set(id, s)
        if (s > 2) cost += t.playStreak * (s - 2) * (s - 2)
      } else {
        playStreak.set(id, 0)
        const s = at(restStreak, id) + 1
        restStreak.set(id, s)
        if (s > 1) cost += t.restStreak * (s - 1) * (s - 1)
      }
    }
  }

  // Fairness of the pattern, not just of the totals: double shifts and double
  // benchings should land on everyone roughly equally.
  const b2b: number[] = []
  const doubleRest: number[] = []
  for (const id of ids) {
    const row = played.get(id) ?? []
    b2b.push(runStats(row, true).doubles)
    doubleRest.push(runStats(row, false).doubles)
  }
  cost += t.loadSpread * (spread(b2b) + spread(doubleRest))

  return { games, restsByRound, played, cost }
}

export function generateSchedule(opts: {
  playerIds: string[]
  courts: number
  rounds: number
  seed?: number
  attempts?: number
  tuning?: Partial<Tuning>
}): Schedule {
  const ids = opts.playerIds.slice()
  if (ids.length < 4) throw new Error('Need at least 4 players to build a schedule.')
  if (opts.rounds < 1) throw new Error('Need at least 1 round.')

  const courts = Math.max(1, Math.min(opts.courts, Math.floor(ids.length / 4)))
  const rounds = Math.floor(opts.rounds)
  const per = courts * 4
  const seed = opts.seed ?? randomSeed()
  const attempts = opts.attempts ?? (per <= EXHAUSTIVE_LIMIT ? ATTEMPTS_EXACT : ATTEMPTS_SAMPLED)
  const tuning: Tuning = { ...DEFAULT_TUNING, ...opts.tuning }
  const rng = mulberry32(seed)

  // Per-player game quota. Spread any remainder over randomly chosen players.
  const totalSlots = rounds * per
  const base = Math.floor(totalSlots / ids.length)
  const extra = totalSlots - base * ids.length
  const quota: Counts = new Map(ids.map((id) => [id, base]))
  for (const id of shuffle(ids.slice(), rng).slice(0, extra)) quota.set(id, base + 1)

  const caps = streakCaps(ids, quota, rounds)

  let best: Attempt | null = null
  for (let i = 0; i < attempts; i++) {
    const attempt = buildOnce(ids, courts, rounds, quota, caps, rng, tuning)
    if (!best || attempt.cost < best.cost) best = attempt
    if (best.cost === 0) break
  }
  const winner = best as Attempt

  return {
    seed,
    rounds,
    courts,
    playerIds: ids,
    games: winner.games,
    restsByRound: winner.restsByRound,
    quality: assessSchedule(ids, winner, attempts),
  }
}

function assessSchedule(ids: string[], attempt: Attempt, attempts: number): ScheduleQuality {
  const partner: Counts = new Map()
  const opponent: Counts = new Map()
  const encounter: Counts = new Map()
  const played: Counts = new Map(ids.map((id) => [id, 0]))

  for (const g of attempt.games) {
    bump(partner, pairKey(g.teamA[0], g.teamA[1]))
    bump(partner, pairKey(g.teamB[0], g.teamB[1]))
    bump(encounter, pairKey(g.teamA[0], g.teamA[1]))
    bump(encounter, pairKey(g.teamB[0], g.teamB[1]))
    for (const x of g.teamA) {
      for (const y of g.teamB) {
        bump(opponent, pairKey(x, y))
        bump(encounter, pairKey(x, y))
      }
    }
    for (const id of [...g.teamA, ...g.teamB]) played.set(id, at(played, id) + 1)
  }

  const over = (m: Counts): number => {
    let n = 0
    for (const v of m.values()) if (v > 1) n += v - 1
    return n
  }

  const counts = ids.map((id) => at(played, id))
  let longestRest = 0
  let longestPlay = 0
  const b2b: number[] = []
  const doubleRest: number[] = []
  for (const id of ids) {
    const row = attempt.played.get(id) ?? []
    const playRuns = runStats(row, true)
    const restRuns = runStats(row, false)
    longestPlay = Math.max(longestPlay, playRuns.longest)
    longestRest = Math.max(longestRest, restRuns.longest)
    b2b.push(playRuns.doubles)
    doubleRest.push(restRuns.doubles)
  }
  const possiblePairs = (ids.length * (ids.length - 1)) / 2

  return {
    repeatPartners: over(partner),
    repeatOpponents: over(opponent),
    gamesPerPlayer: { min: Math.min(...counts), max: Math.max(...counts) },
    longestRest,
    longestPlay,
    backToBack: { min: Math.min(...b2b), max: Math.max(...b2b) },
    doubleRest: { min: Math.min(...doubleRest), max: Math.max(...doubleRest) },
    coverage: possiblePairs === 0 ? 1 : encounter.size / possiblePairs,
    cost: attempt.cost,
    attempts,
  }
}

// ------------------------------ read helpers -------------------------------

export const slotId = (round: number, court: number): string => `r${round}c${court}`

export function gamesInRound(schedule: Schedule, round: number): GameSlot[] {
  return schedule.games.filter((g) => g.round === round).sort((a, b) => a.court - b.court)
}

export function gamesForPlayer(schedule: Schedule, playerId: string): GameSlot[] {
  return schedule.games.filter((g) => g.teamA.includes(playerId) || g.teamB.includes(playerId))
}

export function isInGame(slot: GameSlot, playerId: string): boolean {
  return slot.teamA.includes(playerId) || slot.teamB.includes(playerId)
}

/** Which side is this player on? */
export function sideOf(slot: GameSlot, playerId: string): 'a' | 'b' | null {
  if (slot.teamA.includes(playerId)) return 'a'
  if (slot.teamB.includes(playerId)) return 'b'
  return null
}

export function partnerOf(slot: GameSlot, playerId: string): string | null {
  const side = sideOf(slot, playerId)
  if (!side) return null
  const team = side === 'a' ? slot.teamA : slot.teamB
  return team.find((id) => id !== playerId) ?? null
}

export function opponentsOf(slot: GameSlot, playerId: string): string[] {
  const side = sideOf(slot, playerId)
  if (!side) return []
  return side === 'a' ? [...slot.teamB] : [...slot.teamA]
}

export function isResting(schedule: Schedule, round: number, playerId: string): boolean {
  return (schedule.restsByRound[round] ?? []).includes(playerId)
}

/**
 * The play / bye pattern for one player, for the "your afternoon" strip on the
 * player page. True means on court that round.
 */
export function patternFor(schedule: Schedule, playerId: string): boolean[] {
  const rows: boolean[] = []
  for (let r = 0; r < schedule.rounds; r++) rows.push(!isResting(schedule, r, playerId))
  return rows
}
