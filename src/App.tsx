import { useCallback, useMemo, useState } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useOutletContext, useParams } from 'react-router-dom'
import { TopBar } from './components/TopBar'
import { Btn, Card, PageShell, Spinner } from './ui'
import { useAuth } from './auth/AuthProvider'
import { firebaseReady } from './lib/firebase'
import { forgetMe, recallMe, rememberMe, usePlayers, useScores, useSession } from './lib/db'
import Landing from './pages/Landing'
import NewSession from './pages/NewSession'
import Join from './pages/Join'
import Me from './pages/Me'
import Board from './pages/Board'
import Standings from './pages/Standings'
import Stats from './pages/Stats'
import Host from './pages/Host'
import type { Player, ScoreDoc, Session } from './types'

export interface SessionCtx {
  code: string
  session: Session
  /** everyone who has registered, any status */
  players: Player[]
  /** the ones the host has approved - the only ones in the draw */
  approved: Player[]
  scores: ScoreDoc[]
  /** whoever is logged in on this device, or null */
  me: Player | null
  claim: (playerDocId: string) => void
  signOut: () => void
  isHost: boolean
  nameOf: (id: string) => string
}

export const useSessionCtx = (): SessionCtx => useOutletContext<SessionCtx>()

export default function App() {
  const { ready, error } = useAuth()

  if (!firebaseReady) return <SetupNeeded />
  if (!ready) return <Spinner label="Warming up..." />
  if (error) {
    return (
      <PageShell>
        <Card className="mt-10 p-6">
          <h1 className="font-display text-lg text-flame">Could not connect</h1>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <p className="mt-3 text-sm text-slate-500">
            Check that Anonymous sign-in is enabled in the Firebase console under Authentication,
            Sign-in method.
          </p>
        </Card>
      </PageShell>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/new" element={<NewSession />} />
      <Route path="/s/:code" element={<SessionLayout />}>
        <Route index element={<Me />} />
        <Route path="join" element={<Join />} />
        <Route path="board" element={<Board />} />
        <Route path="standings" element={<Standings />} />
        <Route path="stats" element={<Stats />} />
        <Route path="host" element={<Host />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function SessionLayout() {
  const { code = '' } = useParams()
  const upper = code.toUpperCase()
  const { user } = useAuth()
  const { session, loading, missing } = useSession(upper)
  const players = usePlayers(upper)
  const scores = useScores(upper)
  const [meId, setMeId] = useState<string | null>(() => recallMe(upper))

  const claim = useCallback(
    (playerDocId: string) => {
      setMeId(playerDocId)
      rememberMe(upper, playerDocId)
    },
    [upper],
  )

  const signOut = useCallback(() => {
    setMeId(null)
    forgetMe(upper)
  }, [upper])

  const nameOf = useCallback(
    (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown',
    [players],
  )

  const ctx = useMemo<SessionCtx | null>(() => {
    if (!session) return null
    return {
      code: upper,
      session,
      players,
      approved: players.filter((p) => p.status === 'approved'),
      scores,
      me: players.find((p) => p.id === meId) ?? null,
      claim,
      signOut,
      isHost: Boolean(user && session.hostUid === user.uid),
      nameOf,
    }
  }, [session, players, scores, meId, upper, user, claim, signOut, nameOf])

  if (loading) return <Spinner label={`Finding ${upper}...`} />

  if (missing || !ctx) {
    return (
      <PageShell>
        <Card className="mt-10 p-6 text-center">
          <h1 className="font-display text-lg text-slate-100">No session called {upper}</h1>
          <p className="mt-2 text-sm text-slate-400">
            Check the code with whoever organised it - codes are five characters.
          </p>
          <Link to="/">
            <Btn className="mt-4">Back to start</Btn>
          </Link>
        </Card>
      </PageShell>
    )
  }

  return (
    <>
      <TopBar session={ctx.session} me={ctx.me} isHost={ctx.isHost} />
      <Outlet context={ctx} />
    </>
  )
}

function SetupNeeded() {
  return (
    <PageShell>
      <Card className="mt-10 p-6">
        <h1 className="font-display text-xl text-lime">Almost there</h1>
        <p className="mt-3 text-sm text-slate-300">
          The app needs a Firebase project to sync scores between phones. Create one, then add the
          web config as environment variables.
        </p>
        <ol className="mt-4 space-y-2 text-sm text-slate-400">
          <li>
            1. In the Firebase console create a project, enable <b>Anonymous</b> sign-in, and create
            a <b>Firestore</b> database.
          </li>
          <li>
            2. Register a Web app and copy the <code className="text-aqua">firebaseConfig</code>{' '}
            values.
          </li>
          <li>
            3. Locally: copy <code className="text-aqua">.env.example</code> to{' '}
            <code className="text-aqua">.env.local</code> and paste them in.
          </li>
          <li>
            4. On Vercel: add the same <code className="text-aqua">VITE_FIREBASE_*</code> variables
            under Project Settings, Environment Variables, then redeploy.
          </li>
        </ol>
        <p className="mt-4 text-xs text-slate-500">
          The full walkthrough is in the README at the root of this project.
        </p>
      </Card>
    </PageShell>
  )
}
