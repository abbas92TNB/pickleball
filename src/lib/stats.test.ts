import { describe, it, expect } from 'vitest'
import { computeStats, placings, headToHead, rankOrder } from './stats'
import type { Player, Schedule, ScoreDoc } from '../types'

const players: Player[] = ['Ali', 'Bea', 'Cy', 'Dee'].map((name, i) => ({
  id: `p${i + 1}`,
  playerId: `${1000 + i}`,
  name,
  status: 'approved' as const,
  joinedAt: 0,
}))

const schedule: Schedule = {
  seed: 1,
  rounds: 2,
  courts: 1,
  playerIds: players.map((p) => p.id),
  games: [
    { round: 0, court: 1, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] },
    { round: 1, court: 1, teamA: ['p1', 'p3'], teamB: ['p2', 'p4'] },
  ],
  restsByRound: [[], []],
  quality: {
    repeatPartners: 0,
    repeatOpponents: 0,
    gamesPerPlayer: { min: 2, max: 2 },
    longestRest: 0,
    longestPlay: 2,
    backToBack: { min: 1, max: 1 },
    doubleRest: { min: 0, max: 0 },
    coverage: 1,
    cost: 0,
    attempts: 1,
  },
}

const score = (round: number, a: number, b: number, by = 'Ali'): ScoreDoc => ({
  id: `r${round}c1`,
  round,
  court: 1,
  a,
  b,
  enteredBy: by,
  enteredAt: 0,
  editCount: 0,
})

describe('computeStats', () => {
  it('ignores games that have no score yet', () => {
    const s = computeStats(schedule, players, [])
    expect(s.gamesScored).toBe(0)
    expect(s.gamesTotal).toBe(2)
    for (const row of s.table) expect(row.games).toBe(0)
  })

  it('counts wins, losses and points for both sides', () => {
    const s = computeStats(schedule, players, [score(0, 13, 8)])
    const byName = new Map(s.table.map((r) => [r.name, r]))

    expect(byName.get('Ali')).toMatchObject({ games: 1, wins: 1, losses: 0, pointsFor: 13, diff: 5 })
    expect(byName.get('Bea')).toMatchObject({ games: 1, wins: 1, pointsFor: 13, diff: 5 })
    expect(byName.get('Cy')).toMatchObject({ games: 1, wins: 0, losses: 1, pointsFor: 8, diff: -5 })
    expect(s.gamesScored).toBe(1)
    expect(s.totalPoints).toBe(21)
  })

  it('awards 2 per win plus 1 per game played', () => {
    const s = computeStats(schedule, players, [score(0, 13, 8), score(1, 11, 13)])
    const byName = new Map(s.table.map((r) => [r.name, r]))
    // Ali: won R0, lost R1 -> 1 win, 2 games -> 2 + 2 = 4
    expect(byName.get('Ali')?.funPoints).toBe(4)
    // Dee: lost R0, won R1 -> same
    expect(byName.get('Dee')?.funPoints).toBe(4)
    // Bea: won both -> 2*2 + 2 = 6
    expect(byName.get('Bea')?.funPoints).toBe(6)
  })

  it('tracks win streaks and best margin', () => {
    const s = computeStats(schedule, players, [score(0, 13, 3), score(1, 5, 13)])
    const bea = s.table.find((r) => r.name === 'Bea')
    expect(bea?.longestWinStreak).toBe(2)
    expect(bea?.bestMargin).toBe(10)
    const ali = s.table.find((r) => r.name === 'Ali')
    expect(ali?.longestWinStreak).toBe(1)
  })

  it('records who you played with', () => {
    const s = computeStats(schedule, players, [score(0, 13, 8), score(1, 11, 13)])
    expect(s.table.find((r) => r.name === 'Ali')?.partners).toEqual(['Bea', 'Cy'])
  })

  it('picks out the closest and biggest games', () => {
    const s = computeStats(schedule, players, [score(0, 13, 12), score(1, 13, 2)])
    expect(s.closest?.margin).toBe(1)
    expect(s.closest?.slot.round).toBe(0)
    expect(s.biggest?.margin).toBe(11)
    expect(s.biggest?.slot.round).toBe(1)
  })

  it('handles a tie without crediting a win to either side', () => {
    const s = computeStats(schedule, players, [score(0, 10, 10)])
    for (const row of s.table) {
      if (row.games > 0) {
        expect(row.wins).toBe(0)
        expect(row.losses).toBe(0)
        expect(row.ties).toBe(1)
      }
    }
  })

  it('ranks by wins, then point difference', () => {
    const s = computeStats(schedule, players, [score(0, 13, 8), score(1, 13, 11)])
    // Ali wins both (diff +5 +2 = +7), Bea 1 win, Cy 1 win, Dee 0 wins.
    expect(s.table[0].name).toBe('Ali')
    expect(s.table[3].name).toBe('Dee')
  })

  it('survives a score for a slot that is not in the schedule', () => {
    const stray: ScoreDoc = { ...score(0, 13, 8), id: 'r9c9', round: 9, court: 9 }
    const s = computeStats(schedule, players, [stray])
    expect(s.gamesScored).toBe(0)
  })

  it('handles no schedule at all', () => {
    const s = computeStats(null, players, [])
    expect(s.gamesTotal).toBe(0)
    expect(s.table).toHaveLength(4)
  })
})

describe('placings', () => {
  it('shares a place between tied players and skips the next', () => {
    const table = computeStats(schedule, players, [score(0, 13, 8)]).table
    const p = placings(table)
    const winners = table.filter((r) => r.wins === 1).map((r) => p.get(r.id))
    expect(new Set(winners).size).toBe(1)
    expect(Math.min(...(winners as number[]))).toBe(1)
  })
})

describe('headToHead', () => {
  it('counts partners and opponents across scored games only', () => {
    const h = headToHead(schedule, 'p1', [score(0, 13, 8)])
    expect(h.withCount.get('p2')).toBe(1)
    expect(h.againstCount.get('p3')).toBe(1)
    expect(h.againstCount.get('p4')).toBe(1)
    expect(h.withCount.get('p3')).toBeUndefined()
  })
})

describe('rankOrder', () => {
  it('falls back to name when everything else ties', () => {
    const base = { games: 1, losses: 0, ties: 0, pointsAgainst: 0, winPct: 1, avgPointsFor: 1,
      longestWinStreak: 1, bestMargin: 1, partners: [], bestPartner: null, funPoints: 3 }
    const a = { ...base, id: 'x', name: 'Zed', wins: 1, diff: 0, pointsFor: 5 }
    const b = { ...base, id: 'y', name: 'Abe', wins: 1, diff: 0, pointsFor: 5 }
    expect(rankOrder(a, b)).toBeGreaterThan(0)
  })
})
