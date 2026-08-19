import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Btn, Card, Field, PageShell, Stat } from '../ui'
import { useAuth } from '../auth/AuthProvider'
import {
  DEFAULT_CONFIG,
  createSession,
  rememberHostName,
  rememberHosted,
  recallHostName,
} from '../lib/db'
import { addMinutesToClock, humanMinutes, planSession, suggestRounds } from '../lib/plan'
import type { SessionConfig } from '../types'

/**
 * Session setup. The point of this screen is the live plan panel: change any
 * number and immediately see how many games each person gets and what time you
 * finish, before anyone has been invited.
 */
export default function NewSession() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [hostName, setHostName] = useState(() => recallHostName())
  const [cfg, setCfg] = useState<SessionConfig>(DEFAULT_CONFIG)
  const [expected, setExpected] = useState(16)
  const [startTime, setStartTime] = useState('20:00')
  const [bookingMinutes, setBookingMinutes] = useState(120)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof SessionConfig>(k: K, v: SessionConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }))

  // Leave a slice of the booking for arriving, warming up and briefing.
  const warmUp = 10
  const playMinutes = Math.max(0, bookingMinutes - warmUp)

  const plan = useMemo(
    () =>
      planSession({
        players: expected,
        courts: cfg.courts,
        rounds: cfg.rounds,
        gameMinutes: cfg.gameMinutes,
        changeoverMinutes: cfg.changeoverMinutes,
      }),
    [expected, cfg.courts, cfg.rounds, cfg.gameMinutes, cfg.changeoverMinutes],
  )

  const recommended = useMemo(
    () =>
      suggestRounds({
        players: expected,
        courts: cfg.courts,
        availableMinutes: playMinutes,
        gameMinutes: cfg.gameMinutes,
        changeoverMinutes: cfg.changeoverMinutes,
      }),
    [expected, cfg.courts, cfg.gameMinutes, cfg.changeoverMinutes, playMinutes],
  )

  const overruns = plan.totalMinutes > playMinutes

  async function create() {
    if (!user) {
      setError('Still signing in, try again in a second')
      return
    }
    setBusy(true)
    setError(null)
    try {
      rememberHostName(hostName)
      const code = await createSession(cfg, user.uid, hostName)
      rememberHosted(code)
      nav(`/s/${code}/host`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the session')
      setBusy(false)
    }
  }

  return (
    <PageShell>
      <div className="flex items-center gap-3 pt-4">
        <Link to="/" className="text-sm text-slate-400 hover:text-slate-200">
          Back
        </Link>
        <h1 className="font-display text-xl text-slate-50">Set up a session</h1>
      </div>

      <Card className="mt-4 space-y-4 p-4">
        <Field label="Session name">
          <input
            value={cfg.name}
            onChange={(e) => set('name', e.target.value)}
            className="w-full"
            placeholder="Friday Night Pickleball"
          />
        </Field>
        <Field label="Your name" hint="Shown to players so they know whose session this is">
          <input
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
            className="w-full"
            placeholder="Abbas"
          />
        </Field>
      </Card>

      <Card className="mt-4 space-y-4 p-4">
        <h2 className="font-display text-sm uppercase tracking-wider text-slate-400">The booking</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Courts booked">
            <input
              type="number"
              min={1}
              max={8}
              value={cfg.courts}
              onChange={(e) => set('courts', clamp(e.target.value, 1, 8))}
              className="w-full"
            />
          </Field>
          <Field label="Players expected">
            <input
              type="number"
              min={4}
              max={64}
              value={expected}
              onChange={(e) => setExpected(clamp(e.target.value, 4, 64))}
              className="w-full"
            />
          </Field>
          <Field label="Start time">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full"
            />
          </Field>
          <Field label="Booking length" hint="minutes">
            <input
              type="number"
              min={30}
              max={360}
              step={15}
              value={bookingMinutes}
              onChange={(e) => setBookingMinutes(clamp(e.target.value, 30, 360))}
              className="w-full"
            />
          </Field>
        </div>
      </Card>

      <Card className="mt-4 space-y-4 p-4">
        <h2 className="font-display text-sm uppercase tracking-wider text-slate-400">
          The game format
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minutes per game" hint="the horn is the real rule">
            <input
              type="number"
              min={4}
              max={30}
              value={cfg.gameMinutes}
              onChange={(e) => set('gameMinutes', clamp(e.target.value, 4, 30))}
              className="w-full"
            />
          </Field>
          <Field label="Point target" hint="rally scoring">
            <input
              type="number"
              min={5}
              max={31}
              value={cfg.pointTarget}
              onChange={(e) => set('pointTarget', clamp(e.target.value, 5, 31))}
              className="w-full"
            />
          </Field>
          <Field label="Rounds" hint={`${recommended} fits your booking evenly`}>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                max={40}
                value={cfg.rounds}
                onChange={(e) => set('rounds', clamp(e.target.value, 1, 40))}
                className="w-full"
              />
              {cfg.rounds !== recommended && (
                <Btn variant="ghost" size="sm" onClick={() => set('rounds', recommended)}>
                  Use {recommended}
                </Btn>
              )}
            </div>
          </Field>
          <Field label="Changeover" hint="minutes between rounds">
            <input
              type="number"
              min={0}
              max={10}
              value={cfg.changeoverMinutes}
              onChange={(e) => set('changeoverMinutes', clamp(e.target.value, 0, 10))}
              className="w-full"
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-court-700 bg-court-850/50 p-3">
          <input
            type="checkbox"
            checked={cfg.goldenPoint}
            onChange={(e) => set('goldenPoint', e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-lime"
          />
          <span className="text-sm">
            <span className="font-semibold text-slate-200">
              Play a golden point when the horn goes level
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Off by default: a draw is a perfectly good result, and it keeps both courts finishing
              together.
            </span>
          </span>
        </label>
      </Card>

      <Card className="mt-4 p-4" glow>
        <h2 className="font-display text-sm uppercase tracking-wider text-slate-400">
          What that gives you
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            value={
              plan.even
                ? plan.gamesPerPlayer.min
                : `${plan.gamesPerPlayer.min}-${plan.gamesPerPlayer.max}`
            }
            label="games each"
            tone="lime"
          />
          <Stat value={plan.totalGames} label="games total" />
          <Stat value={humanMinutes(plan.totalMinutes)} label="playing time" />
          <Stat
            value={addMinutesToClock(startTime, warmUp + plan.totalMinutes)}
            label="finish by"
            tone={overruns ? 'flame' : 'aqua'}
          />
        </div>

        <div className="mt-3 space-y-1.5 text-sm">
          <Line>
            {plan.playingPerRound} on court, {plan.restingPerRound} watching each round
          </Line>
          <Line>
            {plan.courtMinutesPerPlayer} minutes of actual play per person, across{' '}
            {plan.gamesPerPlayer.min} games
          </Line>
          {overruns && (
            <Line tone="flame">
              That runs {humanMinutes(plan.totalMinutes - playMinutes)} past your booking (allowing{' '}
              {warmUp} min to warm up). Drop to {recommended} rounds or shorten the games.
            </Line>
          )}
          {plan.warnings.map((w) => (
            <Line key={w} tone="gold">
              {w}
            </Line>
          ))}
        </div>
      </Card>

      {error && <p className="mt-3 text-sm text-flame">{error}</p>}

      <Btn size="lg" className="mt-4 w-full" onClick={() => void create()} disabled={busy}>
        {busy ? 'Creating...' : 'Create session and get the QR'}
      </Btn>
      <p className="mt-2 pb-10 text-center text-xs text-slate-500">
        You can change any of this before you start. The schedule is drawn when you press Start, from
        whoever you have approved by then.
      </p>
    </PageShell>
  )
}

function Line({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'flame' | 'gold' }) {
  const colour = { slate: 'text-slate-400', flame: 'text-flame', gold: 'text-gold' }[tone]
  return (
    <p className={`flex gap-2 ${colour}`}>
      <span aria-hidden>-</span>
      <span>{children}</span>
    </p>
  )
}

function clamp(raw: string, min: number, max: number): number {
  const n = parseInt(raw, 10)
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}
