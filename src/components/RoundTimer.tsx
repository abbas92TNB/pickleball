import { useEffect, useRef, useState } from 'react'
import type { Session } from '../types'

// ---------------------------------------------------------------------------
// One shared clock. The session document holds the start timestamp, so every
// phone and the big screen count down to the same second without any of them
// being the source of truth.
// ---------------------------------------------------------------------------

export interface RoundClock {
  elapsedMs: number
  remainingMs: number
  /** past the cap - the horn has gone, leader wins */
  overtime: boolean
  running: boolean
  /** "07:14" or "-01:22" once past the cap */
  display: string
  /** 0..1 of the round consumed */
  progress: number
}

export function useRoundClock(session: Session | null): RoundClock {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!session?.timerRunning) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [session?.timerRunning])

  const capMs = (session?.gameMinutes ?? 0) * 60_000
  const base = session?.timerElapsedMs ?? 0
  const live = session?.timerRunning && session.timerStartedAt ? now - session.timerStartedAt : 0
  const elapsedMs = Math.max(0, base + live)
  const remainingMs = capMs - elapsedMs
  const overtime = remainingMs < 0

  return {
    elapsedMs,
    remainingMs,
    overtime,
    running: Boolean(session?.timerRunning),
    display: formatClock(remainingMs),
    progress: capMs > 0 ? Math.min(1, elapsedMs / capMs) : 0,
  }
}

export function formatClock(ms: number): string {
  const neg = ms < 0
  const total = Math.floor(Math.abs(ms) / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${neg ? '-' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Short rising chime + a buzz. Fires once when the round clock hits zero. */
function horn(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC()
    const now = ctx.currentTime
    for (const [i, freq] of [660, 880, 1320].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.3, now + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.34)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.18)
      osc.stop(now + i * 0.18 + 0.36)
    }
    setTimeout(() => void ctx.close(), 1400)
  } catch {
    /* audio blocked until the user interacts - the visual state still changes */
  }
  try {
    navigator.vibrate?.([220, 90, 220])
  } catch {
    /* not supported */
  }
}

/**
 * Big round clock. `alert` makes it sound the horn when the cap is reached -
 * only worth enabling on the screens someone is actually watching (the board
 * and the host console), not on every player phone at once.
 */
export function RoundTimer({
  clock,
  pointTarget,
  alert = false,
  compact = false,
}: {
  clock: RoundClock
  pointTarget: number
  alert?: boolean
  compact?: boolean
}) {
  const sounded = useRef(false)

  useEffect(() => {
    if (!alert) return
    if (clock.overtime && clock.running && !sounded.current) {
      sounded.current = true
      horn()
    }
    if (!clock.overtime) sounded.current = false
  }, [alert, clock.overtime, clock.running])

  const tone = clock.overtime
    ? 'text-flame'
    : clock.remainingMs < 60_000
      ? 'text-gold'
      : 'text-lime'

  const ring = clock.overtime
    ? 'border-flame/60 bg-flame/10'
    : clock.remainingMs < 60_000
      ? 'border-gold/50 bg-gold/5'
      : 'border-court-700 bg-court-850/60'

  return (
    <div
      className={`rounded-2xl border px-4 ${compact ? 'py-2.5' : 'py-4'} ${ring} ${
        clock.overtime && clock.running ? 'animate-pulseRing' : ''
      }`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className={`font-mono font-bold tabnum ${compact ? 'text-3xl' : 'text-5xl'} ${tone}`}>
            {clock.display}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {clock.overtime
              ? 'Horn gone - leader wins'
              : clock.running
                ? `Race to ${pointTarget}`
                : 'Paused'}
          </div>
        </div>
        {!compact && (
          <div className="text-right">
            <div className="font-display text-2xl text-slate-200">{pointTarget}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Target
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-court-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            clock.overtime ? 'bg-flame' : clock.remainingMs < 60_000 ? 'bg-gold' : 'bg-lime'
          }`}
          style={{ width: `${Math.round(clock.progress * 100)}%` }}
        />
      </div>
    </div>
  )
}
