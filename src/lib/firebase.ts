import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth, type User } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** False until .env.local (or the Vercel env vars) are filled in. */
export const firebaseReady = Boolean(config.apiKey && config.projectId && config.appId)

let authInstance: Auth | null = null
let dbInstance: Firestore | null = null

if (firebaseReady) {
  const app: FirebaseApp = initializeApp(config)
  authInstance = getAuth(app)
  dbInstance = getFirestore(app)
}

export const auth = authInstance as Auth
export const db = dbInstance as Firestore

/** Everyone is anonymous. The host is simply whoever created the session. */
export function ensureSignedIn(): Promise<User | null> {
  if (!firebaseReady) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          stop()
          resolve(user)
          return
        }
        signInAnonymously(auth).catch(reject)
      },
      reject,
    )
  })
}
