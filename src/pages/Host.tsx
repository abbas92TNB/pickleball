import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSessionCtx } from '../App'
import { Btn, Card, Dot, Empty, Field, PageShell, Pill, SectionTitle, Stat } from '../ui'
import { QrPoster } from '../components/QrPoster'
import { GameCard } from '../components/GameCard'
import { RoundTimer, useRoundClock } from '../components/RoundTimer'
import {
  addPlayerAsHost,
  approveAll,
  clearAllScores,
  goToRound,
  pauseTimer,
  removePlayer,
  reopenSetup,
  replaceSchedule,
  resetTimer,
  setPlayerStatus,
  setStatus,
  startSession,
  startTimer,
  updateConfig,
} from '../lib/db'
import { generateSchedule, gamesInRound, slotId } from '../lib/schedule'
import { addMinutesToClock, humanMinutes, planSession } from '../lib/plan'
import type { GameSlot, Player, SessionConfig } from '../types'

export default function Host() {
  const ctx = useSessionCtx()
  const { code, session, players, approved, scores, isHost, me } = ctx
  const clock = useRoundClock(session)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isHost) {
    return (
      <PageShell>
        <Card className="mt-8 p-6 text-center">
          <h1 className="font-display text-lg text-slate-100">Host screen</h1>
          <p className="mt-2 text-sm text-slate-400">
            Only {session.hostName}, on the device that created this session, can run it.
          </p>
          <Link to={`/s/${code}`}>
            <Btn className="mt-4">Back to my games</Btn>
          </Link>
        </Card>
      </PageShell>
    )
  }

  const pending = players.filter((p) => p.status === 'pending')
  const declined = players.filter((p) => p.status === 'declined')
  const joinUrl = `${window.location.origin}/s/${code}/join`

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  return (
    <PageShell wide>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl text-slate-50">Host console</h1>
        <div className="flex items-center gap-2">
          <Pill tone={session.status === 'live' ? 'lime' : session.status === 'done' ? 'aqua' : 'gold'}>
            {session.status === 'live'
              ? 'Live'
              : session.status === 'done'
                ? 'Finished'
                : 'Registration open'}
          </Pill>
          <span className="font-mono text-sm text-slate-500">{code}</span>
        </div>
      </div>

      {error && (
        <Card className="mt-3 border-flame/40 p-3">
          <p className="text-sm text-flame">{error}</p>
        </Card>
      )}

      {session.status === 'live' && (
        <LiveControls
          onPrev={() => run('prev', () => goToRound(code, Math.max(0, session.currentRound - 1)))}
          onNext={() =>
            run('next', () =>
              goToRound(
                code,
                Math.min((session.schedule?.rounds ?? 1) - 1, session.currentRound + 1),
              ),
            )
          }
          onStart={() => run('start', () => startTimer(code))}
          onPause={() => run('pause', () => pauseTimer(code, clock.elapsedMs))}
          onReset={() => run('reset', () => resetTimer(code))}
          clock={clock}
          busy={busy}
        />
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          {session.status === 'live' && session.schedule && (
            <CurrentRound
              onEnd={() => run('end', () => setStatus(code, 'done'))}
              onReopen={() => run('reopen', () => reopenSetup(code))}
            />
          )}

          {session.status === 'done' && (
            <Card className="p-4">
              <h2 className="font-display text-base text-slate-100">Session finished</h2>
              <p className="mt-1.5 text-sm text-slate-400">
                Everyone can still see the table and stats. Reopen it if you want another round.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/s/${code}/standings`}>
                  <Btn>Final table</Btn>
                </Link>
                <Btn
                  variant="ghost"
                  onClick={() => run('live', () => setStatus(code, 'live'))}
                  disabled={busy !== null}
                >
                  Reopen as live
                </Btn>
              </div>
            </Card>
          )}

          <Approvals
            pending={pending}
            declined={declined}
            approved={approved}
            onApprove={(id) => run(`ap-${id}`, () => setPlayerStatus(code, id, 'approved'))}
            onDecline={(id) => run(`dc-${id}`, () => setPlayerStatus(code, id, 'declined'))}
            onApproveAll={() =>
              run('approveAll', () => approveAll(code, pending.map((p) => p.id)))
            }
            onRemove={(id) => run(`rm-${id}`, () => removePlayer(code, id))}
            busy={busy}
          />

          <AddByHand onAdd={(id, name) => run('add', async () => void (await addPlayerAsHost(code, id, name)))} busy={busy} />
        </div>

        <div className="min-w-0 space-y-4">
          <QrPoster url={joinUrl} code={code} title={session.name} />
          <ShareRow url={joinUrl} />
          <Draw
            onStart={(cfg) =>
              run('draw', async () => {
                await updateConfig(code, cfg)
                const schedule = generateSchedule({
                  playerIds: approved.map((p) => p.id),
                  courts: cfg.courts,
                  rounds: cfg.rounds,
                })
                await startSession(code, schedule)
              })
            }
            onRedraw={(cfg) =>
              run('redraw', async () => {
                await updateConfig(code, cfg)
                const schedule = generateSchedule({
                  playerIds: approved.map((p) => p.id),
                  courts: cfg.courts,
                  rounds: cfg.rounds,
                })
                await replaceSchedule(code, schedule)
              })
            }
            onClearScores={() => run('wipe', () => clearAllScores(code))}
            busy={busy}
            hasScores={scores.length > 0}
          />
        </div>
      </div>

      {/* Keeps the host's own player identity reachable when they also play. */}
      {!me && (
        <p className="mt-4 pb-10 text-center text-xs text-slate-500">
          Playing as well?{' '}
          <Link to={`/s/${code}/join`} className="font-semibold text-aqua">
            Register yourself
          </Link>{' '}
          so you appear in the draw.
        </p>
      )}
      <div className="h-10" />
    </PageShell>
  )
}

// ------------------------------ live controls -------------------------------

function LiveControls({
  onPrev,
  onNext,
  onStart,
  onPause,
  onReset,
  clock,
  busy,
}: {
  onPrev: () => void
  onNext: () => void
  onStart: () => void
  onPause: () => void
  onReset: () => void
  clock: ReturnType<typeof useRoundClock>
  busy: string | null
}) {
  const { session } = useSessionCtx()
  const last = (session.schedule?.rounds ?? 1) - 1

  return (
    <Card className="mt-3 p-3" glow>
      <div className="grid gap-3 sm:grid-cols-[240px_1fr]">
        <RoundTimer clock={clock} pointTarget={session.pointTarget} alert compact />
        <div className="flex flex-wrap items-center gap-2">
          {clock.running ? (
            <Btn variant="subtle" onClick={onPause} disabled={busy !== null}>
              Pause
            </Btn>
          ) : (
            <Btn onClick={onStart} disabled={busy !== null}>
              {clock.elapsedMs > 0 ? 'Resume' : 'Start round'}
            </Btn>
          )}
          <Btn variant="ghost" onClick={onReset} disabled={busy !== null}>
            Reset clock
          </Btn>
          <div className="mx-1 h-8 w-px bg-court-800" />
          <Btn
            variant="ghost"
            onClick={onPrev}
            disabled={busy !== null || session.currentRound === 0}
          >
            Previous
          </Btn>
          <Btn variant="subtle" onClick={onNext} disabled={busy !== null || session.currentRound >= last}>
            Next round
          </Btn>
        </div>
      </div>
    </Card>
  )
}

function CurrentRound({ onEnd, onReopen }: { onEnd: () => void; onReopen: () => void }) {
  const { code, session, scores, nameOf, me } = useSessionCtx()
  const schedule = session.schedule
  if (!schedule) return null

  const round = session.currentRound
  const games = gamesInRound(schedule, round)
  const resting = schedule.restsByRound[round] ?? []
  const scoreOf = (slot: GameSlot) => scores.find((s) => s.id === slotId(slot.round, slot.court))
  const missing = games.filter((g) => !scoreOf(g)).length
  const lastRound = round >= schedule.rounds - 1

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-base text-slate-100">
          Round {round + 1} of {schedule.rounds}
        </h2>
        <span className="text-xs text-slate-500">
          {missing === 0 ? 'All scores in' : `${missing} score${missing === 1 ? '' : 's'} missing`}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {games.map((g) => (
          <GameCard
            key={slotId(g.round, g.court)}
            code={code}
            slot={g}
            score={scoreOf(g)}
            nameOf={nameOf}
            meId={me?.id ?? null}
            meName={me?.name ?? null}
            isHost
            pointTarget={session.pointTarget}
            goldenPoint={session.goldenPoint}
          />
        ))}
      </div>

      {resting.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          <span className="font-bold uppercase tracking-wider">Resting:</span>{' '}
          {resting.map(nameOf).join(', ')}
        </p>
      )}

      {lastRound && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-court-800 pt-3">
          <Btn onClick={onEnd}>Finish the session</Btn>
          <Btn variant="ghost" onClick={onReopen}>
            Back to registration
          </Btn>
        </div>
      )}
    </Card>
  )
}

// -------------------------------- approvals --------------------------------

function Approvals({
  pending,
  declined,
  approved,
  onApprove,
  onDecline,
  onApproveAll,
  onRemove,
  busy,
}: {
  pending: Player[]
  declined: Player[]
  approved: Player[]
  onApprove: (id: string) => void
  onDecline: (id: string) => void
  onApproveAll: () => void
  onRemove: (id: string) => void
  busy: string | null
}) {
  const { session } = useSessionCtx()
  const inDraw = new Set(session.schedule?.playerIds ?? [])
  const lateJoiners = session.schedule
    ? approved.filter((p) => !inDraw.has(p.id))
    : []

  return (
    <>
      <SectionTitle
        right={
          pending.length > 0 ? (
            <Btn size="sm" onClick={onApproveAll} disabled={busy !== null}>
              Approve all {pending.length}
            </Btn>
          ) : undefined
        }
      >
        Waiting for approval ({pending.length})
      </SectionTitle>

      {pending.length === 0 ? (
        <Card className="p-4 text-center text-sm text-slate-500">
          Nobody waiting. Registrations appear here the moment someone scans the QR.
        </Card>
      ) : (
        <Card className="divide-y divide-court-800">
          {pending.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <Dot name={p.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-slate-100">{p.name}</div>
                <div className="font-mono text-[11px] text-slate-500">{p.playerId}</div>
              </div>
              <Btn size="sm" onClick={() => onApprove(p.id)} disabled={busy !== null}>
                Approve
              </Btn>
              <Btn
                size="sm"
                variant="ghost"
                onClick={() => onDecline(p.id)}
                disabled={busy !== null}
              >
                No
              </Btn>
            </div>
          ))}
        </Card>
      )}

      {lateJoiners.length > 0 && (
        <Card className="mt-3 border-gold/40 p-3">
          <Pill tone="gold">Approved after the draw</Pill>
          <p className="mt-2 text-sm text-slate-300">
            {lateJoiners.map((p) => p.name).join(', ')}{' '}
            {lateJoiners.length === 1 ? 'is' : 'are'} approved but not in the current schedule.
            Redraw to include {lateJoiners.length === 1 ? 'them' : 'them all'} - it only changes
            matchups, scores already entered stay put.
          </p>
        </Card>
      )}

      <SectionTitle>In the draw ({approved.length})</SectionTitle>
      {approved.length === 0 ? (
        <Empty title="No players approved yet" hint="Approve someone above, or add them by hand." />
      ) : (
        <Card className="p-3">
          <div className="flex flex-wrap gap-1.5">
            {approved.map((p) => (
              <span
                key={p.id}
                className="group flex items-center gap-1.5 rounded-lg bg-court-850 py-1 pl-1.5 pr-1 text-xs font-semibold text-slate-200"
              >
                <Dot name={p.name} size="sm" />
                {p.name}
                <button
                  onClick={() => onRemove(p.id)}
                  disabled={busy !== null}
                  title={`Remove ${p.name}`}
                  className="ml-0.5 rounded px-1 text-slate-600 hover:bg-flame/20 hover:text-flame"
                >
                  x
                </button>
              </span>
            ))}
          </div>
        </Card>
      )}

      {declined.length > 0 && (
        <p className="mt-2 text-xs text-slate-600">
          Not approved: {declined.map((p) => p.name).join(', ')}
        </p>
      )}
    </>
  )
}

function AddByHand({
  onAdd,
  busy,
}: {
  onAdd: (id: string, name: string) => void
  busy: string | null
}) {
  const [name, setName] = useState('')
  const [id, setId] = useState('')

  function submit() {
    if (!name.trim() || !id.trim()) return
    onAdd(id, name)
    setName('')
    setId('')
  }

  return (
    <Card className="p-3">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        Add someone yourself
      </h3>
      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="min-w-0 flex-1"
        />
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="ID"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="min-w-0 flex-1 font-mono"
        />
        <Btn onClick={submit} disabled={busy !== null || !name.trim() || !id.trim()}>
          Add
        </Btn>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        Added straight to the approved list. Give them the ID so they can sign in on their own phone.
      </p>
    </Card>
  )
}

function ShareRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked - the URL is printed under the QR anyway */
    }
  }
  return (
    <div className="flex gap-2">
      <Btn variant="subtle" className="flex-1" onClick={() => void copy()}>
        {copied ? 'Link copied' : 'Copy join link'}
      </Btn>
      <Btn variant="ghost" onClick={() => window.print()} title="Print the QR to stick on the wall">
        Print
      </Btn>
    </div>
  )
}

// ----------------------------------- draw -----------------------------------

function Draw({
  onStart,
  onRedraw,
  onClearScores,
  busy,
  hasScores,
}: {
  onStart: (cfg: SessionConfig) => void
  onRedraw: (cfg: SessionConfig) => void
  onClearScores: () => void
  busy: string | null
  hasScores: boolean
}) {
  const { session, approved } = useSessionCtx()
  const [cfg, setCfg] = useState<SessionConfig>(() => pickConfig(session))
  const [startTime, setStartTime] = useState('20:00')

  const set = <K extends keyof SessionConfig>(k: K, v: SessionConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }))

  const plan = useMemo(
    () =>
      planSession({
        players: approved.length,
        courts: cfg.courts,
        rounds: cfg.rounds,
        gameMinutes: cfg.gameMinutes,
        changeoverMinutes: cfg.changeoverMinutes,
      }),
    [approved.length, cfg.courts, cfg.rounds, cfg.gameMinutes, cfg.changeoverMinutes],
  )

  const enough = approved.length >= 4
  const q = session.schedule?.quality

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-display text-base text-slate-100">
        {session.schedule ? 'The draw' : 'Draw the schedule'}
      </h2>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Courts">
          <input
            type="number"
            min={1}
            max={8}
            value={cfg.courts}
            onChange={(e) => set('courts', num(e.target.value, 1, 8))}
            className="w-full"
          />
        </Field>
        <Field label="Rounds">
          <input
            type="number"
            min={1}
            max={40}
            value={cfg.rounds}
            onChange={(e) => set('rounds', num(e.target.value, 1, 40))}
            className="w-full"
          />
        </Field>
        <Field label="Minutes / game">
          <input
            type="number"
            min={4}
            max={30}
            value={cfg.gameMinutes}
            onChange={(e) => set('gameMinutes', num(e.target.value, 4, 30))}
            className="w-full"
          />
        </Field>
        <Field label="Point target">
          <input
            type="number"
            min={5}
            max={31}
            value={cfg.pointTarget}
            onChange={(e) => set('pointTarget', num(e.target.value, 5, 31))}
            className="w-full"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat
          value={
            plan.even
              ? plan.gamesPerPlayer.min
              : `${plan.gamesPerPlayer.min}-${plan.gamesPerPlayer.max}`
          }
          label="games each"
          tone="lime"
        />
        <Stat value={humanMinutes(plan.totalMinutes)} label="playing time" />
      </div>

      <Field label="If you start at" hint={`ends ${addMinutesToClock(startTime, plan.totalMinutes)}`}>
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="w-full"
        />
      </Field>

      {plan.warnings.map((w) => (
        <p key={w} className="text-xs text-gold">
          {w}
        </p>
      ))}

      {!enough && (
        <p className="text-xs text-flame">
          Need at least 4 approved players ({approved.length} so far).
        </p>
      )}

      {session.schedule ? (
        <>
          <Btn
            variant="subtle"
            className="w-full"
            onClick={() => onRedraw(cfg)}
            disabled={busy !== null || !enough}
          >
            {busy === 'redraw' ? 'Shuffling...' : 'Shuffle and redraw'}
          </Btn>
          <p className="text-xs text-slate-500">
            A redraw changes who plays with whom and resets to round 1. Scores already entered stay,
            so redraw before you get going rather than halfway through.
          </p>
          {hasScores && (
            <Btn
              variant="danger"
              size="sm"
              className="w-full"
              onClick={onClearScores}
              disabled={busy !== null}
            >
              {busy === 'wipe' ? 'Clearing...' : 'Clear every score'}
            </Btn>
          )}
        </>
      ) : (
        <Btn
          size="lg"
          className="w-full"
          onClick={() => onStart(cfg)}
          disabled={busy !== null || !enough}
        >
          {busy === 'draw' ? 'Drawing...' : 'Start session'}
        </Btn>
      )}

      {q && (
        <div className="space-y-1 border-t border-court-800 pt-3 text-xs">
          <QualityLine ok={q.repeatPartners === 0}>
            {q.repeatPartners === 0
              ? 'Nobody partners the same person twice'
              : `${q.repeatPartners} repeated partnerships`}
          </QualityLine>
          <QualityLine ok={q.gamesPerPlayer.min === q.gamesPerPlayer.max}>
            {q.gamesPerPlayer.min === q.gamesPerPlayer.max
              ? `Everyone plays ${q.gamesPerPlayer.min} games`
              : `Games range ${q.gamesPerPlayer.min}-${q.gamesPerPlayer.max}`}
          </QualityLine>
          <QualityLine ok={q.longestRest <= 2}>
            Longest bench run: {q.longestRest} round{q.longestRest === 1 ? '' : 's'}
          </QualityLine>
          <QualityLine ok={q.longestPlay <= 2}>
            Longest run on court: {q.longestPlay} round{q.longestPlay === 1 ? '' : 's'}
          </QualityLine>
          <QualityLine ok={q.backToBack.max - q.backToBack.min <= 1}>
            Back-to-back games per player: {q.backToBack.min} to {q.backToBack.max}
          </QualityLine>
          <p className="pt-1 text-slate-600">
            Drawn from seed {q.cost === 0 ? 'a perfect' : `#${session.schedule?.seed}`} across{' '}
            {q.attempts} attempts.
          </p>
        </div>
      )}
    </Card>
  )
}

function QualityLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className={`flex gap-2 ${ok ? 'text-slate-400' : 'text-gold'}`}>
      <span aria-hidden>{ok ? '✓' : '!'}</span>
      <span>{children}</span>
    </p>
  )
}

function pickConfig(s: SessionConfig): SessionConfig {
  return {
    name: s.name,
    courts: s.courts,
    rounds: s.rounds,
    gameMinutes: s.gameMinutes,
    changeoverMinutes: s.changeoverMinutes,
    pointTarget: s.pointTarget,
    goldenPoint: s.goldenPoint,
  }
}

function num(raw: string, min: number, max: number): number {
  const n = parseInt(raw, 10)
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}
