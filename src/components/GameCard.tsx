import { useState } from 'react'
import { Btn, Card, Dot, Pill } from '../ui'
import { saveScore, clearScore } from '../lib/db'
import { slotId } from '../lib/schedule'
import type { GameSlot, ScoreDoc } from '../types'

// ---------------------------------------------------------------------------
// One game: the matchup, and the score entry.
//
// Deliberately unlocked. Any of the four players on court can save the score
// and any of them can change it afterwards - we just record who touched it last
// so the table polices itself socially rather than technically.
// ---------------------------------------------------------------------------

interface Props {
  code: string
  slot: GameSlot
  score?: ScoreDoc
  nameOf: (id: string) => string
  /** the player using this device, if they have claimed a name */
  meId: string | null
  meName: string | null
  isHost: boolean
  pointTarget: number
  /** when false, a level score at the horn simply stands as a draw */
  goldenPoint?: boolean
  /** dim games from rounds that are not the current one */
  muted?: boolean
}

export function GameCard({
  code,
  slot,
  score,
  nameOf,
  meId,
  meName,
  isHost,
  pointTarget,
  goldenPoint = false,
  muted = false,
}: Props) {
  const onCourt = [...slot.teamA, ...slot.teamB]
  const iAmPlaying = meId ? onCourt.includes(meId) : false
  const canEdit = iAmPlaying || isHost

  // The draft only exists while the editor is open, and is seeded from whatever
  // the score is at the moment it opens. That way someone else's edit is always
  // picked up (no stale local copy hanging around) with no syncing effect.
  const [draft, setDraft] = useState<{ a: number; b: number } | null>(null)
  const [saving, setSaving] = useState(false)

  const open = draft !== null
  const a = draft?.a ?? 0
  const b = draft?.b ?? 0
  const setA = (n: number) => setDraft((d) => ({ a: n, b: d?.b ?? 0 }))
  const setB = (n: number) => setDraft((d) => ({ a: d?.a ?? 0, b: n }))
  const openEditor = () => setDraft({ a: score?.a ?? 0, b: score?.b ?? 0 })
  const closeEditor = () => setDraft(null)

  const aWon = score ? score.a > score.b : false
  const bWon = score ? score.b > score.a : false
  const tied = score ? score.a === score.b : false

  async function save() {
    if (!canEdit) return
    setSaving(true)
    try {
      await saveScore(code, slot.round, slot.court, a, b, meName ?? 'Host', score)
      closeEditor()
    } finally {
      setSaving(false)
    }
  }

  async function wipe() {
    setSaving(true)
    try {
      await clearScore(code, slot.round, slot.court)
      closeEditor()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      glow={iAmPlaying && !muted}
      className={`overflow-hidden ${muted ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between border-b border-court-700/60 bg-court-850/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm text-slate-200">Court {slot.court}</span>
          {iAmPlaying && !muted && <Pill tone="lime">You</Pill>}
        </div>
        {score ? (
          <Pill tone={tied ? 'gold' : 'aqua'}>{tied ? 'Tied' : 'Final'}</Pill>
        ) : (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            No score yet
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-3">
        <TeamBlock
          ids={slot.teamA}
          nameOf={nameOf}
          meId={meId}
          won={aWon}
          score={score?.a}
          align="left"
        />
        <div className="px-1 text-center font-display text-xs text-slate-600">VS</div>
        <TeamBlock
          ids={slot.teamB}
          nameOf={nameOf}
          meId={meId}
          won={bWon}
          score={score?.b}
          align="right"
        />
      </div>

      {score && (
        <div className="flex items-center justify-between gap-2 border-t border-court-700/50 px-3 py-2 text-[11px] text-slate-500">
          <span>
            Entered by <span className="font-semibold text-slate-400">{score.enteredBy}</span>
            {score.editCount > 0 && ` · edited ${score.editCount}x`}
          </span>
          {canEdit && !open && (
            <button onClick={openEditor} className="font-semibold text-aqua hover:text-aqua/80">
              Change
            </button>
          )}
        </div>
      )}

      {!score && !open && (
        <div className="border-t border-court-700/50 px-3 py-2.5">
          {canEdit ? (
            <Btn size="sm" className="w-full" onClick={openEditor}>
              Enter score
            </Btn>
          ) : (
            <p className="text-center text-[11px] text-slate-500">
              One of the four on court enters this
            </p>
          )}
        </div>
      )}

      {open && (
        <div className="animate-pop border-t border-court-700/50 bg-court-850/40 p-3">
          <div className="grid grid-cols-2 gap-3">
            <Stepper
              label={slot.teamA.map(nameOf).join(' + ')}
              value={a}
              onChange={setA}
              max={pointTarget + 12}
            />
            <Stepper
              label={slot.teamB.map(nameOf).join(' + ')}
              value={b}
              onChange={setB}
              max={pointTarget + 12}
            />
          </div>
          <div className="mt-3 flex gap-2">
            <Btn className="flex-1" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save score'}
            </Btn>
            <Btn variant="ghost" onClick={closeEditor} disabled={saving}>
              Cancel
            </Btn>
            {score && (
              <Btn variant="danger" onClick={wipe} disabled={saving} title="Remove this score">
                Clear
              </Btn>
            )}
          </div>
          {a === b && a > 0 && (
            <p className="mt-2 rounded-lg border border-gold/40 bg-gold/10 px-2 py-1.5 text-center text-[11px] text-gold">
              {goldenPoint
                ? `Level at ${a}. This session plays a golden point - settle it on court, then save the winner.`
                : `Level at ${a}. A draw is a valid result - save it as it stands.`}
            </p>
          )}
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Saved as <span className="font-semibold text-slate-400">{meName ?? 'Host'}</span> - any
            of the four of you can change it later
          </p>
        </div>
      )}
    </Card>
  )
}

function TeamBlock({
  ids,
  nameOf,
  meId,
  won,
  score,
  align,
}: {
  ids: [string, string]
  nameOf: (id: string) => string
  meId: string | null
  won: boolean
  score?: number
  align: 'left' | 'right'
}) {
  const right = align === 'right'
  return (
    <div className={`min-w-0 ${right ? 'text-right' : 'text-left'}`}>
      {score !== undefined && (
        <div
          className={`font-display text-3xl tabnum leading-none ${won ? 'text-lime' : 'text-slate-400'}`}
        >
          {score}
        </div>
      )}
      <div className={`mt-1.5 space-y-1 ${right ? 'items-end' : 'items-start'} flex flex-col`}>
        {ids.map((id) => (
          <div
            key={id}
            className={`flex min-w-0 items-center gap-1.5 ${right ? 'flex-row-reverse' : ''}`}
          >
            <Dot name={nameOf(id)} size="sm" />
            <span
              className={`truncate text-sm ${
                id === meId ? 'font-bold text-lime' : 'font-medium text-slate-300'
              }`}
            >
              {nameOf(id)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stepper({
  label,
  value,
  onChange,
  max,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  max: number
}) {
  return (
    <div className="rounded-xl border border-court-700 bg-court-900 p-2">
      <div className="mb-1.5 truncate text-center text-[11px] font-semibold text-slate-400">
        {label}
      </div>
      <div className="flex items-center justify-between gap-1">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="h-11 w-11 shrink-0 rounded-lg bg-court-700 font-display text-xl text-slate-200 active:scale-95"
          aria-label={`${label} minus one`}
        >
          -
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10)
            onChange(Number.isNaN(n) ? 0 : Math.max(0, Math.min(max, n)))
          }}
          className="w-full min-w-0 border-0 bg-transparent text-center font-display text-3xl tabnum text-slate-100 focus:ring-0"
        />
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-11 w-11 shrink-0 rounded-lg bg-lime font-display text-xl text-court-950 active:scale-95"
          aria-label={`${label} plus one`}
        >
          +
        </button>
      </div>
    </div>
  )
}

export const gameKey = (slot: GameSlot): string => slotId(slot.round, slot.court)
