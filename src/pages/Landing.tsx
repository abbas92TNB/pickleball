import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Btn, Card, Field, PageShell } from '../ui'
import { recallHosted, sessionExists } from '../lib/db'

export default function Landing() {
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hosted = recallHosted()

  async function join() {
    const c = code.trim().toUpperCase()
    if (c.length < 4) {
      setError('Codes are five characters')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (await sessionExists(c)) nav(`/s/${c}/join`)
      else setError(`No session called ${c}`)
    } catch {
      setError('Could not reach the server')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell>
      <div className="pt-10 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-lime shadow-glow">
          <span className="text-3xl" aria-hidden>
            🏓
          </span>
        </div>
        <h1 className="font-display text-3xl leading-tight text-slate-50">
          Pickleball
          <br />
          <span className="text-lime">Fun Day</span>
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-slate-400">
          Random partners every round, everyone plays the same number of games, and you enter your
          own scores. No tournament, no seeding, no politics.
        </p>
      </div>

      <Card className="mt-8 p-5">
        <Field label="Got a session code?" hint="Ask the organiser, or scan their QR code">
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && void join()}
              placeholder="ABC12"
              autoCapitalize="characters"
              autoComplete="off"
              className="w-full text-center font-display text-2xl tracking-[0.3em]"
            />
            <Btn size="lg" onClick={() => void join()} disabled={busy}>
              {busy ? '...' : 'Join'}
            </Btn>
          </div>
        </Field>
        {error && <p className="mt-2 text-sm text-flame">{error}</p>}
      </Card>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-court-800" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">or</span>
        <div className="h-px flex-1 bg-court-800" />
      </div>

      <Card className="p-5">
        <h2 className="font-display text-base text-slate-100">Organising the session?</h2>
        <p className="mt-1.5 text-sm text-slate-400">
          Set your courts and time, add the names, and the app draws a balanced schedule.
        </p>
        <Link to="/new">
          <Btn size="lg" className="mt-4 w-full">
            Set up a session
          </Btn>
        </Link>
      </Card>

      {hosted.length > 0 && (
        <Card className="mt-4 p-4">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Sessions you host
          </h3>
          <div className="flex flex-wrap gap-2">
            {hosted.map((c) => (
              <Link key={c} to={`/s/${c}/host`}>
                <Btn variant="ghost" size="sm">
                  {c}
                </Btn>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <p className="py-8 text-center text-xs text-slate-600">
        Everyone plays. Nobody sits out twice in a row.
      </p>
    </PageShell>
  )
}
