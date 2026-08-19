import { Link } from 'react-router-dom'
import { useSessionCtx } from '../App'
import { Btn, Card, Dot, Empty, PageShell, Pill, SectionTitle } from '../ui'
import { GameCard } from '../components/GameCard'
import { RoundTimer, useRoundClock } from '../components/RoundTimer'
import { gamesInRound, isInGame, opponentsOf, partnerOf, patternFor, slotId } from '../lib/schedule'
import type { GameSlot } from '../types'

/**
 * The player's own page - the screen someone actually stares at between games.
 * Answers three questions in order: am I on now, who with, and when am I next.
 */
export default function Me() {
  const ctx = useSessionCtx()
  const { code, session, me, scores, nameOf, isHost } = ctx
  const clock = useRoundClock(session)
  const schedule = session.schedule

  if (!me) {
    return (
      <PageShell>
        <Card className="mt-8 p-6 text-center">
          <h1 className="font-display text-lg text-slate-100">Who are you?</h1>
          <p className="mt-2 text-sm text-slate-400">
            Sign in with your ID so the app knows which games are yours.
          </p>
          <Link to={`/s/${code}/join`}>
            <Btn size="lg" className="mt-4 w-full">
              Sign in or register
            </Btn>
          </Link>
          {isHost && (
            <Link to={`/s/${code}/host`}>
              <Btn variant="ghost" className="mt-2 w-full">
                Go to the host screen
              </Btn>
            </Link>
          )}
        </Card>
      </PageShell>
    )
  }

  if (me.status !== 'approved') {
    return (
      <PageShell>
        <Card className="mt-8 p-6 text-center">
          <div className="mx-auto mb-3 w-fit">
            <Dot name={me.name} size="lg" />
          </div>
          <h1 className="font-display text-lg text-slate-100">{me.name}</h1>
          <div className="mt-3">
            {me.status === 'pending' ? (
              <Pill tone="gold">Waiting for {session.hostName} to approve you</Pill>
            ) : (
              <Pill tone="flame">Not approved</Pill>
            )}
          </div>
          <p className="mt-4 text-sm text-slate-400">
            This updates by itself the moment they tick you off.
          </p>
        </Card>
      </PageShell>
    )
  }

  if (!schedule || session.status === 'setup') {
    return (
      <PageShell>
        <Card className="mt-8 p-6 text-center" glow>
          <div className="mx-auto mb-3 w-fit">
            <Dot name={me.name} size="lg" />
          </div>
          <h1 className="font-display text-lg text-slate-100">You are on the list</h1>
          <p className="mt-2 text-sm text-slate-400">
            {ctx.approved.length} players approved so far. {session.hostName} draws the schedule when
            everyone has arrived - your games appear here automatically.
          </p>
          <p className="mt-4 text-xs text-slate-500">
            Format: {session.gameMinutes} minute games, race to {session.pointTarget}.
            {session.goldenPoint
              ? ' Level at the horn plays a golden point.'
              : ' Level at the horn is a draw.'}
          </p>
        </Card>
      </PageShell>
    )
  }

  const round = session.currentRound
  const thisRound = gamesInRound(schedule, round)
  const myGame = thisRound.find((g) => isInGame(g, me.id)) ?? null
  const nextRoundIdx = findNextRound(schedule.rounds, round, (r) =>
    gamesInRound(schedule, r).some((g) => isInGame(g, me.id)),
  )
  const nextGame =
    nextRoundIdx === null
      ? null
      : (gamesInRound(schedule, nextRoundIdx).find((g) => isInGame(g, me.id)) ?? null)

  const scoreOf = (slot: GameSlot) => scores.find((s) => s.id === slotId(slot.round, slot.court))
  const pattern = patternFor(schedule, me.id)
  const myGames = schedule.games.filter((g) => isInGame(g, me.id))
  const played = myGames.filter((g) => scoreOf(g)).length

  return (
    <PageShell>
      {session.status === 'done' ? (
        <Card className="mt-4 p-4 text-center">
          <Pill tone="aqua">Session finished</Pill>
          <p className="mt-2 text-sm text-slate-400">
            That is all {schedule.rounds} rounds. Go and look at the table.
          </p>
          <Link to={`/s/${code}/standings`}>
            <Btn className="mt-3 w-full">See the final table</Btn>
          </Link>
        </Card>
      ) : myGame ? (
        <div className="mt-4 animate-pop">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-display text-lg text-lime">You are on now</span>
            <Pill tone="lime">Court {myGame.court}</Pill>
          </div>
          <RoundTimer clock={clock} pointTarget={session.pointTarget} alert />
          <div className="mt-3">
            <PartnerLine slot={myGame} meId={me.id} nameOf={nameOf} />
          </div>
          <div className="mt-3">
            <GameCard
              code={code}
              slot={myGame}
              score={scoreOf(myGame)}
              nameOf={nameOf}
              meId={me.id}
              meName={me.name}
              isHost={isHost}
              pointTarget={session.pointTarget}
              goldenPoint={session.goldenPoint}
            />
          </div>
        </div>
      ) : (
        <Card className="mt-4 p-5 text-center">
          <Pill tone="grape">Resting this round</Pill>
          <p className="mt-3 font-display text-lg text-slate-200">
            {nextRoundIdx === null
              ? 'That is your last game done'
              : nextRoundIdx === round + 1
                ? 'You are on next round'
                : `You are back on in round ${nextRoundIdx + 1}`}
          </p>
          <div className="mt-3">
            <RoundTimer clock={clock} pointTarget={session.pointTarget} compact />
          </div>
        </Card>
      )}

      {nextGame && session.status === 'live' && (
        <>
          <SectionTitle>
            {nextRoundIdx === round + 1 ? 'Up next' : `Your next game - round ${(nextRoundIdx ?? 0) + 1}`}
          </SectionTitle>
          <Card className="p-3">
            <PartnerLine slot={nextGame} meId={me.id} nameOf={nameOf} />
            <p className="mt-2 text-center text-xs text-slate-500">Court {nextGame.court}</p>
          </Card>
        </>
      )}

      <SectionTitle right={<span className="text-xs text-slate-500">{played}/{myGames.length} played</span>}>
        Your afternoon
      </SectionTitle>
      <Card className="p-3">
        <div className="flex flex-wrap gap-1.5">
          {pattern.map((on, r) => (
            <div
              key={r}
              title={`Round ${r + 1}: ${on ? 'playing' : 'resting'}`}
              className={`flex h-9 flex-1 min-w-[34px] flex-col items-center justify-center rounded-lg border text-[10px] font-bold ${
                r === round
                  ? 'border-lime bg-lime/20 text-lime'
                  : on
                    ? 'border-court-600 bg-court-700/60 text-slate-300'
                    : 'border-court-800 bg-court-900 text-slate-600'
              }`}
            >
              <span>{r + 1}</span>
              <span className="text-[9px] font-semibold uppercase">{on ? 'play' : 'rest'}</span>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-center text-xs text-slate-500">
          {myGames.length} games, never the same partner twice
        </p>
      </Card>

      <SectionTitle>All your games</SectionTitle>
      {myGames.length === 0 ? (
        <Empty title="No games drawn for you" hint="Ask the host to redraw the schedule." />
      ) : (
        <div className="space-y-2 pb-10">
          {myGames.map((g) => (
            <div key={slotId(g.round, g.court)}>
              <div className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Round {g.round + 1}
              </div>
              <GameCard
                code={code}
                slot={g}
                score={scoreOf(g)}
                nameOf={nameOf}
                meId={me.id}
                meName={me.name}
                isHost={isHost}
                pointTarget={session.pointTarget}
                goldenPoint={session.goldenPoint}
                muted={g.round !== round}
              />
            </div>
          ))}
        </div>
      )}
    </PageShell>
  )
}

function PartnerLine({
  slot,
  meId,
  nameOf,
}: {
  slot: GameSlot
  meId: string
  nameOf: (id: string) => string
}) {
  const mate = partnerOf(slot, meId)
  const foes = opponentsOf(slot, meId)
  return (
    <div className="rounded-xl border border-court-700 bg-court-850/60 p-3 text-center">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Partner</p>
      <div className="mt-1 flex items-center justify-center gap-2">
        <Dot name={mate ? nameOf(mate) : '?'} size="sm" />
        <span className="font-display text-base text-lime">{mate ? nameOf(mate) : '-'}</span>
      </div>
      <p className="mt-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Against</p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {foes.map((f) => (
          <span key={f} className="flex items-center gap-1.5">
            <Dot name={nameOf(f)} size="sm" />
            <span className="text-sm font-semibold text-slate-300">{nameOf(f)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** First round at or after `from + 1` that satisfies `test`. */
function findNextRound(
  rounds: number,
  from: number,
  test: (round: number) => boolean,
): number | null {
  for (let r = from + 1; r < rounds; r++) if (test(r)) return r
  return null
}
