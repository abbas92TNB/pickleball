// ---------------------------------------------------------------------------
// Leaderboard + full stats. Pure functions over (schedule, players, scores).
// Only games with a recorded score count; unplayed rounds are ignored, so the
// table is meaningful from the very first result.
// ---------------------------------------------------------------------------

import type { GameSlot, Player, PlayerStat, Schedule, ScoreDoc, SessionStats } from '../types'
import { slotId, sideOf } from './schedule'

// Draws are legal in this format: if the horn goes with the score level, the
// score stands. So the headline number has to reward a draw above a loss.
/** A win. */
export const WIN_POINTS = 2
/** A draw - better than losing, not as good as winning. */
export const DRAW_POINTS = 1
/** Turning up and playing the game at all. */
export const PLAY_POINTS = 1

interface Acc {
  games: number
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  bestMargin: number
  longestWinStreak: number
  currentStreak: number
  partners: Map<string, { games: number; wins: number }>
}

const blank = (): Acc => ({
  games: 0,
  wins: 0,
  losses: 0,
  ties: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  bestMargin: 0,
  longestWinStreak: 0,
  currentStreak: 0,
  partners: new Map(),
})

export function computeStats(
  schedule: Schedule | null,
  players: Player[],
  scores: ScoreDoc[],
): SessionStats {
  const nameOf = new Map(players.map((p) => [p.id, p.name]))
  const acc = new Map<string, Acc>(players.map((p) => [p.id, blank()]))
  const byId = new Map(scores.map((s) => [s.id, s]))

  let gamesScored = 0
  let totalPoints = 0
  let closest: SessionStats['closest'] = null
  let biggest: SessionStats['biggest'] = null

  const slots: GameSlot[] = schedule
    ? schedule.games.slice().sort((x, y) => x.round - y.round || x.court - y.court)
    : []

  for (const slot of slots) {
    const score = byId.get(slotId(slot.round, slot.court))
    if (!score) continue
    gamesScored++
    totalPoints += score.a + score.b

    const margin = Math.abs(score.a - score.b)
    if (!closest || margin < closest.margin) closest = { slot, score, margin }
    if (!biggest || margin > biggest.margin) biggest = { slot, score, margin }

    const sides: Array<{ team: [string, string]; own: number; opp: number }> = [
      { team: slot.teamA, own: score.a, opp: score.b },
      { team: slot.teamB, own: score.b, opp: score.a },
    ]

    for (const { team, own, opp } of sides) {
      for (const id of team) {
        const a = acc.get(id)
        if (!a) continue
        a.games++
        a.pointsFor += own
        a.pointsAgainst += opp
        if (own > opp) {
          a.wins++
          a.currentStreak++
          a.longestWinStreak = Math.max(a.longestWinStreak, a.currentStreak)
          a.bestMargin = Math.max(a.bestMargin, own - opp)
        } else if (own < opp) {
          a.losses++
          a.currentStreak = 0
        } else {
          a.ties++
          a.currentStreak = 0
        }
        const mate = team.find((x) => x !== id)
        if (mate) {
          const rec = a.partners.get(mate) ?? { games: 0, wins: 0 }
          rec.games++
          if (own > opp) rec.wins++
          a.partners.set(mate, rec)
        }
      }
    }
  }

  const table: PlayerStat[] = players.map((p) => {
    const a = acc.get(p.id) ?? blank()
    const diff = a.pointsFor - a.pointsAgainst

    let bestPartner: PlayerStat['bestPartner'] = null
    for (const [mateId, rec] of a.partners) {
      const better =
        !bestPartner ||
        rec.wins > bestPartner.wins ||
        (rec.wins === bestPartner.wins && rec.games < bestPartner.games)
      if (better && rec.wins > 0) {
        bestPartner = { name: nameOf.get(mateId) ?? '?', wins: rec.wins, games: rec.games }
      }
    }

    return {
      id: p.id,
      name: p.name,
      games: a.games,
      wins: a.wins,
      losses: a.losses,
      ties: a.ties,
      pointsFor: a.pointsFor,
      pointsAgainst: a.pointsAgainst,
      diff,
      funPoints: a.wins * WIN_POINTS + a.ties * DRAW_POINTS + a.games * PLAY_POINTS,
      winPct: a.games ? a.wins / a.games : 0,
      avgPointsFor: a.games ? a.pointsFor / a.games : 0,
      longestWinStreak: a.longestWinStreak,
      bestMargin: a.bestMargin,
      partners: [...a.partners.keys()].map((id) => nameOf.get(id) ?? '?').sort(),
      bestPartner,
    }
  })

  table.sort(rankOrder)

  return {
    table,
    gamesScored,
    gamesTotal: slots.length,
    totalPoints,
    closest,
    biggest,
  }
}

/**
 * Fun points first (which already folds in wins, draws and games played), then
 * point difference, then points scored, then name so the order is stable.
 */
export function rankOrder(a: PlayerStat, b: PlayerStat): number {
  return (
    b.funPoints - a.funPoints ||
    b.diff - a.diff ||
    b.pointsFor - a.pointsFor ||
    a.name.localeCompare(b.name)
  )
}

/**
 * Dense ranking with shared places, so joint 2nd is shown as 2, 2, 4.
 * Returns a map of player id to displayed place.
 */
export function placings(table: PlayerStat[]): Map<string, number> {
  const out = new Map<string, number>()
  let place = 0
  table.forEach((row, i) => {
    const prev = table[i - 1]
    const tied =
      prev &&
      prev.funPoints === row.funPoints &&
      prev.diff === row.diff &&
      prev.pointsFor === row.pointsFor
    if (!tied) place = i + 1
    out.set(row.id, place)
  })
  return out
}

/** Everyone this player shared a court with, and how it went. Used on /stats. */
export function headToHead(
  schedule: Schedule | null,
  playerId: string,
  scores: ScoreDoc[],
): { withCount: Map<string, number>; againstCount: Map<string, number> } {
  const withCount = new Map<string, number>()
  const againstCount = new Map<string, number>()
  if (!schedule) return { withCount, againstCount }
  const scored = new Set(scores.map((s) => s.id))

  for (const slot of schedule.games) {
    if (!scored.has(slotId(slot.round, slot.court))) continue
    const side = sideOf(slot, playerId)
    if (!side) continue
    const own = side === 'a' ? slot.teamA : slot.teamB
    const other = side === 'a' ? slot.teamB : slot.teamA
    for (const id of own) {
      if (id !== playerId) withCount.set(id, (withCount.get(id) ?? 0) + 1)
    }
    for (const id of other) againstCount.set(id, (againstCount.get(id) ?? 0) + 1)
  }
  return { withCount, againstCount }
}
