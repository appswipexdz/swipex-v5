import { getAuth } from 'firebase/auth'
import { firebaseApp } from './firebaseApp'

export const auth = firebaseApp ? getAuth(firebaseApp) : null

export async function getDatabase() {
  if (!firebaseApp) {
    throw new Error('Firebase is not configured.')
  }

  const { getFirestore } = await import('firebase/firestore')
  return getFirestore(firebaseApp)
}
