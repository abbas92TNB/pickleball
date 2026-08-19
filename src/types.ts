// ---------------------------------------------------------------------------
// Domain types. One session = one afternoon of play, created by any host, with
// open self-registration by players and a host approval step.
// ---------------------------------------------------------------------------

export type PlayerStatus = 'pending' | 'approved' | 'declined'

export interface Player {
  /**
   * Firestore document id, which is the player's login ID normalised
   * (uppercased, spaces and punctuation stripped). Doubling as the doc id is
   * what makes IDs unique within a session for free.
   */
  id: string
  /** The ID exactly as the player typed it, for display back to them. */
  playerId: string
  name: string
  status: PlayerStatus
  /** ms epoch */
  joinedAt: number
}

/** One game on one court in one round. Player ids, two per team. */
export interface GameSlot {
  /** 0-based */
  round: number
  /** 1-based, matches the physical court number */
  court: number
  teamA: [string, string]
  teamB: [string, string]
}

export interface ScheduleQuality {
  /** how many times a pair ended up partners more than once */
  repeatPartners: number
  /** how many times a pair faced each other more than once */
  repeatOpponents: number
  /** min/max games played across the roster */
  gamesPerPlayer: { min: number; max: number }
  /** worst run of consecutive rounds any single player sits out */
  longestRest: number
  /** worst run of consecutive rounds any single player plays */
  longestPlay: number
  /** how many back-to-back games each player does, least to most */
  backToBack: { min: number; max: number }
  /** how many double benchings each player takes, least to most */
  doubleRest: { min: number; max: number }
  /** share of all possible pairs that meet at least once, 0..1 */
  coverage: number
  cost: number
  attempts: number
}

export interface Schedule {
  seed: number
  rounds: number
  courts: number
  /** roster snapshot the schedule was built from, in draw order */
  playerIds: string[]
  games: GameSlot[]
  /** player ids sitting out, indexed by round */
  restsByRound: string[][]
  /** quality report from the generator, shown to the host */
  quality: ScheduleQuality
}

/** A score is its own document so four phones can write without clobbering. */
export interface ScoreDoc {
  /** `r{round}c{court}` */
  id: string
  round: number
  court: number
  a: number
  b: number
  /** display name of whoever last saved it - visible to everyone */
  enteredBy: string
  /** ms epoch */
  enteredAt: number
  editCount: number
}

export interface SessionConfig {
  name: string
  courts: number
  rounds: number
  gameMinutes: number
  changeoverMinutes: number
  pointTarget: number
  /** false = the horn is final and a draw stands; true = play one more rally */
  goldenPoint: boolean
}

export type SessionStatus = 'setup' | 'live' | 'done'

export interface Session extends SessionConfig {
  id: string
  /** short join code, e.g. "K7RMQ" - also the document id */
  code: string
  hostUid: string
  /** so a host can recognise their own session in a list */
  hostName: string
  createdAt: number
  status: SessionStatus
  /** 0-based index into schedule rounds */
  currentRound: number
  timerRunning: boolean
  /** ms epoch when the current running segment began */
  timerStartedAt: number | null
  /** ms accumulated across previous segments of this round */
  timerElapsedMs: number
  /** null until the host generates it at start */
  schedule: Schedule | null
}

// --------------------------------- stats -----------------------------------

export interface PlayerStat {
  id: string
  name: string
  games: number
  wins: number
  losses: number
  /** draws are legal: if the horn goes with the score level, it stands */
  ties: number
  pointsFor: number
  pointsAgainst: number
  diff: number
  /** 2 per win, 1 per draw, 1 per game played - the friendly headline number */
  funPoints: number
  winPct: number
  avgPointsFor: number
  longestWinStreak: number
  bestMargin: number
  partners: string[]
  bestPartner: { name: string; wins: number; games: number } | null
}

export interface SessionStats {
  table: PlayerStat[]
  gamesScored: number
  gamesTotal: number
  totalPoints: number
  closest: { slot: GameSlot; score: ScoreDoc; margin: number } | null
  biggest: { slot: GameSlot; score: ScoreDoc; margin: number } | null
}
