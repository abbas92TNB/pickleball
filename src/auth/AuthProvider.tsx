import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { ensureSignedIn, firebaseReady } from '../lib/firebase'

interface AuthValue {
  user: User | null
  ready: boolean
  error: string | null
}

const Ctx = createContext<AuthValue>({ user: null, ready: false, error: null })

/**
 * Everyone signs in anonymously - there are no accounts and no passwords. The
 * host is simply whoever created the session; players are identified by the
 * name they claim on their own device.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(!firebaseReady)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseReady) return
    let alive = true
    ensureSignedIn()
      .then((u) => {
        if (!alive) return
        setUser(u)
        setReady(true)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Could not sign in')
        setReady(true)
      })
    return () => {
      alive = false
    }
  }, [])

  return <Ctx.Provider value={{ user, ready, error }}>{children}</Ctx.Provider>
}

export const useAuth = (): AuthValue => useContext(Ctx)
