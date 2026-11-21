export const PARCEL_STATUSES = [
  { value: 'no_action', label: 'دون إجراء', color: 'bg-slate-100 text-slate-700' },
  { value: 'waiting', label: 'في الانتظار', color: 'bg-orange-100 text-orange-800' },
  { value: 'delivered', label: 'تم التسليم', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'closed', label: 'مغلق', color: 'bg-amber-100 text-amber-800' },
  { value: 'no_answer', label: 'لا يرد', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'wrong_number', label: 'رقم خاطئ', color: 'bg-rose-100 text-rose-800' },
  { value: 'postponed', label: 'مؤجل للغد', color: 'bg-blue-100 text-blue-800' },
  { value: 'cancelled', label: 'ملغى', color: 'bg-red-100 text-red-800' },
] as const

export type ParcelStatus = (typeof PARCEL_STATUSES)[number]['value']

export const PARCEL_FIELDS = [
  'receiver',
  'phone',
  'phone2',
  'address',
  'municipality',
  'wilaya',
  'amount',
  'content',
  'sender',
  'senderPhone',
  'senderAddress',
  'status',
  'notes',
] as const

export type ParcelField = (typeof PARCEL_FIELDS)[number]

export interface FieldVersion {
  updatedAt: string
  deviceId: string
  operationId: string
}

export interface ParcelForm {
  tracking: string
  receiver: string
  phone: string
  phone2: string
  address: string
  municipality: string
  wilaya: string
  amount: string
  content: string
  sender: string
  senderPhone: string
  senderAddress: string
  status: ParcelStatus
  notes: string
}

export interface Parcel extends ParcelForm {
  id: string
  createdAt: string
  updatedAt: string
  updatedByDevice: string
  fieldVersions: Partial<Record<ParcelField, FieldVersion>>
  isArchived: boolean
  archivedAt: string | null
  archivedVersion: FieldVersion | null
  deletedAt: string | null
  deletionVersion: FieldVersion | null
}

export interface StatusHistoryEntry {
  id: string
  status: ParcelStatus
  createdAt: string
  deviceId: string
  operationId: string
}

export type ParcelPatch = Partial<Omit<ParcelForm, 'tracking'>>

export const EMPTY_PARCEL_FORM: ParcelForm = {
  tracking: '',
  receiver: '',
  phone: '',
  phone2: '',
  address: '',
  municipality: '',
  wilaya: '',
  amount: '',
  content: '',
  sender: '',
  senderPhone: '',
  senderAddress: '',
  status: 'no_action',
  notes: '',
}

const STATUS_VALUES = new Set<string>(PARCEL_STATUSES.map(({ value }) => value))

export function isParcelStatus(value: unknown): value is ParcelStatus {
  return typeof value === 'string' && STATUS_VALUES.has(value)
}

export function statusLabel(status: ParcelStatus): string {
  return PARCEL_STATUSES.find((item) => item.value === status)?.label ?? 'دون إجراء'
}

export function statusColor(status: ParcelStatus): string {
  return (
    PARCEL_STATUSES.find((item) => item.value === status)?.color ??
    'bg-slate-100 text-slate-700'
  )
}

export function normalizeTracking(value: string): string {
  return value.trim().toLocaleUpperCase('en')
}

export function parcelDocumentId(tracking: string): string {
  const normalized = normalizeTracking(tracking)
  if (!normalized) throw new Error('أدخل رقم التتبع.')
  if (normalized.length > 120) throw new Error('رقم التتبع طويل جدًا.')
  return encodeURIComponent(normalized)
}

export function validateParcelForm(input: ParcelForm): ParcelForm {
  const tracking = normalizeTracking(input.tracking)
  if (!tracking) throw new Error('رقم التتبع مطلوب.')
  if (tracking.length > 120) throw new Error('رقم التتبع يجب ألا يتجاوز 120 حرفًا.')
  if (!isParcelStatus(input.status)) throw new Error('حالة الطرد غير صالحة.')

  const form: ParcelForm = {
    tracking,
    receiver: input.receiver.trim(),
    phone: input.phone.trim(),
    phone2: input.phone2.trim(),
    address: input.address.trim(),
    municipality: input.municipality.trim(),
    wilaya: input.wilaya.trim(),
    amount: input.amount.trim(),
    content: input.content.trim(),
    sender: input.sender.trim(),
    senderPhone: input.senderPhone.trim(),
    senderAddress: input.senderAddress.trim(),
    status: input.status,
    notes: input.notes.trim(),
  }

  for (const [field, value] of Object.entries(form)) {
    if (typeof value !== 'string' || value.length > 2000) {
      throw new Error(`قيمة الحقل «${field}» طويلة جدًا أو غير صالحة.`)
    }
  }

  return form
}

export function validateParcelPatch(patch: ParcelPatch): ParcelPatch {
  const entries = Object.entries(patch)
  if (entries.length === 0) throw new Error('لا توجد تغييرات لحفظها.')

  const validated: ParcelPatch = {}
  for (const [field, value] of entries) {
    if (!(PARCEL_FIELDS as readonly string[]).includes(field)) {
      throw new Error(`الحقل «${field}» غير قابل للتعديل.`)
    }
    if (typeof value !== 'string' || value.length > 2000) {
      throw new Error(`قيمة الحقل «${field}» طويلة جدًا أو غير صالحة.`)
    }
    if (field === 'status') {
      if (!isParcelStatus(value)) throw new Error('حالة الطرد غير صالحة.')
      validated.status = value
    } else {
      validated[field as Exclude<ParcelField, 'status'>] = value
    }
  }
  return validated
}

export function compareFieldVersions(
  left: FieldVersion | null | undefined,
  right: FieldVersion | null | undefined,
): number {
  for (const version of [left, right]) {
    if (
      version &&
      (typeof version.updatedAt !== 'string' ||
        !Number.isFinite(Date.parse(version.updatedAt)) ||
        typeof version.deviceId !== 'string' ||
        typeof version.operationId !== 'string')
    ) {
      throw new Error('بيانات إصدار الحقل غير صالحة.')
    }
  }

  if (!left) return right ? -1 : 0
  if (!right) return 1

  const leftTime = Date.parse(left.updatedAt)
  const rightTime = Date.parse(right.updatedAt)
  if (leftTime !== rightTime) return leftTime > rightTime ? 1 : -1
  if (left.deviceId !== right.deviceId) {
    return left.deviceId > right.deviceId ? 1 : -1
  }
  if (left.operationId !== right.operationId) {
    return left.operationId > right.operationId ? 1 : -1
  }
  return 0
}

export function parseParcel(id: string, value: Record<string, unknown>): Parcel {
  if (
    typeof value.tracking !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    typeof value.updatedByDevice !== 'string' ||
    !isParcelStatus(value.status)
  ) {
    throw new Error(`بيانات الطرد «${id}» غير صالحة.`)
  }

  const textFields = PARCEL_FIELDS.filter(
    (field): field is Exclude<ParcelField, 'status'> => field !== 'status',
  )
  for (const field of textFields) {
    if (typeof value[field] !== 'string') {
      throw new Error(`حقل «${field}» في الطرد «${id}» غير صالح.`)
    }
  }

  const fieldVersions: Partial<Record<ParcelField, FieldVersion>> = {}
  if (value.fieldVersions && typeof value.fieldVersions === 'object') {
    for (const field of PARCEL_FIELDS) {
      const version = (value.fieldVersions as Record<string, unknown>)[field]
      if (!version || typeof version !== 'object') continue
      const candidate = version as Record<string, unknown>
      if (
        typeof candidate.updatedAt === 'string' &&
        typeof candidate.deviceId === 'string' &&
        typeof candidate.operationId === 'string'
      ) {
        fieldVersions[field] = {
          updatedAt: candidate.updatedAt,
          deviceId: candidate.deviceId,
          operationId: candidate.operationId,
        }
      }
    }
  }

  return {
    id,
    tracking: value.tracking,
    receiver: value.receiver as string,
    phone: value.phone as string,
    phone2: value.phone2 as string,
    address: value.address as string,
    municipality: value.municipality as string,
    wilaya: value.wilaya as string,
    amount: value.amount as string,
    content: value.content as string,
    sender: value.sender as string,
    senderPhone: value.senderPhone as string,
    senderAddress: value.senderAddress as string,
    status: value.status,
    notes: value.notes as string,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    updatedByDevice: value.updatedByDevice,
    fieldVersions,
    isArchived: value.isArchived === true,
    archivedAt: typeof value.archivedAt === 'string' ? value.archivedAt : null,
    archivedVersion:
      value.archivedVersion && typeof value.archivedVersion === 'object'
        ? (value.archivedVersion as FieldVersion)
        : null,
    deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : null,
    deletionVersion:
      value.deletionVersion && typeof value.deletionVersion === 'object'
        ? (value.deletionVersion as FieldVersion)
        : null,
  }
}
