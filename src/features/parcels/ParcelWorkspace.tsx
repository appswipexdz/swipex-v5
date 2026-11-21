import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import type { User } from 'firebase/auth'
import {
  createParcel,
  deleteParcel,
  setParcelArchived,
  subscribeToParcels,
  subscribeToStatusHistory,
  updateParcel,
  type SyncState,
} from './parcelService'
import {
  EMPTY_PARCEL_FORM,
  isParcelStatus,
  PARCEL_STATUSES,
  statusColor,
  statusLabel,
  type Parcel,
  type ParcelForm,
  type ParcelPatch,
  type StatusHistoryEntry,
} from './parcelModel'

interface ParcelWorkspaceProps {
  user: User
  busy: boolean
  signOutError: string
  onSignOut: () => void
}

type ViewMode = 'active' | 'archive'
type Confirmation = { parcel: Parcel; action: 'archive' | 'delete' | 'restore' }

const statusBorderColors: Record<Parcel['status'], string> = {
  no_action: '#d1d5db',
  waiting: '#fb923c',
  delivered: '#22c55e',
  closed: '#facc15',
  no_answer: '#facc15',
  wrong_number: '#facc15',
  postponed: '#60a5fa',
  cancelled: '#ef4444',
}

const syncLabels: Record<SyncState, string> = {
  connecting: 'جارٍ الاتصال',
  synced: 'متزامن',
  syncing: 'جارٍ الحفظ',
  offline: 'دون اتصال',
  error: 'خطأ في المزامنة',
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:ring-4 focus:ring-red-100 disabled:bg-slate-50'

const buttonClass =
  'rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60'

export function ParcelWorkspace({
  user,
  busy: authBusy,
  signOutError,
  onSignOut,
}: ParcelWorkspaceProps) {
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [syncState, setSyncState] = useState<SyncState>('connecting')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [municipalityFilter, setMunicipalityFilter] = useState('')
  const [view, setView] = useState<ViewMode>('active')
  const [editingParcel, setEditingParcel] = useState<Parcel | null>(null)
  const [form, setForm] = useState<ParcelForm>(EMPTY_PARCEL_FORM)
  const [showForm, setShowForm] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [pendingAction, setPendingAction] = useState('')
  const [historyParcel, setHistoryParcel] = useState<Parcel | null>(null)
  const [history, setHistory] = useState<StatusHistoryEntry[]>([])
  const [historyError, setHistoryError] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    setLoading(true)
    setLoadError('')

    void subscribeToParcels(
      user.uid,
      (snapshot) => {
        if (!active) return
        setParcels(snapshot.parcels)
        setSyncState(snapshot.syncState)
        setLoading(false)
        setLoadError('')
      },
      (error) => {
        console.error('Parcel listener failed:', error)
        if (!active) return
        setSyncState('error')
        setLoading(false)
        setLoadError(describeFirestoreError(error))
      },
    )
      .then((stop) => {
        if (active) unsubscribe = stop
        else stop()
      })
      .catch((error: unknown) => {
        console.error('Could not subscribe to parcels:', error)
        if (!active) return
        setSyncState('error')
        setLoading(false)
        setLoadError(describeFirestoreError(error))
      })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [user.uid])

  useEffect(() => {
    const handleOffline = () => setSyncState('offline')
    const handleOnline = () => setSyncState('connecting')
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  useEffect(() => {
    if (!historyParcel) return
    let active = true
    let unsubscribe: (() => void) | undefined
    setHistoryLoading(true)
    setHistoryError('')
    setHistory([])

    void subscribeToStatusHistory(
      user.uid,
      historyParcel.id,
      (snapshot) => {
        if (!active) return
        setHistory(snapshot.entries)
        setHistoryError(
          snapshot.error ? describeFirestoreError(snapshot.error) : '',
        )
        setHistoryLoading(false)
      },
    )
      .then((stop) => {
        if (active) unsubscribe = stop
        else stop()
      })
      .catch((error: unknown) => {
        console.error('Could not subscribe to parcel history:', error)
        if (!active) return
        setHistoryLoading(false)
        setHistoryError(describeFirestoreError(error))
      })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [historyParcel, user.uid])

  const activeParcels = useMemo(
    () => parcels.filter((parcel) => !parcel.isArchived),
    [parcels],
  )
  const archivedParcels = useMemo(
    () => parcels.filter((parcel) => parcel.isArchived),
    [parcels],
  )
  const visibleParcels = useMemo(() => {
    const source = view === 'active' ? activeParcels : archivedParcels
    const normalizedSearch = search.trim().toLocaleLowerCase()

    return source.filter((parcel) => {
      if (statusFilter && parcel.status !== statusFilter) return false
      if (municipalityFilter && parcel.municipality !== municipalityFilter) {
        return false
      }
      if (!normalizedSearch) return true
      return [
        parcel.tracking,
        parcel.receiver,
        parcel.phone,
        parcel.phone2,
        parcel.address,
        parcel.municipality,
        parcel.wilaya,
        parcel.sender,
        parcel.senderPhone,
        parcel.senderAddress,
        parcel.content,
        parcel.notes,
      ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch))
    })
  }, [
    activeParcels,
    archivedParcels,
    municipalityFilter,
    search,
    statusFilter,
    view,
  ])
  const municipalityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (view === 'active' ? activeParcels : archivedParcels)
            .map((parcel) => parcel.municipality)
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right, 'ar')),
    [activeParcels, archivedParcels, view],
  )

  const deliveredCount = activeParcels.filter(
    (parcel) => parcel.status === 'delivered',
  ).length
  const statusSummary = useMemo(
    () =>
      PARCEL_STATUSES.map((status) => ({
        ...status,
        count: activeParcels.filter((parcel) => parcel.status === status.value)
          .length,
      })),
    [activeParcels],
  )
  const deliveryPercent =
    activeParcels.length === 0
      ? 0
      : Math.round((deliveredCount / activeParcels.length) * 100)

  function openCreateForm() {
    setEditingParcel(null)
    setForm({ ...EMPTY_PARCEL_FORM })
    setActionError('')
    setShowForm(true)
  }

  function openEditForm(parcel: Parcel) {
    setEditingParcel(parcel)
    setForm({
      tracking: parcel.tracking,
      receiver: parcel.receiver,
      phone: parcel.phone,
      phone2: parcel.phone2,
      address: parcel.address,
      municipality: parcel.municipality,
      wilaya: parcel.wilaya,
      amount: parcel.amount,
      content: parcel.content,
      sender: parcel.sender,
      senderPhone: parcel.senderPhone,
      senderAddress: parcel.senderAddress,
      status: parcel.status,
      notes: parcel.notes,
    })
    setActionError('')
    setShowForm(true)
  }

  async function submitParcel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionError('')
    setPendingAction('form')

    try {
      if (editingParcel) {
        const patch: ParcelPatch = {
          receiver: form.receiver,
          phone: form.phone,
          phone2: form.phone2,
          address: form.address,
          municipality: form.municipality,
          wilaya: form.wilaya,
          amount: form.amount,
          content: form.content,
          sender: form.sender,
          senderPhone: form.senderPhone,
          senderAddress: form.senderAddress,
          status: form.status,
          notes: form.notes,
        }
        await updateParcel(user.uid, editingParcel.id, patch)
      } else {
        await createParcel(user.uid, form)
      }
      setShowForm(false)
      setEditingParcel(null)
    } catch (error) {
      console.error('Could not save parcel:', error)
      setActionError(describeFirestoreError(error))
    } finally {
      setPendingAction('')
    }
  }

  async function changeStatus(parcel: Parcel, status: Parcel['status']) {
    if (parcel.status === status) return
    setActionError('')
    setPendingAction(parcel.id)
    try {
      await updateParcel(user.uid, parcel.id, { status })
    } catch (error) {
      console.error('Could not update parcel status:', error)
      setActionError(describeFirestoreError(error))
    } finally {
      setPendingAction('')
    }
  }

  async function confirmParcelAction() {
    if (!confirmation) return
    const { parcel, action } = confirmation
    setActionError('')
    setPendingAction(parcel.id)

    try {
      if (action === 'delete') {
        await deleteParcel(user.uid, parcel.id)
      } else {
        await setParcelArchived(user.uid, parcel.id, action !== 'restore')
      }
      setConfirmation(null)
    } catch (error) {
      console.error(`Could not ${action} parcel:`, error)
      setActionError(describeFirestoreError(error))
    } finally {
      setPendingAction('')
    }
  }

  function setField<K extends keyof ParcelForm>(field: K, value: ParcelForm[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  return (
    <main className="app-shell-background min-h-screen pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <header className="header-wrapper sticky top-0 z-50">
        <div className="v4-header flex min-h-12 items-center justify-between gap-2 px-3 pb-1.5 pt-[max(6px,env(safe-area-inset-top))] sm:px-4">
          <div className="relative flex shrink-0 items-center gap-2">
            <button
              aria-expanded={headerMenuOpen}
              aria-label={headerMenuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
              className="v4-header-action"
              onClick={() => {
                setSearchOpen(false)
                setHeaderMenuOpen((open) => !open)
              }}
              type="button"
            >
              <NavIcon name="more" />
            </button>
            {headerMenuOpen && (
              <div
                className="v4-header-menu"
                role="group"
                aria-label="قائمة التطبيق"
              >
                <p className="truncate border-b border-slate-100 px-3 py-2 text-xs text-slate-500" dir="ltr">
                  {user.email ?? user.displayName ?? 'حسابي'}
                </p>
                <button
                  className="v4-header-menu-item"
                  onClick={() => {
                    setView('archive')
                    setHeaderMenuOpen(false)
                  }}
                  type="button"
                >
                  <NavIcon name="archive" />
                  <span>الأرشيف</span>
                </button>
                <button
                  className="v4-header-menu-item text-red-600"
                  disabled={authBusy}
                  onClick={() => {
                    setHeaderMenuOpen(false)
                    onSignOut()
                  }}
                  type="button"
                >
                  <NavIcon name="signOut" />
                  <span>{authBusy ? 'جارٍ الخروج…' : 'تسجيل الخروج'}</span>
                </button>
              </div>
            )}
            <button
              aria-expanded={searchOpen}
              aria-label={searchOpen ? 'إغلاق البحث' : 'فتح البحث'}
              className="v4-header-action"
              onClick={() => {
                setHeaderMenuOpen(false)
                setSearchOpen((open) => !open)
              }}
              type="button"
            >
              <NavIcon name={searchOpen ? 'close' : 'search'} />
            </button>
          </div>
          <a
            className="flex shrink-0 items-center justify-center"
            href="/"
            aria-label="SwiPex"
          >
            <img
              alt="SwiPex"
              className="h-8 w-auto rounded-lg"
              height="32"
              src="/icons/icon-192.png"
            />
          </a>
          <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
            <div
              className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-bold text-white sm:text-xs"
              role="status"
              aria-label={`حالة المزامنة: ${syncLabels[syncState]}، ${
                navigator.onLine ? 'متصل' : 'دون اتصال'
              }`}
            >
              <span
                className={`flex items-center gap-1 ${
                  syncState === 'synced'
                    ? 'text-green-200'
                    : syncState === 'error'
                      ? 'text-red-100'
                      : 'text-blue-100'
                }`}
              >
                <NavIcon
                  className={syncState === 'connecting' ? 'animate-spin' : ''}
                  name={syncState === 'synced' ? 'check' : 'sync'}
                />
                <span className="hidden sm:inline">{syncLabels[syncState]}</span>
              </span>
              <span aria-hidden="true" className="h-3 w-px bg-white/25" />
              <span
                className={`flex items-center gap-1 ${
                  navigator.onLine ? 'text-green-200' : 'text-gray-200'
                }`}
              >
                <NavIcon name={navigator.onLine ? 'wifi' : 'wifiOff'} />
                <span className="hidden sm:inline">
                  {navigator.onLine ? 'متصل' : 'دون اتصال'}
                </span>
              </span>
            </div>
            <button
              aria-label="الإشعارات، قريبًا"
              className="v4-header-action is-unavailable"
              disabled
              title="الإشعارات قريبًا"
              type="button"
            >
              <NavIcon name="bell" />
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="glass-panel mx-3 -mt-1 rounded-2xl p-3 shadow-xl sm:mx-5">
            <label className="relative block">
              <span className="sr-only">البحث في الطرود</span>
              <input
                autoFocus
                className={`${inputClass} !border-gray-200/70 !bg-gray-100/80 !py-3 !pr-10`}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث برقم التتبع أو الاسم أو الهاتف"
                type="search"
                value={search}
              />
              <span aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                ⌕
              </span>
            </label>
          </div>
        )}
      </header>

      <div className="mx-auto max-w-[90rem] px-2 py-3 sm:px-4 sm:py-4">
        {signOutError && <ErrorBanner message={signOutError} />}
        {actionError && <ErrorBanner message={actionError} />}

        {loadError ? (
          <section className="mt-8 rounded-2xl border border-red-200 bg-white p-6">
            <h1 className="font-extrabold text-red-800">
              تعذّر تحميل الطرود
            </h1>
            <p className="mt-2 text-sm leading-7 text-slate-600">{loadError}</p>
            <p className="mt-2 text-xs leading-6 text-slate-500">
              تحقق من نشر قواعد Firestore وأن المشروع النشط هو swipex-v5.
            </p>
          </section>
        ) : (
          <>
            <section className="glass-panel sticky top-14 z-30 -mx-2 rounded-2xl px-2 py-2 shadow-sm sm:-mx-4 sm:px-3">
              <div className="flex items-center gap-2">
                <div
                  aria-label="تصفية الطرود حسب الحالة"
                  className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1"
                  role="group"
                >
                  <FilterChip
                    active={!statusFilter}
                    count={view === 'active' ? activeParcels.length : archivedParcels.length}
                    label="الكل"
                    onClick={() => setStatusFilter('')}
                  />
                  {PARCEL_STATUSES.map((status) => {
                    const count = (view === 'active' ? activeParcels : archivedParcels)
                      .filter((parcel) => parcel.status === status.value).length
                    return (
                      <FilterChip
                        active={statusFilter === status.value}
                        count={count}
                        key={status.value}
                        label={status.label}
                        onClick={() =>
                          setStatusFilter((current) =>
                            current === status.value ? '' : status.value,
                          )
                        }
                      />
                    )
                  })}
                </div>
                <label className="shrink-0">
                  <span className="sr-only">تصفية حسب البلدية</span>
                  <select
                    aria-label="تصفية حسب البلدية"
                    className="max-w-28 rounded-xl border border-slate-200 bg-white/80 px-2 py-2 text-xs font-bold text-slate-700 outline-none focus:border-red-500 sm:max-w-40 sm:px-3 sm:text-sm"
                    onChange={(event) => setMunicipalityFilter(event.target.value)}
                    value={municipalityFilter}
                  >
                    <option value="">كل البلديات</option>
                    {municipalityOptions.map((municipality) => (
                      <option key={municipality} value={municipality}>
                        {municipality}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {(statusFilter || municipalityFilter || search) && (
                <button
                  className="mt-1 px-2 py-1 text-xs font-bold text-red-600"
                  onClick={() => {
                    setStatusFilter('')
                    setMunicipalityFilter('')
                    setSearch('')
                  }}
                  type="button"
                >
                  مسح الفلاتر
                </button>
              )}
            </section>

            <section className="glass-panel mt-3 rounded-2xl p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-slate-800">
                    ملخص الطرود النشطة
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    <span className="font-bold text-slate-700">
                      {deliveredCount}/{activeParcels.length}
                    </span>
                    <span className="mr-1">تم التسليم</span>
                    <span className="mr-2">
                      · متبقٍ {activeParcels.length - deliveredCount}
                    </span>
                  </p>
                </div>
                <span className="shrink-0 text-lg font-extrabold text-green-600">
                  {deliveryPercent}%
                </span>
              </div>
              <div
                aria-hidden="true"
                className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-gray-200/80"
              >
                {statusSummary.map(
                  (status) =>
                    status.count > 0 && (
                      <span
                        className="h-full transition-all duration-500"
                        key={status.value}
                        style={{
                          width: `${(status.count / activeParcels.length) * 100}%`,
                          backgroundColor: statusBorderColors[status.value],
                        }}
                      />
                    ),
                )}
              </div>
            </section>

            <section aria-live="polite" className="mt-4">
              {loading ? (
                <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">
                  جارٍ تحميل الطرود…
                </p>
              ) : visibleParcels.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
                  <p className="font-extrabold text-slate-800">
                    {view === 'archive'
                      ? 'الأرشيف فارغ'
                      : search || statusFilter || municipalityFilter
                        ? 'لا توجد نتائج مطابقة'
                        : 'لا توجد طرود بعد'}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    {view === 'active' &&
                    !search &&
                    !statusFilter &&
                    !municipalityFilter
                      ? 'أضف أول طرد للبدء.'
                      : 'جرّب تغيير البحث أو الفلتر.'}
                  </p>
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-3 pb-3 md:grid-cols-2 xl:grid-cols-4">
                  {visibleParcels.map((parcel) => (
                    <ParcelCard
                      key={parcel.id}
                      busy={pendingAction === parcel.id}
                      onAction={(action) => setConfirmation({ parcel, action })}
                      onEdit={() => openEditForm(parcel)}
                      onHistory={() => setHistoryParcel(parcel)}
                      onStatusChange={(status) => void changeStatus(parcel, status)}
                      parcel={parcel}
                      view={view}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      <nav
        aria-label="التنقل الرئيسي"
        className="v4-nav"
      >
        <div className="v4-nav-inner">
          <div className="v4-nav-slot">
            <MobileNavButton disabled icon="settings" label="الإعدادات" />
            <button
              aria-label="إضافة طرد"
              className="v4-nav-fab"
              onClick={openCreateForm}
              type="button"
            >
              <NavIcon name="add" />
            </button>
          </div>
          <MobileNavButton disabled icon="tasks" label="المهام" />
          <MobileNavButton
            active={view === 'active'}
            icon="home"
            label="الرئيسية"
            onClick={() => setView('active')}
            variant="home"
          />
          <MobileNavButton disabled icon="yalidine" label="ياليدين" />
          <MobileNavButton
            active={view === 'archive'}
            icon="archive"
            label="الأرشيف"
            onClick={() => setView('archive')}
          />
        </div>
      </nav>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pendingAction) {
              setShowForm(false)
            }
          }}
        >
          <section
            aria-labelledby="parcel-form-title"
            aria-modal="true"
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-7"
            role="dialog"
          >
            <div className="flex items-center justify-between gap-3">
              <h2
                className="text-xl font-extrabold text-slate-900"
                id="parcel-form-title"
              >
                {editingParcel ? 'تعديل بيانات الطرد' : 'إضافة طرد جديد'}
              </h2>
              <button
                aria-label="إغلاق"
                className={buttonClass}
                disabled={Boolean(pendingAction)}
                onClick={() => setShowForm(false)}
                type="button"
              >
                إغلاق
              </button>
            </div>

            {actionError && <ErrorBanner message={actionError} />}

            <form className="mt-5 space-y-4" onSubmit={submitParcel}>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  disabled={Boolean(editingParcel) || Boolean(pendingAction)}
                  label="رقم التتبع *"
                  onChange={(value) => setField('tracking', value)}
                  required
                  value={form.tracking}
                />
                <FormField
                  disabled={Boolean(pendingAction)}
                  label="اسم المستلم"
                  onChange={(value) => setField('receiver', value)}
                  value={form.receiver}
                />
                <FormField
                  disabled={Boolean(pendingAction)}
                  label="هاتف المستلم"
                  onChange={(value) => setField('phone', value)}
                  type="tel"
                  value={form.phone}
                />
                <FormField
                  disabled={Boolean(pendingAction)}
                  label="هاتف إضافي"
                  onChange={(value) => setField('phone2', value)}
                  type="tel"
                  value={form.phone2}
                />
                <FormField
                  disabled={Boolean(pendingAction)}
                  label="الولاية"
                  onChange={(value) => setField('wilaya', value)}
                  value={form.wilaya}
                />
                <FormField
                  disabled={Boolean(pendingAction)}
                  label="البلدية"
                  onChange={(value) => setField('municipality', value)}
                  value={form.municipality}
                />
                <FormField
                  disabled={Boolean(pendingAction)}
                  label="العنوان"
                  onChange={(value) => setField('address', value)}
                  value={form.address}
                />
                <FormField
                  disabled={Boolean(pendingAction)}
                  label="المبلغ"
                  onChange={(value) => setField('amount', value)}
                  value={form.amount}
                />
                <FormField
                  disabled={Boolean(pendingAction)}
                  label="المحتوى"
                  onChange={(value) => setField('content', value)}
                  value={form.content}
                />
                <FormField
                  disabled={Boolean(pendingAction)}
                  label="الحالة"
                  onChange={(value) => setField('status', value as ParcelForm['status'])}
                  select
                  value={form.status}
                />
                <FormField
                  disabled={Boolean(pendingAction)}
                  label="اسم المرسل"
                  onChange={(value) => setField('sender', value)}
                  value={form.sender}
                />
                <FormField
                  disabled={Boolean(pendingAction)}
                  label="هاتف المرسل"
                  onChange={(value) => setField('senderPhone', value)}
                  type="tel"
                  value={form.senderPhone}
                />
              </div>

              <FormField
                disabled={Boolean(pendingAction)}
                label="ملاحظات"
                onChange={(value) => setField('notes', value)}
                value={form.notes}
              />

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  className={buttonClass}
                  disabled={Boolean(pendingAction)}
                  onClick={() => setShowForm(false)}
                  type="button"
                >
                  إلغاء
                </button>
                <button
                  className="rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={Boolean(pendingAction)}
                  type="submit"
                >
                  {pendingAction === 'form'
                    ? 'جارٍ الحفظ…'
                    : editingParcel
                      ? 'حفظ التعديلات'
                      : 'إضافة الطرد'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {confirmation && (
        <ConfirmDialog
          busy={pendingAction === confirmation.parcel.id}
          confirmation={confirmation}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void confirmParcelAction()}
        />
      )}

      {historyParcel && (
        <HistoryDialog
          entries={history}
          error={historyError}
          loading={historyLoading}
          onClose={() => setHistoryParcel(null)}
          parcel={historyParcel}
        />
      )}
    </main>
  )
}

function ParcelCard({
  parcel,
  busy,
  view,
  onEdit,
  onHistory,
  onStatusChange,
  onAction,
}: {
  parcel: Parcel
  busy: boolean
  view: ViewMode
  onEdit: () => void
  onHistory: () => void
  onStatusChange: (status: Parcel['status']) => void
  onAction: (action: Confirmation['action']) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <li
      className="v4-parcel-card overflow-hidden"
      style={{ borderRightColor: statusBorderColors[parcel.status] }}
    >
      <article>
        <div className="p-3.5 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-xs font-bold text-white sm:text-sm"
                  dir="ltr"
                >
                  {parcel.tracking}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusColor(parcel.status)}`}
                >
                  {statusLabel(parcel.status)}
                </span>
                {parcel.municipality && (
                  <span className="max-w-32 truncate rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                    {parcel.municipality}
                  </span>
                )}
              </div>
              <h2 className="mt-2 truncate text-sm font-extrabold text-slate-900 sm:text-base">
                {parcel.receiver || 'مستلم غير محدد'}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 sm:text-sm">
                {parcel.phone ? (
                  <a
                    className="font-semibold text-red-600 hover:underline"
                    dir="ltr"
                    href={`tel:${encodeURIComponent(parcel.phone)}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {parcel.phone}
                  </a>
                ) : (
                  <span>لا يوجد هاتف</span>
                )}
                <span className="truncate">
                  {[parcel.municipality, parcel.wilaya].filter(Boolean).join('، ') ||
                    'لا يوجد عنوان مسجل'}
                </span>
              </div>
            </div>
            <div className="shrink-0 text-left">
              <p className="rounded-xl bg-emerald-50 px-2.5 py-1.5 text-xs font-extrabold text-emerald-800 sm:px-3 sm:text-sm">
                <bdi>{parcel.amount || '—'}</bdi>
                <span className="mr-1 text-[10px]">دج</span>
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
            {view === 'active' ? (
              <label className="min-w-0 flex-1">
                <span className="sr-only">تغيير حالة {parcel.tracking}</span>
                <select
                  className={`${inputClass} !w-full !rounded-xl !py-2 !text-xs`}
                  disabled={busy}
                  onChange={(event) => {
                    if (isParcelStatus(event.target.value)) {
                      onStatusChange(event.target.value)
                    }
                  }}
                  value={parcel.status}
                >
                  {PARCEL_STATUSES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="min-w-0 flex-1 text-xs font-semibold text-slate-500">
                {parcel.archivedAt
                  ? `أُرشف في ${new Intl.DateTimeFormat('ar-DZ', { dateStyle: 'medium' }).format(new Date(parcel.archivedAt))}`
                  : 'طرد مؤرشف'}
              </span>
            )}
            {parcel.phone && (
              <a
                aria-label={`اتصال بالمستلم ${parcel.receiver || parcel.tracking}`}
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-lg text-emerald-700 transition hover:bg-emerald-100"
                dir="ltr"
                href={`tel:${encodeURIComponent(parcel.phone)}`}
              >
                ☎
              </a>
            )}
            <button
              aria-expanded={expanded}
              aria-label={expanded ? 'طي تفاصيل الطرد' : 'عرض تفاصيل الطرد'}
              className={`grid size-10 shrink-0 place-items-center rounded-xl border text-lg transition ${
                expanded
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => setExpanded((open) => !open)}
              type="button"
            >
              <span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span>
            </button>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-slate-100 bg-slate-50/80 p-3.5 sm:p-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <ParcelInfo label="عنوان المستلم" value={parcel.address} />
              <ParcelInfo label="هاتف إضافي" value={parcel.phone2} dir="ltr" />
              <ParcelInfo label="المرسل" value={parcel.sender} />
              <ParcelInfo label="هاتف المرسل" value={parcel.senderPhone} dir="ltr" />
              <ParcelInfo label="عنوان المرسل" value={parcel.senderAddress} />
              <ParcelInfo label="محتوى الطرد" value={parcel.content} />
              <ParcelInfo label="الولاية" value={parcel.wilaya} />
              <ParcelInfo label="الملاحظات" value={parcel.notes} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={buttonClass}
                disabled={busy}
                onClick={onHistory}
                type="button"
              >
                سجل الحالة
              </button>
              <button
                className={buttonClass}
                disabled={busy}
                onClick={onEdit}
                type="button"
              >
                تعديل البيانات
              </button>
              <button
                className={buttonClass}
                disabled={busy}
                onClick={() => onAction(view === 'archive' ? 'restore' : 'archive')}
                type="button"
              >
                {view === 'archive' ? 'استعادة' : 'أرشفة'}
              </button>
              <button
                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy}
                onClick={() => onAction('delete')}
                type="button"
              >
                حذف
              </button>
            </div>
          </div>
        )}
      </article>
    </li>
  )
}

function ParcelInfo({
  label,
  value,
  dir,
}: {
  label: string
  value: string
  dir?: 'ltr'
}) {
  return (
    <div className="min-w-0 rounded-xl bg-white px-3 py-2.5">
      <p className="text-[11px] font-bold text-slate-400">{label}</p>
      <p className="mt-0.5 break-words text-sm font-semibold text-slate-700" dir={dir}>
        {value || '—'}
      </p>
    </div>
  )
}

function FormField({
  label,
  value,
  onChange,
  disabled,
  required = false,
  type = 'text',
  select = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  required?: boolean
  type?: string
  select?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-slate-700">
        {label}
      </span>
      {select ? (
        <select
          className={inputClass}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          {PARCEL_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={inputClass}
          disabled={disabled}
          maxLength={2000}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          type={type}
          value={value}
        />
      )}
    </label>
  )
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      aria-pressed={active}
      className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition sm:px-3.5 sm:text-sm ${
        active
          ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-500/20'
          : 'glass-panel text-slate-600 hover:border-red-300 hover:text-red-600'
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
      <span className="mr-1.5 opacity-70">{count}</span>
    </button>
  )
}

function MobileNavButton({
  active,
  icon,
  label,
  onClick,
  disabled = false,
  variant = 'default',
}: {
  active?: boolean
  icon: NavIconName
  label: string
  onClick?: () => void
  disabled?: boolean
  variant?: 'default' | 'home'
}) {
  const isActive = active ?? false

  return (
    <button
      aria-current={isActive ? 'page' : undefined}
      aria-label={disabled ? `${label}، قريبًا` : label}
      className={`v4-nav-item ${variant === 'home' ? 'v4-nav-home' : ''} ${
        isActive ? 'is-active' : ''
      } ${disabled ? 'is-disabled' : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={disabled ? `${label} قريبًا` : undefined}
      type="button"
    >
      <span aria-hidden="true" className="v4-nav-icon">
        <NavIcon name={icon} />
      </span>
      <span className="v4-nav-label">{label}</span>
    </button>
  )
}

type NavIconName =
  | 'settings'
  | 'tasks'
  | 'home'
  | 'yalidine'
  | 'archive'
  | 'add'
  | 'more'
  | 'search'
  | 'close'
  | 'signOut'
  | 'bell'
  | 'sync'
  | 'check'
  | 'wifi'
  | 'wifiOff'

function NavIcon({
  name,
  className,
}: {
  name: NavIconName
  className?: string
}) {
  const paths: Record<NavIconName, ReactNode> = {
    settings: (
      <>
        <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
        <path d="m19.4 15 .1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .8v.2a1.8 1.8 0 1 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.8l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.8-3h-.2a1.8 1.8 0 1 1 0-3.6h.2a1.8 1.8 0 0 0 .8-3l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.8v-.2a1.8 1.8 0 1 1 3.6 0v.2a1.8 1.8 0 0 0 3 .8l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .8 3h.2a1.8 1.8 0 1 1 0 3.6H20a1.8 1.8 0 0 0-.6 3Z" />
      </>
    ),
    tasks: (
      <>
        <path d="m4 7 1.5 1.5L8 6" />
        <path d="M11 7h9M4 13l1.5 1.5L8 12" />
        <path d="M11 13h9M4 19l1.5 1.5L8 18" />
        <path d="M11 19h9" />
      </>
    ),
    home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V10Z" />,
    yalidine: (
      <>
        <path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" />
        <circle cx="7.5" cy="19" r="2" />
        <circle cx="17.5" cy="19" r="2" />
      </>
    ),
    archive: (
      <>
        <path d="M4 4h16v5H4zM6 9v11h12V9M10 13h4" />
      </>
    ),
    add: <path d="M12 5v14M5 12h14" />,
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.3" />
        <path d="m16 16 4.2 4.2" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    signOut: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
      </>
    ),
    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    sync: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5.5 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.5-3" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16.5 9" />
      </>
    ),
    wifi: (
      <>
        <path d="M5 9a11 11 0 0 1 14 0M8 12a6.5 6.5 0 0 1 8 0M11 15a2 2 0 0 1 2 0M12 19h.01" />
      </>
    ),
    wifiOff: (
      <>
        <path d="M3 3l18 18M5 9a11 11 0 0 1 11-1M8 12a6.5 6.5 0 0 1 4-1M11 15a2 2 0 0 1 2 0M12 19h.01" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  )
}

function ConfirmDialog({
  confirmation,
  busy,
  onCancel,
  onConfirm,
}: {
  confirmation: Confirmation
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const actionLabels = {
    archive: {
      title: 'أرشفة الطرد؟',
      body: `سينتقل الطرد ${confirmation.parcel.tracking} إلى الأرشيف.`,
      confirm: 'أرشفة',
    },
    restore: {
      title: 'استعادة الطرد؟',
      body: `سيعود الطرد ${confirmation.parcel.tracking} إلى القائمة النشطة.`,
      confirm: 'استعادة',
    },
    delete: {
      title: 'حذف الطرد؟',
      body: `سيُخفى الطرد ${confirmation.parcel.tracking} من القوائم. لا يمكن استعادته حاليًا.`,
      confirm: 'حذف الطرد',
    },
  }[confirmation.action]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">
      <section
        aria-labelledby="confirm-title"
        aria-modal="true"
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
        role="dialog"
      >
        <h2 className="text-lg font-extrabold text-slate-900" id="confirm-title">
          {actionLabels.title}
        </h2>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          {actionLabels.body}
        </p>
        <div className="mt-6 flex gap-2">
          <button
            className={buttonClass}
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            إلغاء
          </button>
          <button
            className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? 'جارٍ التنفيذ…' : actionLabels.confirm}
          </button>
        </div>
      </section>
    </div>
  )
}

function HistoryDialog({
  parcel,
  entries,
  loading,
  error,
  onClose,
}: {
  parcel: Parcel
  entries: StatusHistoryEntry[]
  loading: boolean
  error: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
      <section
        aria-labelledby="history-title"
        aria-modal="true"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-slate-900" id="history-title">
              سجل تغيّر الحالة
            </h2>
            <p className="mt-1 font-mono text-xs text-slate-500" dir="ltr">
              {parcel.tracking}
            </p>
          </div>
          <button className={buttonClass} onClick={onClose} type="button">
            إغلاق
          </button>
        </div>

        {error ? (
          <ErrorBanner message={error} />
        ) : loading ? (
          <p className="py-8 text-center text-sm text-slate-500">
            جارٍ تحميل السجل…
          </p>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            لا يوجد سجل للحالة بعد.
          </p>
        ) : (
          <ol className="mt-5 space-y-3">
            {entries.map((entry) => (
              <li
                className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"
                key={entry.id}
              >
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusColor(entry.status)}`}
                >
                  {statusLabel(entry.status)}
                </span>
                <time
                  className="text-xs text-slate-500"
                  dateTime={entry.createdAt}
                  dir="ltr"
                >
                  {new Intl.DateTimeFormat('ar-DZ', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(entry.createdAt))}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm leading-6 text-red-800"
      role="alert"
    >
      {message}
    </p>
  )
}

function describeFirestoreError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : ''

  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return 'رفضت قواعد Firestore الوصول. تأكد من نشر القواعد إلى مشروع swipex-v5.'
  }
  if (
    code === 'unavailable' ||
    code === 'firestore/unavailable' ||
    !navigator.onLine
  ) {
    return 'تعذر الاتصال بـ Firestore. تحقق من الإنترنت ثم أعد المحاولة.'
  }
  if (message) return message
  return 'حدث خطأ غير متوقع أثناء مزامنة الطرود.'
}
