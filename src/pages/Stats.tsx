import { useMemo, useState } from 'react'
import { useSessionCtx } from '../App'
import { Card, Dot, Empty, PageShell, Pill, SectionTitle, Stat } from '../ui'
import { computeStats, headToHead } from '../lib/stats'
import { patternFor } from '../lib/schedule'

/**
 * The full stats page - the bit people scroll through afterwards. Session
 * headlines first, then a per-player drill-down.
 */
export default function Stats() {
  const { session, players, scores, nameOf, me } = useSessionCtx()
  const approved = useMemo(() => players.filter((p) => p.status === 'approved'), [players])
  const stats = useMemo(
    () => computeStats(session.schedule, approved, scores),
    [session.schedule, approved, scores],
  )
  const [openId, setOpenId] = useState<string | null>(me?.id ?? null)

  if (stats.gamesScored === 0) {
    return (
      <PageShell>
        <div className="mt-6">
          <Empty title="No stats yet" hint="These fill in as scores are entered." />
        </div>
      </PageShell>
    )
  }

  const q = session.schedule?.quality
  const mostWins = [...stats.table].sort((a, b) => b.wins - a.wins)[0]
  const bestStreak = [...stats.table].sort((a, b) => b.longestWinStreak - a.longestWinStreak)[0]
  const biggestHit = [...stats.table].sort((a, b) => b.bestMargin - a.bestMargin)[0]
  const mostPoints = [...stats.table].sort((a, b) => b.pointsFor - a.pointsFor)[0]

  return (
    <PageShell>
      <h1 className="mt-4 font-display text-xl text-slate-50">Stats</h1>

      <SectionTitle>The session</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat value={stats.gamesScored} label="games scored" tone="lime" />
        <Stat value={stats.totalPoints} label="total points" tone="aqua" />
        <Stat
          value={(stats.totalPoints / Math.max(1, stats.gamesScored)).toFixed(1)}
          label="points per game"
        />
        <Stat value={approved.length} label="players" />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {stats.closest && (
          <Card className="p-3">
            <Pill tone="aqua">Closest game</Pill>
            <p className="mt-2 text-sm text-slate-300">
              {stats.closest.slot.teamA.map(nameOf).join(' + ')}{' '}
              <span className="font-display tabnum text-slate-100">
                {stats.closest.score.a}-{stats.closest.score.b}
              </span>{' '}
              {stats.closest.slot.teamB.map(nameOf).join(' + ')}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Round {stats.closest.slot.round + 1}, court {stats.closest.slot.court} ·{' '}
              {stats.closest.margin === 0 ? 'a draw' : `${stats.closest.margin} point margin`}
            </p>
          </Card>
        )}
        {stats.biggest && (
          <Card className="p-3">
            <Pill tone="flame">Biggest hiding</Pill>
            <p className="mt-2 text-sm text-slate-300">
              {stats.biggest.slot.teamA.map(nameOf).join(' + ')}{' '}
              <span className="font-display tabnum text-slate-100">
                {stats.biggest.score.a}-{stats.biggest.score.b}
              </span>{' '}
              {stats.biggest.slot.teamB.map(nameOf).join(' + ')}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Round {stats.biggest.slot.round + 1}, court {stats.biggest.slot.court} ·{' '}
              {stats.biggest.margin} point margin
            </p>
          </Card>
        )}
      </div>

      <SectionTitle>Honours</SectionTitle>
      <Card className="divide-y divide-court-800">
        <Honour label="Most wins" name={mostWins?.name} value={`${mostWins?.wins ?? 0} wins`} />
        <Honour
          label="Longest win streak"
          name={bestStreak?.name}
          value={`${bestStreak?.longestWinStreak ?? 0} in a row`}
        />
        <Honour
          label="Biggest single win"
          name={biggestHit?.name}
          value={`by ${biggestHit?.bestMargin ?? 0}`}
        />
        <Honour
          label="Most points scored"
          name={mostPoints?.name}
          value={`${mostPoints?.pointsFor ?? 0} pts`}
        />
      </Card>

      {q && (
        <>
          <SectionTitle>Was the draw fair?</SectionTitle>
          <Card className="p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                value={q.repeatPartners}
                label="repeat partners"
                tone={q.repeatPartners === 0 ? 'lime' : 'flame'}
              />
              <Stat
                value={
                  q.gamesPerPlayer.min === q.gamesPerPlayer.max
                    ? q.gamesPerPlayer.min
                    : `${q.gamesPerPlayer.min}-${q.gamesPerPlayer.max}`
                }
                label="games each"
                tone={q.gamesPerPlayer.min === q.gamesPerPlayer.max ? 'lime' : 'flame'}
              />
              <Stat value={q.longestRest} label="longest bench run" />
              <Stat value={q.longestPlay} label="longest run on court" />
            </div>
            <p className="mt-2.5 text-xs text-slate-500">
              Back-to-back games ranged {q.backToBack.min}-{q.backToBack.max} per player, double
              benchings {q.doubleRest.min}-{q.doubleRest.max}. Every player met{' '}
              {Math.round(q.coverage * 100)}% of the others at least once.
            </p>
          </Card>
        </>
      )}

      <SectionTitle>Player by player</SectionTitle>
      <div className="space-y-2 pb-10">
        {stats.table.map((row) => {
          const open = openId === row.id
          const h2h = open ? headToHead(session.schedule, row.id, scores) : null
          const pattern = open && session.schedule ? patternFor(session.schedule, row.id) : null
          return (
            <Card key={row.id} className="overflow-hidden">
              <button
                onClick={() => setOpenId(open ? null : row.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <Dot name={row.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-100">{row.name}</div>
                  <div className="text-[11px] tabnum text-slate-500">
                    {row.games} games · {row.wins}W {row.ties}D {row.losses}L ·{' '}
                    {Math.round(row.winPct * 100)}% won
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-600">{open ? 'Hide' : 'More'}</span>
              </button>

              {open && (
                <div className="animate-pop space-y-3 border-t border-court-800 p-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat value={row.funPoints} label="fun points" tone="lime" />
                    <Stat
                      value={`${row.diff > 0 ? '+' : ''}${row.diff}`}
                      label="point difference"
                      tone={row.diff >= 0 ? 'aqua' : 'flame'}
                    />
                    <Stat value={row.avgPointsFor.toFixed(1)} label="avg points scored" />
                    <Stat value={row.longestWinStreak} label="best streak" />
                  </div>

                  {row.bestPartner && (
                    <p className="text-sm text-slate-400">
                      Best with{' '}
                      <span className="font-semibold text-lime">{row.bestPartner.name}</span> -{' '}
                      {row.bestPartner.wins} of {row.bestPartner.games} won together.
                    </p>
                  )}

                  {pattern && (
                    <div>
                      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Play and bye pattern
                      </p>
                      <div className="flex gap-1">
                        {pattern.map((on, i) => (
                          <span
                            key={i}
                            title={`Round ${i + 1}: ${on ? 'played' : 'rested'}`}
                            className={`h-6 flex-1 rounded ${on ? 'bg-lime/70' : 'bg-court-700'}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {h2h && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Roster
                        title={`Partnered (${h2h.withCount.size})`}
                        entries={h2h.withCount}
                        nameOf={nameOf}
                      />
                      <Roster
                        title={`Faced (${h2h.againstCount.size})`}
                        entries={h2h.againstCount}
                        nameOf={nameOf}
                      />
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </PageShell>
  )
}

function Honour({
  label,
  name,
  value,
}: {
  label: string
  name?: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        {name && <Dot name={name} size="sm" />}
        <span className="truncate text-sm font-semibold text-slate-200">{name ?? '-'}</span>
        <span className="shrink-0 text-xs tabnum text-slate-500">{value}</span>
      </span>
    </div>
  )
}

function Roster({
  title,
  entries,
  nameOf,
}: {
  title: string
  entries: Map<string, number>
  nameOf: (id: string) => string
}) {
  const list = [...entries.entries()].sort((a, b) => b[1] - a[1] || nameOf(a[0]).localeCompare(nameOf(b[0])))
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
      {list.length === 0 ? (
        <p className="text-xs text-slate-600">Nobody yet</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {list.map(([id, n]) => (
            <span
              key={id}
              className="rounded-lg bg-court-850 px-2 py-1 text-xs font-medium text-slate-300"
            >
              {nameOf(id)}
              {n > 1 && <span className="ml-1 text-slate-500">x{n}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
