import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const projectId = 'demo-swipex-v5'
const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
let testEnvironment

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  })
})

after(async () => {
  await testEnvironment?.cleanup()
})

test('a user can read and write only inside their own account path', async () => {
  const alice = testEnvironment.authenticatedContext('alice').firestore()
  const ownParcel = doc(alice, 'users/alice/parcels/parcel-1')

  await assertSucceeds(setDoc(ownParcel, { tracking: 'yal-123456' }))
  await assertSucceeds(getDoc(ownParcel))
  await assertFails(getDoc(doc(alice, 'users/bob/parcels/parcel-1')))
  await assertFails(
    setDoc(doc(alice, 'users/bob/parcels/parcel-1'), {
      tracking: 'yal-654321',
    }),
  )
})

test('unauthenticated users cannot access account data', async () => {
  const unauthenticated = testEnvironment.unauthenticatedContext().firestore()
  const parcel = doc(unauthenticated, 'users/alice/parcels/parcel-1')

  await assertFails(getDoc(parcel))
  await assertFails(setDoc(parcel, { tracking: 'yal-123456' }))
})

test('paths outside the private user namespace are denied', async () => {
  const alice = testEnvironment.authenticatedContext('alice').firestore()
  const sharedData = doc(alice, 'public/announcements/latest')

  await assertFails(getDoc(sharedData))
  await assertFails(setDoc(sharedData, { message: 'not allowed' }))
})
