import { describe, it, expect } from 'vitest'
import {
  generateSchedule,
  pairKey,
  gamesForPlayer,
  partnerOf,
  opponentsOf,
  streakCaps,
  patternFor,
} from './schedule'
import { planSession, suggestRounds, addMinutesToClock, humanMinutes } from './plan'
import type { Schedule } from '../types'

const roster = (n: number): string[] => Array.from({ length: n }, (_, i) => `p${i + 1}`)

function tally(s: Schedule) {
  const partner = new Map<string, number>()
  const opponent = new Map<string, number>()
  const played = new Map<string, number>()
  for (const id of s.playerIds) played.set(id, 0)
  for (const g of s.games) {
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
    bump(partner, pairKey(g.teamA[0], g.teamA[1]))
    bump(partner, pairKey(g.teamB[0], g.teamB[1]))
    for (const x of g.teamA) for (const y of g.teamB) bump(opponent, pairKey(x, y))
    for (const id of [...g.teamA, ...g.teamB]) played.set(id, (played.get(id) ?? 0) + 1)
  }
  return { partner, opponent, played }
}

describe('generateSchedule - the real session: 16 players, 2 courts, 10 rounds', () => {
  const s = generateSchedule({ playerIds: roster(16), courts: 2, rounds: 10, seed: 1234 })

  it('produces two games per round for every round', () => {
    expect(s.games).toHaveLength(20)
    for (let r = 0; r < 10; r++) {
      const inRound = s.games.filter((g) => g.round === r)
      expect(inRound).toHaveLength(2)
      expect(inRound.map((g) => g.court).sort()).toEqual([1, 2])
    }
  })

  it('gives every player exactly 5 games', () => {
    const { played } = tally(s)
    for (const id of s.playerIds) expect(played.get(id)).toBe(5)
    expect(s.quality.gamesPerPlayer).toEqual({ min: 5, max: 5 })
  })

  it('never repeats a partnership', () => {
    const { partner } = tally(s)
    for (const [, n] of partner) expect(n).toBe(1)
    expect(s.quality.repeatPartners).toBe(0)
  })

  it('sits 8 players out each round, and nobody appears twice in a round', () => {
    for (let r = 0; r < 10; r++) {
      const onCourt = s.games
        .filter((g) => g.round === r)
        .flatMap((g) => [...g.teamA, ...g.teamB])
      expect(new Set(onCourt).size).toBe(8)
      expect(s.restsByRound[r]).toHaveLength(8)
      for (const id of onCourt) expect(s.restsByRound[r]).not.toContain(id)
    }
  })

  it('never benches anyone for more than two rounds in a row', () => {
    expect(s.quality.longestRest).toBeLessThanOrEqual(2)
  })

  it('never works anyone more than two rounds in a row either', () => {
    // Three games back to back is harder on the legs than three rounds off is
    // on the patience, so this cap matters as much as the bench one.
    expect(s.quality.longestPlay).toBeLessThanOrEqual(2)
  })

  it('spreads the back-to-back load evenly across the room', () => {
    // Not just "nobody does three in a row" but "nobody does all the doubles".
    // With 5 games in 10 rounds every player needs roughly two back-to-back
    // pairs, so measured across seeds the gap between busiest and least-worked
    // lands at 1-2. Anything wider means one person is carrying the session.
    expect(s.quality.backToBack.max - s.quality.backToBack.min).toBeLessThanOrEqual(2)
    expect(s.quality.doubleRest.max - s.quality.doubleRest.min).toBeLessThanOrEqual(2)
  })

  it('agrees with the per-player pattern helper', () => {
    for (const id of s.playerIds) {
      const pattern = patternFor(s, id)
      expect(pattern).toHaveLength(10)
      expect(pattern.filter(Boolean)).toHaveLength(5)
    }
  })

  it('mixes the room - everyone meets most of the other 15 players', () => {
    // 5 games gives 15 encounter slots (1 partner + 2 opponents each), so 15
    // distinct people is the theoretical ceiling. Measured over 20 seeds the
    // generator averages ~11.6 and never drops below 9.
    const sizes: number[] = []
    for (const id of s.playerIds) {
      const met = new Set<string>()
      for (const g of gamesForPlayer(s, id)) {
        const mate = partnerOf(g, id)
        if (mate) met.add(mate)
        for (const o of opponentsOf(g, id)) met.add(o)
      }
      expect(met.size).toBeGreaterThanOrEqual(9)
      sizes.push(met.size)
    }
    const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length
    expect(avg).toBeGreaterThanOrEqual(10.5)
  })

  it('keeps repeat opponents low', () => {
    const { opponent } = tally(s)
    let repeats = 0
    for (const [, n] of opponent) if (n > 1) repeats += n - 1
    expect(repeats).toBeLessThanOrEqual(12)
  })
})

describe('generateSchedule - determinism and randomness', () => {
  it('is reproducible for a given seed', () => {
    const a = generateSchedule({ playerIds: roster(16), courts: 2, rounds: 8, seed: 99 })
    const b = generateSchedule({ playerIds: roster(16), courts: 2, rounds: 8, seed: 99 })
    expect(a.games).toEqual(b.games)
  })

  it('draws a different schedule for a different seed', () => {
    const a = generateSchedule({ playerIds: roster(16), courts: 2, rounds: 8, seed: 1 })
    const b = generateSchedule({ playerIds: roster(16), courts: 2, rounds: 8, seed: 2 })
    expect(a.games).not.toEqual(b.games)
  })

  it('does not lock the roster into two fixed halves', () => {
    // The naive "whoever has played least plays next" rule makes the first
    // eight and the last eight alternate forever and never meet. Guard it.
    const s = generateSchedule({ playerIds: roster(16), courts: 2, rounds: 10, seed: 7 })
    const first = new Set(s.restsByRound[0])
    const round2 = new Set(s.restsByRound[2])
    const identical = first.size === round2.size && [...first].every((id) => round2.has(id))
    expect(identical).toBe(false)
  })
})

describe('generateSchedule - other shapes', () => {
  it.each([
    [8, 2, 6],
    [12, 2, 6],
    [16, 2, 8],
    [20, 2, 10],
    [16, 4, 5],
    [9, 2, 8],
    [13, 3, 8],
  ])('stays valid for %i players / %i courts / %i rounds', (players, courts, rounds) => {
    const s = generateSchedule({ playerIds: roster(players), courts, rounds, seed: 42, attempts: 80 })
    const expectedCourts = Math.min(courts, Math.floor(players / 4))
    expect(s.games).toHaveLength(rounds * expectedCourts)

    for (let r = 0; r < rounds; r++) {
      const onCourt = s.games.filter((g) => g.round === r).flatMap((g) => [...g.teamA, ...g.teamB])
      expect(new Set(onCourt).size).toBe(expectedCourts * 4)
    }
    // Everyone within one game of everyone else.
    expect(s.quality.gamesPerPlayer.max - s.quality.gamesPerPlayer.min).toBeLessThanOrEqual(1)
  })

  it('refuses a roster too small to field a game', () => {
    expect(() => generateSchedule({ playerIds: roster(3), courts: 1, rounds: 4 })).toThrow()
  })

  it('caps courts to what the roster can fill', () => {
    const s = generateSchedule({ playerIds: roster(9), courts: 4, rounds: 4, seed: 5, attempts: 40 })
    expect(s.courts).toBe(2)
  })
})

describe('planSession', () => {
  it('answers the 16 / 2 / 2-hour question', () => {
    const p = planSession({
      players: 16,
      courts: 2,
      rounds: 10,
      gameMinutes: 10,
      changeoverMinutes: 2,
    })
    expect(p.playingPerRound).toBe(8)
    expect(p.restingPerRound).toBe(8)
    expect(p.totalGames).toBe(20)
    expect(p.gamesPerPlayer).toEqual({ min: 5, max: 5 })
    expect(p.even).toBe(true)
    expect(p.totalMinutes).toBe(120)
    expect(p.courtMinutesPerPlayer).toBe(50)
  })

  it('flags an uneven share', () => {
    const p = planSession({
      players: 16,
      courts: 2,
      rounds: 9,
      gameMinutes: 10,
      changeoverMinutes: 2,
    })
    expect(p.even).toBe(false)
    expect(p.gamesPerPlayer).toEqual({ min: 4, max: 5 })
    expect(p.warnings.join(' ')).toContain('Uneven share')
  })

  it('suggests the largest even round count that fits the booking', () => {
    expect(
      suggestRounds({
        players: 16,
        courts: 2,
        availableMinutes: 110,
        gameMinutes: 10,
        changeoverMinutes: 2,
      }),
    ).toBe(8)
    expect(
      suggestRounds({
        players: 16,
        courts: 2,
        availableMinutes: 110,
        gameMinutes: 8,
        changeoverMinutes: 2,
      }),
    ).toBe(10)
  })
})

describe('clock helpers', () => {
  it('formats durations', () => {
    expect(humanMinutes(48)).toBe('48 min')
    expect(humanMinutes(120)).toBe('2 h')
    expect(humanMinutes(112)).toBe('1 h 52 min')
  })

  it('adds minutes to a start time', () => {
    expect(addMinutesToClock('15:00', 120)).toBe('5:00 PM')
    expect(addMinutesToClock('09:30', 100)).toBe('11:10 AM')
    expect(addMinutesToClock('12:00', 0)).toBe('12:00 PM')
  })
})


describe('streakCaps', () => {
  const quotaOf = (ids: string[], g: number) => new Map(ids.map((id) => [id, g]))

  it('allows two in a row in both directions for a half-full session', () => {
    const ids = roster(16)
    const caps = streakCaps(ids, quotaOf(ids, 5), 10)
    expect(caps.rest.get('p1')).toBe(2)
    expect(caps.play.get('p1')).toBe(2)
  })

  it('never drops to 1, which would force strict alternation', () => {
    // A cap of 1 splits the roster into two halves that never meet - the exact
    // failure this floor exists to prevent.
    const ids = roster(16)
    for (const rounds of [6, 8, 10, 12, 20]) {
      const caps = streakCaps(ids, quotaOf(ids, Math.floor(rounds / 2)), rounds)
      expect(caps.rest.get('p1')).toBeGreaterThanOrEqual(2)
      expect(caps.play.get('p1')).toBeGreaterThanOrEqual(2)
    }
  })

  it('lets a bench-heavy session sit people out longer', () => {
    // 20 players on 2 courts: 4 games each in 10 rounds, so 6 byes to spread
    // over 5 gaps - two in a row is unavoidable somewhere.
    const ids = roster(20)
    const caps = streakCaps(ids, quotaOf(ids, 4), 10)
    expect(caps.rest.get('p1')).toBe(2)
    expect(caps.play.get('p1')).toBe(2)
  })

  it('gives up on caps when everyone plays every round', () => {
    const ids = roster(8)
    const caps = streakCaps(ids, quotaOf(ids, 6), 6)
    expect(caps.play.get('p1')).toBe(6)
    expect(caps.rest.get('p1')).toBe(6)
  })
})

describe('play and bye balance across session shapes', () => {
  it.each([
    [16, 2, 10],
    [16, 2, 8],
    [12, 2, 6],
    [24, 3, 8],
  ])(
    'caps both streaks for %i players / %i courts / %i rounds',
    (players, courts, rounds) => {
      const s = generateSchedule({ playerIds: roster(players), courts, rounds, seed: 2024 })
      expect(s.quality.longestPlay).toBeLessThanOrEqual(2)
      expect(s.quality.longestRest).toBeLessThanOrEqual(2)
      expect(s.quality.repeatPartners).toBe(0)
      expect(s.quality.backToBack.max - s.quality.backToBack.min).toBeLessThanOrEqual(2)
      expect(s.quality.doubleRest.max - s.quality.doubleRest.min).toBeLessThanOrEqual(2)
    },
    30000,
  )

  it('does not pretend to cap streaks when there are no byes to use', () => {
    // 16 players on 4 courts: everyone is on court every single round, so there
    // is no bye available to break a run up with. Report it honestly rather
    // than claiming a cap we cannot enforce.
    const s = generateSchedule({ playerIds: roster(16), courts: 4, rounds: 5, seed: 11 })
    expect(s.quality.longestPlay).toBe(5)
    expect(s.quality.longestRest).toBe(0)
    expect(s.quality.gamesPerPlayer).toEqual({ min: 5, max: 5 })
    expect(s.quality.repeatPartners).toBe(0)
  })
})
