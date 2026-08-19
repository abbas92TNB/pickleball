// ---------------------------------------------------------------------------
// Session planning maths. Answers the host's real question up front:
// "16 players, 2 courts, 2 hours - how many rounds, and does everyone get a
// fair share?" Pure, so it drives both the setup screen and the tests.
// ---------------------------------------------------------------------------

export interface PlanInput {
  players: number
  courts: number
  rounds: number
  gameMinutes: number
  changeoverMinutes: number
}

export interface Plan {
  /** courts actually usable given the roster size */
  courtsUsed: number
  /** players on court each round */
  playingPerRound: number
  restingPerRound: number
  roundMinutes: number
  totalMinutes: number
  totalGames: number
  gamesPerPlayer: { min: number; max: number }
  /** true when every player gets exactly the same number of games */
  even: boolean
  /** minutes of actual play each player gets */
  courtMinutesPerPlayer: number
  warnings: string[]
}

export function planSession(input: PlanInput): Plan {
  const { players, rounds, gameMinutes, changeoverMinutes } = input
  const warnings: string[] = []

  const courtsUsed = Math.max(1, Math.min(input.courts, Math.floor(players / 4)))
  const playingPerRound = courtsUsed * 4
  const restingPerRound = Math.max(0, players - playingPerRound)
  const roundMinutes = gameMinutes + changeoverMinutes
  const totalMinutes = rounds * roundMinutes
  const totalGames = rounds * courtsUsed

  const slots = rounds * playingPerRound
  const base = players > 0 ? Math.floor(slots / players) : 0
  const remainder = players > 0 ? slots - base * players : 0
  const gamesPerPlayer = { min: base, max: remainder > 0 ? base + 1 : base }
  const even = remainder === 0

  if (players < 4) warnings.push('Need at least 4 players to run a round.')
  if (courtsUsed < input.courts) {
    warnings.push(
      `Only ${courtsUsed} court${courtsUsed === 1 ? '' : 's'} can be filled with ${players} players.`,
    )
  }
  if (!even) {
    warnings.push(
      `Uneven share: ${remainder} player${remainder === 1 ? '' : 's'} get ${base + 1} games, the rest get ${base}. ` +
        `Pick a round count that divides evenly to fix it.`,
    )
  }
  if (base === 0) warnings.push('Some players would not get a single game.')
  if (restingPerRound >= playingPerRound && restingPerRound > 0) {
    warnings.push(
      `${restingPerRound} of ${players} sit out every round - that is the court limit, not the schedule.`,
    )
  }

  return {
    courtsUsed,
    playingPerRound,
    restingPerRound,
    roundMinutes,
    totalMinutes,
    totalGames,
    gamesPerPlayer,
    even,
    courtMinutesPerPlayer: gamesPerPlayer.min * gameMinutes,
    warnings,
  }
}

/**
 * Most rounds that fit in `availableMinutes`, preferring a count that gives
 * everyone exactly the same number of games. Falls back to the plain fit if no
 * even option exists inside the time budget.
 */
export function suggestRounds(input: {
  players: number
  courts: number
  availableMinutes: number
  gameMinutes: number
  changeoverMinutes: number
}): number {
  const courtsUsed = Math.max(1, Math.min(input.courts, Math.floor(input.players / 4)))
  const perRound = courtsUsed * 4
  const roundMinutes = Math.max(1, input.gameMinutes + input.changeoverMinutes)
  const fits = Math.max(1, Math.floor(input.availableMinutes / roundMinutes))

  for (let r = fits; r >= 1; r--) {
    if ((r * perRound) % input.players === 0) return r
  }
  return fits
}

/** "1 h 52 m" / "48 m" */
export function humanMinutes(mins: number): string {
  const m = Math.max(0, Math.round(mins))
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h === 0) return `${rem} min`
  if (rem === 0) return `${h} h`
  return `${h} h ${rem} min`
}

/** Clock time `startHHMM` + `mins`, as "4:52 PM". */
export function addMinutesToClock(startHHMM: string, mins: number): string {
  const [hh, mm] = startHHMM.split(':').map((n) => parseInt(n, 10))
  if (Number.isNaN(hh) || Number.isNaN(mm)) return ''
  const total = hh * 60 + mm + Math.round(mins)
  const h24 = Math.floor(total / 60) % 24
  const m = total % 60
  const suffix = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}
