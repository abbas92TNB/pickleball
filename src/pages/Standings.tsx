import { useMemo } from 'react'
import { useSessionCtx } from '../App'
import { Card, Dot, Empty, PageShell, Pill, SectionTitle, Stat } from '../ui'
import { computeStats, placings } from '../lib/stats'

/**
 * The light leaderboard. Fun points = 2 a win, 1 a draw, 1 for playing at all,
 * so the table rewards turning up and never leaves anyone on zero.
 */
export default function Standings() {
  const { session, players, scores, me } = useSessionCtx()

  const stats = useMemo(
    () => computeStats(session.schedule, players.filter((p) => p.status === 'approved'), scores),
    [session.schedule, players, scores],
  )
  const places = useMemo(() => placings(stats.table), [stats.table])
  const finished = session.status === 'done'

  if (stats.gamesTotal === 0) {
    return (
      <PageShell>
        <div className="mt-6">
          <Empty
            title="Nothing to rank yet"
            hint="The table fills in as scores come in, from the very first game."
          />
        </div>
      </PageShell>
    )
  }

  const leader = stats.table[0]

  return (
    <PageShell>
      <div className="mt-4 flex items-baseline justify-between">
        <h1 className="font-display text-xl text-slate-50">
          {finished ? 'Final table' : 'How it stands'}
        </h1>
        <span className="text-xs text-slate-500">
          {stats.gamesScored} of {stats.gamesTotal} games in
        </span>
      </div>

      {finished && leader && leader.games > 0 && (
        <Card className="mt-3 p-4 text-center" glow>
          <Pill tone="gold">King of the day</Pill>
          <div className="mt-2 flex items-center justify-center gap-2">
            <Dot name={leader.name} size="lg" />
            <span className="font-display text-2xl text-slate-50">{leader.name}</span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {leader.funPoints} fun points · {leader.wins} wins · {leader.diff > 0 ? '+' : ''}
            {leader.diff} difference
          </p>
        </Card>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat value={stats.gamesScored} label="games played" tone="lime" />
        <Stat value={stats.totalPoints} label="points rallied" tone="aqua" />
        <Stat value={stats.table.filter((r) => r.games > 0).length} label="players in" />
      </div>

      <SectionTitle right={<span className="text-[11px] text-slate-500">W-D-L · diff</span>}>
        Table
      </SectionTitle>

      <Card className="divide-y divide-court-800 overflow-hidden">
        {stats.table.map((row) => {
          const place = places.get(row.id) ?? 0
          const isMe = me?.id === row.id
          return (
            <div
              key={row.id}
              className={`flex items-center gap-3 px-3 py-2.5 ${isMe ? 'bg-lime/[0.07]' : ''}`}
            >
              <span
                className={`w-6 shrink-0 text-center font-display text-sm tabnum ${
                  place === 1 ? 'text-gold' : place === 2 ? 'text-slate-300' : place === 3 ? 'text-flame' : 'text-slate-600'
                }`}
              >
                {row.games > 0 ? place : '-'}
              </span>
              <Dot name={row.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`truncate font-semibold ${isMe ? 'text-lime' : 'text-slate-100'}`}
                  >
                    {row.name}
                  </span>
                  {isMe && <span className="shrink-0 text-[10px] font-bold text-lime">YOU</span>}
                </div>
                <div className="text-[11px] tabnum text-slate-500">
                  {row.wins}-{row.ties}-{row.losses}
                  {' · '}
                  <span className={row.diff > 0 ? 'text-lime' : row.diff < 0 ? 'text-flame' : ''}>
                    {row.diff > 0 ? '+' : ''}
                    {row.diff}
                  </span>
                  {' · '}
                  {row.pointsFor} pts
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-display text-lg tabnum text-slate-100">{row.funPoints}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                  fun pts
                </div>
              </div>
            </div>
          )
        })}
      </Card>

      <p className="mt-3 pb-10 text-center text-xs text-slate-500">
        2 points a win, 1 a draw, 1 for playing. Ties broken by point difference.
      </p>
    </PageShell>
  )
}
