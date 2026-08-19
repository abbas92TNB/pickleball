import { useSessionCtx } from '../App'
import { Card, Dot, Empty, PageShell, Pill, SectionTitle } from '../ui'
import { RoundTimer, useRoundClock } from '../components/RoundTimer'
import { gamesInRound, slotId } from '../lib/schedule'
import type { GameSlot, ScoreDoc } from '../types'

/**
 * The big screen. Meant to be left open on a laptop by the net so nobody has to
 * ask "who am I with?" - large type, no interaction, sounds the horn.
 */
export default function Board() {
  const { session, scores, nameOf, approved } = useSessionCtx()
  const clock = useRoundClock(session)
  const schedule = session.schedule

  if (!schedule) {
    return (
      <PageShell wide>
        <div className="mt-6">
          <Empty
            title="No schedule drawn yet"
            hint={`${approved.length} players approved. The host draws the schedule when everyone has arrived.`}
          />
        </div>
      </PageShell>
    )
  }

  const round = session.currentRound
  const games = gamesInRound(schedule, round)
  const resting = schedule.restsByRound[round] ?? []
  const nextGames = round + 1 < schedule.rounds ? gamesInRound(schedule, round + 1) : []
  const scoreOf = (slot: GameSlot): ScoreDoc | undefined =>
    scores.find((s) => s.id === slotId(slot.round, slot.court))

  return (
    <PageShell wide>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h1 className="font-display text-2xl text-slate-50">
              Round {round + 1}
              <span className="text-slate-600"> / {schedule.rounds}</span>
            </h1>
            {session.status === 'done' && <Pill tone="aqua">Finished</Pill>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {games.map((g) => (
              <CourtPanel
                key={slotId(g.round, g.court)}
                slot={g}
                score={scoreOf(g)}
                nameOf={nameOf}
              />
            ))}
          </div>

          {nextGames.length > 0 && (
            <>
              <SectionTitle>Up next - round {round + 2}</SectionTitle>
              <div className="grid gap-2 sm:grid-cols-2">
                {nextGames.map((g) => (
                  <Card key={slotId(g.round, g.court)} className="p-3">
                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Court {g.court}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-semibold text-slate-300">
                        {g.teamA.map(nameOf).join(' + ')}
                      </span>
                      <span className="shrink-0 font-display text-[10px] text-slate-600">VS</span>
                      <span className="min-w-0 truncate text-right font-semibold text-slate-300">
                        {g.teamB.map(nameOf).join(' + ')}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="space-y-3">
          <RoundTimer clock={clock} pointTarget={session.pointTarget} alert />

          <Card className="p-3">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Resting this round ({resting.length})
            </h2>
            {resting.length === 0 ? (
              <p className="text-sm text-slate-500">Everyone is on court.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {resting.map((id) => (
                  <span
                    key={id}
                    className="flex items-center gap-1.5 rounded-lg bg-court-850 px-2 py-1 text-xs font-semibold text-slate-400"
                  >
                    <Dot name={nameOf(id)} size="sm" />
                    {nameOf(id)}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-3 text-xs text-slate-500">
            <p>
              <span className="font-bold text-slate-400">{session.gameMinutes} minute games</span>,
              race to {session.pointTarget}.
            </p>
            <p className="mt-1">
              {session.goldenPoint
                ? 'Level at the horn: play one golden point.'
                : 'Level at the horn: it stands as a draw.'}
            </p>
            <p className="mt-1">Leader at the horn takes it.</p>
          </Card>
        </div>
      </div>
      <div className="h-10" />
    </PageShell>
  )
}

function CourtPanel({
  slot,
  score,
  nameOf,
}: {
  slot: GameSlot
  score?: ScoreDoc
  nameOf: (id: string) => string
}) {
  const aWon = score ? score.a > score.b : false
  const bWon = score ? score.b > score.a : false
  const drawn = score ? score.a === score.b : false

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-court-700/60 bg-court-850/50 px-3 py-1.5">
        <span className="font-display text-sm text-slate-200">Court {slot.court}</span>
        {score ? (
          <Pill tone={drawn ? 'gold' : 'lime'}>{drawn ? 'Draw' : 'Done'}</Pill>
        ) : (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Playing
          </span>
        )}
      </div>
      <div className="p-3">
        <Side ids={slot.teamA} nameOf={nameOf} score={score?.a} won={aWon} />
        <div className="my-2 flex items-center gap-2">
          <div className="h-px flex-1 bg-court-800" />
          <span className="font-display text-[10px] text-slate-600">VS</span>
          <div className="h-px flex-1 bg-court-800" />
        </div>
        <Side ids={slot.teamB} nameOf={nameOf} score={score?.b} won={bWon} />
      </div>
    </Card>
  )
}

function Side({
  ids,
  nameOf,
  score,
  won,
}: {
  ids: [string, string]
  nameOf: (id: string) => string
  score?: number
  won: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        {ids.map((id) => (
          <div key={id} className="flex min-w-0 items-center gap-2">
            <Dot name={nameOf(id)} size="sm" />
            <span
              className={`truncate font-semibold ${won ? 'text-lime' : 'text-slate-200'}`}
            >
              {nameOf(id)}
            </span>
          </div>
        ))}
      </div>
      {score !== undefined && (
        <div
          className={`shrink-0 font-display text-4xl tabnum ${won ? 'text-lime' : 'text-slate-500'}`}
        >
          {score}
        </div>
      )}
    </div>
  )
}
