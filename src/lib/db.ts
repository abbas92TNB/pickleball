// ---------------------------------------------------------------------------
// Every Firestore read and write lives here. Pages use the hooks; nothing else
// in the app touches Firestore directly.
//
// Shape:
//   sessions/{CODE}                    config + fixed schedule + round state
//   sessions/{CODE}/players/{ID}       one doc per player, id = normalised
//                                      login ID, which makes IDs unique for free
//   sessions/{CODE}/scores/{slotId}    one doc per game, so four phones editing
//                                      different courts never clobber each other
//
// The app is open: anyone can create a session, anyone can register into one by
// scanning its QR, and the host approves. Nothing here is a secret - see the
// note on ID logins in the README.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db, firebaseReady } from './firebase'
import { slotId } from './schedule'
import type {
  Player,
  PlayerStatus,
  Schedule,
  ScoreDoc,
  Session,
  SessionConfig,
} from '../types'

const SESSIONS = 'sessions'

/** Ambiguous characters (O/0, I/1) left out so codes are easy to read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function makeCode(len = 5): string {
  let out = ''
  const bytes = new Uint32Array(len)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out
}

/**
 * Login IDs are matched loosely on purpose - someone typing "a-12 345" on a
 * phone keyboard should still find the record they created as "A12345".
 */
export function normalizeId(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const sessionRef = (code: string) => doc(db, SESSIONS, code.toUpperCase())
const playersRef = (code: string) => collection(db, SESSIONS, code.toUpperCase(), 'players')
const scoresRef = (code: string) => collection(db, SESSIONS, code.toUpperCase(), 'scores')

export const DEFAULT_CONFIG: SessionConfig = {
  name: 'Pickleball Fun Day',
  courts: 2,
  rounds: 10,
  gameMinutes: 10,
  changeoverMinutes: 2,
  pointTarget: 13,
  goldenPoint: false,
}

// --------------------------------- reads -----------------------------------

interface SessionState {
  /** which code this result is for, so a stale result never leaks through */
  code: string | null
  session: Session | null
  missing: boolean
}

export function useSession(code: string | undefined): {
  session: Session | null
  loading: boolean
  missing: boolean
} {
  // One piece of state, only ever written from the snapshot callback. `loading`
  // is then derived by comparing the code we have a result for against the code
  // being asked about, which avoids setting state inside the effect body.
  const [state, setState] = useState<SessionState>({ code: null, session: null, missing: false })

  useEffect(() => {
    if (!code || !firebaseReady) return
    return onSnapshot(
      sessionRef(code),
      (snap) => {
        setState(
          snap.exists()
            ? {
                code,
                session: { ...(snap.data() as Session), id: snap.id, code: snap.id },
                missing: false,
              }
            : { code, session: null, missing: true },
        )
      },
      () => setState({ code, session: null, missing: true }),
    )
  }, [code])

  const settled = state.code === code
  return {
    session: settled ? state.session : null,
    loading: Boolean(code) && firebaseReady && !settled,
    missing: settled && state.missing,
  }
}

export function usePlayers(code: string | undefined): Player[] {
  const [players, setPlayers] = useState<Player[]>([])

  useEffect(() => {
    if (!code || !firebaseReady) return
    const stop = onSnapshot(playersRef(code), (snap) => {
      const list = snap.docs.map((d) => ({ ...(d.data() as Player), id: d.id }))
      list.sort((a, b) => a.joinedAt - b.joinedAt)
      setPlayers(list)
    })
    return stop
  }, [code])

  return players
}

export function useScores(code: string | undefined): ScoreDoc[] {
  const [scores, setScores] = useState<ScoreDoc[]>([])

  useEffect(() => {
    if (!code || !firebaseReady) return
    const stop = onSnapshot(scoresRef(code), (snap) => {
      setScores(snap.docs.map((d) => ({ ...(d.data() as ScoreDoc), id: d.id })))
    })
    return stop
  }, [code])

  return scores
}

export async function sessionExists(code: string): Promise<boolean> {
  const snap = await getDoc(sessionRef(code))
  return snap.exists()
}

/** Used by the ID login box. Returns null when that ID has not registered. */
export async function findPlayer(code: string, rawId: string): Promise<Player | null> {
  const id = normalizeId(rawId)
  if (!id) return null
  const snap = await getDoc(doc(playersRef(code), id))
  return snap.exists() ? { ...(snap.data() as Player), id: snap.id } : null
}

// -------------------------------- lifecycle --------------------------------

export async function createSession(
  config: SessionConfig,
  hostUid: string,
  hostName: string,
): Promise<string> {
  let code = makeCode()
  for (let i = 0; i < 6 && (await sessionExists(code)); i++) code = makeCode()

  const session: Omit<Session, 'id'> = {
    ...config,
    code,
    hostUid,
    hostName: hostName.trim() || 'Host',
    createdAt: Date.now(),
    status: 'setup',
    currentRound: 0,
    timerRunning: false,
    timerStartedAt: null,
    timerElapsedMs: 0,
    schedule: null,
  }
  await setDoc(sessionRef(code), { ...session, createdAtServer: serverTimestamp() })
  return code
}

export async function updateConfig(code: string, patch: Partial<SessionConfig>): Promise<void> {
  await updateDoc(sessionRef(code), patch)
}

/** Stores the drawn schedule and flips the session live. */
export async function startSession(code: string, schedule: Schedule): Promise<void> {
  await updateDoc(sessionRef(code), {
    schedule,
    status: 'live',
    currentRound: 0,
    timerRunning: false,
    timerStartedAt: null,
    timerElapsedMs: 0,
  })
}

/** Redraw without leaving the live state - used by "shuffle again". */
export async function replaceSchedule(code: string, schedule: Schedule): Promise<void> {
  await updateDoc(sessionRef(code), {
    schedule,
    currentRound: 0,
    timerRunning: false,
    timerStartedAt: null,
    timerElapsedMs: 0,
  })
}

export async function setStatus(code: string, status: Session['status']): Promise<void> {
  await updateDoc(sessionRef(code), { status })
}

/** Back to the roster screen, keeping players and scores. */
export async function reopenSetup(code: string): Promise<void> {
  await updateDoc(sessionRef(code), { status: 'setup', timerRunning: false, timerStartedAt: null })
}

// ------------------------------- registration ------------------------------

export class IdTakenError extends Error {
  existingName: string

  constructor(existingName: string) {
    super(`That ID is already registered to ${existingName}`)
    this.name = 'IdTakenError'
    this.existingName = existingName
  }
}

/**
 * Self-registration from the QR code. The transaction is what stops two people
 * claiming the same ID at the same time - the doc id IS the normalised ID, so
 * uniqueness is structural rather than checked after the fact.
 */
export async function registerPlayer(
  code: string,
  rawId: string,
  name: string,
): Promise<Player> {
  const id = normalizeId(rawId)
  if (!id) throw new Error('Enter your ID')
  if (!name.trim()) throw new Error('Enter your name')

  const ref = doc(playersRef(code), id)
  const player: Omit<Player, 'id'> = {
    playerId: rawId.trim(),
    name: name.trim(),
    status: 'pending',
    joinedAt: Date.now(),
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists()) {
      const existing = snap.data() as Player
      throw new IdTakenError(existing.name)
    }
    tx.set(ref, player)
  })

  return { ...player, id }
}

/** Host adds someone directly - already approved, no waiting. */
export async function addPlayerAsHost(
  code: string,
  rawId: string,
  name: string,
): Promise<Player> {
  const id = normalizeId(rawId)
  if (!id) throw new Error('Enter an ID')
  const ref = doc(playersRef(code), id)
  const player: Omit<Player, 'id'> = {
    playerId: rawId.trim(),
    name: name.trim(),
    status: 'approved',
    joinedAt: Date.now(),
  }
  await setDoc(ref, player, { merge: true })
  return { ...player, id }
}

export async function setPlayerStatus(
  code: string,
  playerDocId: string,
  status: PlayerStatus,
): Promise<void> {
  await updateDoc(doc(playersRef(code), playerDocId), { status })
}

export async function approveAll(code: string, playerDocIds: string[]): Promise<void> {
  const batch = writeBatch(db)
  for (const id of playerDocIds) batch.update(doc(playersRef(code), id), { status: 'approved' })
  await batch.commit()
}

export async function removePlayer(code: string, playerDocId: string): Promise<void> {
  await deleteDoc(doc(playersRef(code), playerDocId))
}

export async function renamePlayer(
  code: string,
  playerDocId: string,
  name: string,
): Promise<void> {
  await updateDoc(doc(playersRef(code), playerDocId), { name: name.trim() })
}

// ---------------------------------- rounds ---------------------------------

export async function goToRound(code: string, round: number): Promise<void> {
  await updateDoc(sessionRef(code), {
    currentRound: round,
    timerRunning: false,
    timerStartedAt: null,
    timerElapsedMs: 0,
  })
}

export async function startTimer(code: string): Promise<void> {
  await updateDoc(sessionRef(code), { timerRunning: true, timerStartedAt: Date.now() })
}

export async function pauseTimer(code: string, elapsedMs: number): Promise<void> {
  await updateDoc(sessionRef(code), {
    timerRunning: false,
    timerStartedAt: null,
    timerElapsedMs: elapsedMs,
  })
}

export async function resetTimer(code: string): Promise<void> {
  await updateDoc(sessionRef(code), {
    timerRunning: false,
    timerStartedAt: null,
    timerElapsedMs: 0,
  })
}

// ---------------------------------- scores ---------------------------------

/**
 * Any of the four players in a game can save or change its score. We keep the
 * name of whoever touched it last so the table is self-policing rather than
 * locked. Equal scores are allowed - if the horn goes level, that is a draw.
 */
export async function saveScore(
  code: string,
  round: number,
  court: number,
  a: number,
  b: number,
  enteredBy: string,
  previous?: ScoreDoc,
): Promise<void> {
  const payload: Omit<ScoreDoc, 'id'> = {
    round,
    court,
    a,
    b,
    enteredBy,
    enteredAt: Date.now(),
    editCount: previous ? previous.editCount + 1 : 0,
  }
  await setDoc(doc(scoresRef(code), slotId(round, court)), payload)
}

export async function clearScore(code: string, round: number, court: number): Promise<void> {
  await deleteDoc(doc(scoresRef(code), slotId(round, court)))
}

/** Wipe every score - the host's "start the fun over" button. */
export async function clearAllScores(code: string): Promise<void> {
  const snap = await getDocs(scoresRef(code))
  const batch = writeBatch(db)
  for (const d of snap.docs) batch.delete(d.ref)
  await batch.commit()
}

// ----------------------------- device identity -----------------------------

const idKey = (code: string) => `pf:${code.toUpperCase()}:playerId`

export function rememberMe(code: string, playerDocId: string): void {
  try {
    localStorage.setItem(idKey(code), playerDocId)
  } catch {
    /* private browsing - the app still works, it just forgets who you are */
  }
}

export function recallMe(code: string): string | null {
  try {
    return localStorage.getItem(idKey(code))
  } catch {
    return null
  }
}

export function forgetMe(code: string): void {
  try {
    localStorage.removeItem(idKey(code))
  } catch {
    /* ignore */
  }
}

const hostKey = 'pf:hostedSessions'

export function rememberHosted(code: string): void {
  try {
    const list = new Set<string>(JSON.parse(localStorage.getItem(hostKey) ?? '[]'))
    list.add(code.toUpperCase())
    localStorage.setItem(hostKey, JSON.stringify([...list].slice(-12)))
  } catch {
    /* ignore */
  }
}

export function recallHosted(): string[] {
  try {
    return JSON.parse(localStorage.getItem(hostKey) ?? '[]') as string[]
  } catch {
    return []
  }
}

const nameKey = 'pf:hostName'

export function rememberHostName(name: string): void {
  try {
    localStorage.setItem(nameKey, name)
  } catch {
    /* ignore */
  }
}

export function recallHostName(): string {
  try {
    return localStorage.getItem(nameKey) ?? ''
  } catch {
    return ''
  }
}
