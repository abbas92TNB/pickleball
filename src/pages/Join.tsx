import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionCtx } from '../App'
import { Btn, Card, Dot, Field, PageShell, Pill } from '../ui'
import { IdTakenError, findPlayer, registerPlayer } from '../lib/db'

type Mode = 'signin' | 'register'

/**
 * Registration and sign-in, both on one screen. Players reach this by scanning
 * the host's QR. Their ID is the key they come back with next time - it is a
 * lookup key, not a password (see the note at the bottom of the page).
 */
export default function Join() {
  const { code, session, me, claim, signOut } = useSessionCtx()
  const nav = useNavigate()
  const [mode, setMode] = useState<Mode>('register')
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The host approving you arrives as a live update, so this fires by itself.
  useEffect(() => {
    if (me?.status === 'approved') {
      const t = setTimeout(() => nav(`/s/${code}`), 900)
      return () => clearTimeout(t)
    }
  }, [me?.status, code, nav])

  if (me) return <Claimed onSwitch={signOut} />

  async function signIn() {
    setBusy(true)
    setError(null)
    try {
      const found = await findPlayer(code, id)
      if (!found) {
        setError('No one has registered with that ID yet. Register below instead.')
        setMode('register')
        return
      }
      claim(found.id)
    } catch {
      setError('Could not reach the server')
    } finally {
      setBusy(false)
    }
  }

  async function register() {
    setBusy(true)
    setError(null)
    try {
      const created = await registerPlayer(code, id, name)
      claim(created.id)
    } catch (e) {
      if (e instanceof IdTakenError) {
        setError(`${e.existingName} already registered with that ID. Sign in instead.`)
        setMode('signin')
      } else {
        setError(e instanceof Error ? e.message : 'Could not register')
      }
    } finally {
      setBusy(false)
    }
  }

  const canRegister = id.trim().length > 0 && name.trim().length > 0

  return (
    <PageShell>
      <div className="pt-6 text-center">
        <h1 className="font-display text-2xl text-slate-50">{session.name}</h1>
        <p className="mt-1 text-sm text-slate-400">
          Hosted by {session.hostName} · {session.code}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-court-700 bg-court-900 p-1">
        <TabBtn active={mode === 'register'} onClick={() => setMode('register')}>
          First time
        </TabBtn>
        <TabBtn active={mode === 'signin'} onClick={() => setMode('signin')}>
          I have an ID
        </TabBtn>
      </div>

      <Card className="mt-3 space-y-4 p-4">
        {mode === 'register' ? (
          <>
            <Field label="Your name" hint="How it shows on the board - first name is plenty">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full"
                placeholder="Abbas"
                autoComplete="name"
              />
            </Field>
            <Field label="Your ID" hint="Staff number, phone number, anything you will remember">
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="w-full font-mono"
                placeholder="10097452"
                autoComplete="off"
              />
            </Field>
            <Btn
              size="lg"
              className="w-full"
              onClick={() => void register()}
              disabled={busy || !canRegister}
            >
              {busy ? 'Sending...' : 'Register'}
            </Btn>
            <p className="text-center text-xs text-slate-500">
              {session.hostName} approves you, then your games appear.
            </p>
          </>
        ) : (
          <>
            <Field label="Your ID" hint="The one you registered with">
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void signIn()}
                className="w-full font-mono"
                placeholder="10097452"
                autoComplete="off"
              />
            </Field>
            <Btn
              size="lg"
              className="w-full"
              onClick={() => void signIn()}
              disabled={busy || !id.trim()}
            >
              {busy ? 'Looking...' : 'Sign in'}
            </Btn>
          </>
        )}
        {error && <p className="text-sm text-flame">{error}</p>}
      </Card>

      <p className="mt-6 pb-10 text-center text-xs text-slate-600">
        Your ID is a lookup key, not a password - anyone who knows it could sign in as you. Fine for a
        friendly game; do not put anything private in here.
      </p>
    </PageShell>
  )
}

function Claimed({ onSwitch }: { onSwitch: () => void }) {
  const { me, session, code, approved } = useSessionCtx()
  const nav = useNavigate()
  if (!me) return null

  const queue = approved.length

  return (
    <PageShell>
      <Card className="mt-8 p-6 text-center" glow={me.status === 'approved'}>
        <div className="mx-auto mb-3 w-fit">
          <Dot name={me.name} size="lg" />
        </div>
        <h1 className="font-display text-xl text-slate-50">{me.name}</h1>
        <p className="mt-1 font-mono text-sm text-slate-500">{me.playerId}</p>

        <div className="mt-4">
          {me.status === 'pending' && <Pill tone="gold">Waiting for approval</Pill>}
          {me.status === 'approved' && <Pill tone="lime">You are in</Pill>}
          {me.status === 'declined' && <Pill tone="flame">Not approved</Pill>}
        </div>

        {me.status === 'pending' && (
          <p className="mt-4 text-sm text-slate-400">
            {session.hostName} needs to tick you off the list. This page updates by itself - no need
            to refresh.
            {queue > 0 && (
              <span className="mt-1 block text-xs text-slate-500">
                {queue} player{queue === 1 ? '' : 's'} approved so far.
              </span>
            )}
          </p>
        )}

        {me.status === 'approved' && (
          <>
            <p className="mt-4 text-sm text-slate-400">
              {session.status === 'live'
                ? 'The session is running - here are your games.'
                : 'You are on the list. Your games appear once the host starts.'}
            </p>
            <Btn size="lg" className="mt-4 w-full" onClick={() => nav(`/s/${code}`)}>
              See my games
            </Btn>
          </>
        )}

        {me.status === 'declined' && (
          <p className="mt-4 text-sm text-slate-400">
            Have a word with {session.hostName} - they can add you back from the host screen.
          </p>
        )}

        <button
          onClick={onSwitch}
          className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
        >
          Not you? Sign out
        </button>
      </Card>
    </PageShell>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition ${
        active ? 'bg-lime text-court-950' : 'text-slate-400 hover:bg-court-850'
      }`}
    >
      {children}
    </button>
  )
}
