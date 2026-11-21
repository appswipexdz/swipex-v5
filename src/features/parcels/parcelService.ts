import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore'
import { auth, getDatabase } from '../../lib/firebase'
import {
  compareFieldVersions,
  EMPTY_PARCEL_FORM,
  isParcelStatus,
  PARCEL_FIELDS,
  parcelDocumentId,
  parseParcel,
  validateParcelForm,
  validateParcelPatch,
  type FieldVersion,
  type Parcel,
  type ParcelField,
  type ParcelForm,
  type ParcelPatch,
  type StatusHistoryEntry,
} from './parcelModel'

export type SyncState = 'connecting' | 'synced' | 'syncing' | 'offline' | 'error'

export interface ParcelSnapshot {
  parcels: Parcel[]
  syncState: SyncState
}

export interface StatusHistorySnapshot {
  entries: StatusHistoryEntry[]
  error?: Error
}

function assertCurrentUser(userId: string): void {
  if (!auth?.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('انتهت جلسة الدخول. سجّل الدخول مجددًا قبل تعديل البيانات.')
  }
}

function getDeviceId(): string {
  const storageKey = 'swipex-v5-device-id'
  const existing = window.localStorage.getItem(storageKey)
  if (existing) return existing

  const deviceId = window.crypto.randomUUID()
  window.localStorage.setItem(storageKey, deviceId)
  return deviceId
}

function createVersion(deviceId: string): FieldVersion {
  return {
    updatedAt: new Date().toISOString(),
    deviceId,
    operationId: window.crypto.randomUUID(),
  }
}

let firestorePromise: ReturnType<typeof getDatabase> | null = null
let firestoreInstance: Awaited<ReturnType<typeof getDatabase>> | null = null

function getDatabaseSync(): NonNullable<typeof firestoreInstance> {
  if (!firestoreInstance) {
    throw new Error('Firestore is not ready yet.')
  }
  return firestoreInstance
}

async function getParcelsCollection(userId: string) {
  assertCurrentUser(userId)
  firestorePromise ??= getDatabase()
  firestoreInstance = await firestorePromise
  assertCurrentUser(userId)
  return collection(firestoreInstance, 'users', userId, 'parcels')
}

function sortParcels(parcels: Parcel[]): Parcel[] {
  return parcels.sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  )
}

export async function subscribeToParcels(
  userId: string,
  onChange: (snapshot: ParcelSnapshot) => void,
  onError: (error: Error) => void,
): Promise<Unsubscribe> {
  const parcelCollection = await getParcelsCollection(userId)
  assertCurrentUser(userId)

  return onSnapshot(
    parcelCollection,
    { includeMetadataChanges: true },
    (snapshot) => {
      try {
        const parcels = snapshot.docs
          .map((parcelDocument) =>
            parseParcel(
              parcelDocument.id,
              parcelDocument.data() as Record<string, unknown>,
            ),
          )
          .filter((parcel) => parcel.deletedAt === null)

        const syncState: SyncState = !navigator.onLine
          ? 'offline'
          : snapshot.metadata.hasPendingWrites
            ? 'syncing'
            : 'synced'

        onChange({ parcels: sortParcels(parcels), syncState })
      } catch (error) {
        onError(
          error instanceof Error
            ? error
            : new Error('تعذر قراءة بيانات الطرود من Firestore.'),
        )
      }
    },
    onError,
  )
}

export async function subscribeToStatusHistory(
  userId: string,
  parcelId: string,
  onChange: (snapshot: StatusHistorySnapshot) => void,
): Promise<Unsubscribe> {
  const parcelCollection = await getParcelsCollection(userId)
  assertCurrentUser(userId)
  const historyCollection = collection(
    parcelCollection,
    parcelId,
    'statusEvents',
  )

  return onSnapshot(
    historyCollection,
    (snapshot) => {
      try {
        const entries = snapshot.docs
          .map((eventDocument) => {
            const value = eventDocument.data()
            if (
              !isParcelStatus(value.status) ||
              typeof value.createdAt !== 'string' ||
              !Number.isFinite(Date.parse(value.createdAt)) ||
              typeof value.deviceId !== 'string' ||
              typeof value.operationId !== 'string'
            ) {
              throw new Error('يوجد حدث حالة غير صالح في سجل الطرد.')
            }
            return {
              id: eventDocument.id,
              status: value.status,
              createdAt: value.createdAt,
              deviceId: value.deviceId,
              operationId: value.operationId,
            }
          })
          .sort(
            (left, right) =>
              Date.parse(right.createdAt) - Date.parse(left.createdAt),
          )

        onChange({ entries })
      } catch (error) {
        onChange({
          entries: [],
          error:
            error instanceof Error
              ? error
              : new Error('تعذر قراءة سجل حالات الطرد.'),
        })
      }
    },
    (error) => onChange({ entries: [], error }),
  )
}

export async function createParcel(
  userId: string,
  input: ParcelForm,
): Promise<void> {
  const form = validateParcelForm(input)
  const parcelCollection = await getParcelsCollection(userId)
  assertCurrentUser(userId)
  const id = parcelDocumentId(form.tracking)
  const parcelRef = doc(parcelCollection, id)
  const initialEventRef = doc(collection(parcelRef, 'statusEvents'))
  const deviceId = getDeviceId()
  const version = createVersion(deviceId)
  const fieldVersions = Object.fromEntries(
    PARCEL_FIELDS.map((field) => [field, version]),
  )

  await runTransaction(getDatabaseSync(), async (transaction) => {
    const existing = await transaction.get(parcelRef)
    if (existing.exists()) {
      const current = existing.data()
      if (current.deletedAt) {
        throw new Error(
          'هذا الرقم موجود ضمن السجلات المحذوفة. استعادة الطرود المحذوفة غير متاحة حاليًا.',
        )
      }
      throw new Error('يوجد طرد بهذا الرقم بالفعل.')
    }

    transaction.set(parcelRef, {
      ...EMPTY_PARCEL_FORM,
      ...form,
      createdAt: version.updatedAt,
      updatedAt: version.updatedAt,
      updatedByDevice: deviceId,
      fieldVersions,
      isArchived: false,
      archivedAt: null,
      archivedVersion: null,
      deletedAt: null,
      deletionVersion: null,
      schemaVersion: 1,
    })
    transaction.set(initialEventRef, {
      status: form.status,
      createdAt: version.updatedAt,
      deviceId,
      operationId: version.operationId,
    })
  })
}

export async function updateParcel(
  userId: string,
  parcelId: string,
  input: ParcelPatch,
): Promise<void> {
  const patch = validateParcelPatch(input)
  const parcelCollection = await getParcelsCollection(userId)
  assertCurrentUser(userId)
  const parcelRef = doc(parcelCollection, parcelId)
  const deviceId = getDeviceId()
  const versions = Object.fromEntries(
    Object.keys(patch).map((field) => [field, createVersion(deviceId)]),
  ) as Record<ParcelField, FieldVersion>

  await runTransaction(getDatabaseSync(), async (transaction) => {
    const snapshot = await transaction.get(parcelRef)
    if (!snapshot.exists()) throw new Error('لم يعد هذا الطرد موجودًا.')

    const current = snapshot.data()
    if (current.deletedAt) throw new Error('لا يمكن تعديل طرد محذوف.')

    const currentVersions =
      (current.fieldVersions as Partial<Record<ParcelField, FieldVersion>>) ?? {}
    const updates: Record<string, unknown> = {}

    for (const [field, value] of Object.entries(patch) as Array<
      [ParcelField, string]
    >) {
      if (compareFieldVersions(versions[field], currentVersions[field]) <= 0) {
        continue
      }
      updates[field] = value
      updates[`fieldVersions.${field}`] = versions[field]
    }

    if (Object.keys(updates).length === 0) return

    const newestVersion = Object.values(versions).reduce((latest, candidate) =>
      compareFieldVersions(candidate, latest) > 0 ? candidate : latest,
    )
    updates.updatedAt = newestVersion.updatedAt
    updates.updatedByDevice = deviceId
    transaction.update(parcelRef, updates)

    if (
      patch.status &&
      updates.status === patch.status &&
      patch.status !== current.status
    ) {
      const eventRef = doc(collection(parcelRef, 'statusEvents'))
      transaction.set(eventRef, {
        status: patch.status,
        createdAt: versions.status.updatedAt,
        deviceId,
        operationId: versions.status.operationId,
      })
    }
  })
}

export async function setParcelArchived(
  userId: string,
  parcelId: string,
  archived: boolean,
): Promise<void> {
  const parcelCollection = await getParcelsCollection(userId)
  assertCurrentUser(userId)
  const parcelRef = doc(parcelCollection, parcelId)
  const deviceId = getDeviceId()
  const version = createVersion(deviceId)

  await runTransaction(getDatabaseSync(), async (transaction) => {
    const snapshot = await transaction.get(parcelRef)
    if (!snapshot.exists()) throw new Error('لم يعد هذا الطرد موجودًا.')
    const current = snapshot.data()
    if (current.deletedAt) throw new Error('لا يمكن أرشفة طرد محذوف.')
    if (
      compareFieldVersions(
        version,
        current.archivedVersion as FieldVersion | undefined,
      ) <= 0
    ) {
      return
    }

    transaction.update(parcelRef, {
      isArchived: archived,
      archivedAt: archived ? version.updatedAt : null,
      archivedVersion: version,
      updatedAt: version.updatedAt,
      updatedByDevice: deviceId,
    })
  })
}

export async function deleteParcel(
  userId: string,
  parcelId: string,
): Promise<void> {
  const parcelCollection = await getParcelsCollection(userId)
  assertCurrentUser(userId)
  const parcelRef = doc(parcelCollection, parcelId)
  const deviceId = getDeviceId()
  const version = createVersion(deviceId)

  await runTransaction(getDatabaseSync(), async (transaction) => {
    const snapshot = await transaction.get(parcelRef)
    if (!snapshot.exists()) return

    const current = snapshot.data()
    if (
      compareFieldVersions(
        version,
        current.deletionVersion as FieldVersion | undefined,
      ) <= 0
    ) {
      return
    }

    transaction.update(parcelRef, {
      deletedAt: version.updatedAt,
      deletionVersion: version,
      updatedAt: version.updatedAt,
      updatedByDevice: deviceId,
    })
  })
}
