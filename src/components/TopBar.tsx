import { Link, useLocation } from 'react-router-dom'
import { Dot } from '../ui'
import type { Player, Session } from '../types'

const tabs = [
  { to: '', label: 'My games' },
  { to: '/board', label: 'Board' },
  { to: '/standings', label: 'Table' },
  { to: '/stats', label: 'Stats' },
]

export function TopBar({
  session,
  me,
  isHost,
}: {
  session: Session
  me: Player | null
  isHost: boolean
}) {
  const { pathname } = useLocation()
  const base = `/s/${session.code}`

  return (
    <div className="sticky top-0 z-20 border-b border-court-800 bg-court-950/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <Link to={base} className="min-w-0 flex-1">
          <div className="truncate font-display text-sm text-slate-100">{session.name}</div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {session.status === 'live'
              ? `Round ${session.currentRound + 1} of ${session.schedule?.rounds ?? session.rounds}`
              : session.status === 'done'
                ? 'Session finished'
                : 'Registration open'}
            {' · '}
            {session.code}
          </div>
        </Link>

        {isHost && (
          <Link
            to={`${base}/host`}
            className="rounded-lg border border-aqua/40 bg-aqua/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-aqua"
          >
            Host
          </Link>
        )}
        <Link
          to={`${base}/join`}
          className="flex items-center gap-1.5"
          title={me ? `Signed in as ${me.name}` : 'Sign in'}
        >
          {me ? (
            <Dot name={me.name} size="sm" />
          ) : (
            <span className="rounded-lg border border-court-700 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Sign in
            </span>
          )}
        </Link>
      </div>

      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-1.5">
        {tabs.map((t) => {
          const to = `${base}${t.to}`
          const active = t.to === '' ? pathname === base || pathname === `${base}/` : pathname === to
          return (
            <Link
              key={t.label}
              to={to}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                active ? 'bg-lime text-court-950' : 'text-slate-400 hover:bg-court-850'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
