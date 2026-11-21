import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { getAuthErrorMessage } from './lib/authError'
import { auth, getDatabase } from './lib/firebase'
import { missingFirebaseConfig } from './lib/firebaseApp'

const ParcelWorkspace = lazy(() =>
  import('./features/parcels/ParcelWorkspace').then(({ ParcelWorkspace }) => ({
    default: ParcelWorkspace,
  })),
)

type AuthMode = 'sign-in' | 'sign-up'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(auth !== null)
  const [firestoreReady, setFirestoreReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const firebaseAuth = auth
    if (!firebaseAuth) return

    let active = true
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (nextUser) => {
        if (!active) return

        setUser(nextUser)
        setFirestoreReady(false)

        if (!nextUser) {
          setAuthLoading(false)
          return
        }

        try {
          await getDatabase()
          if (active && firebaseAuth.currentUser?.uid === nextUser.uid) {
            setFirestoreReady(true)
          }
        } catch (databaseError) {
          console.error('Firestore initialization failed:', databaseError)
          if (active && firebaseAuth.currentUser?.uid === nextUser.uid) {
            setError('تم تسجيل الدخول، لكن تعذّر تهيئة قاعدة البيانات.')
          }
        } finally {
          if (active) setAuthLoading(false)
        }
      },
      (authStateError) => {
        console.error('Firebase auth state listener failed:', authStateError)
        if (active) {
          setError('تعذر التحقق من جلسة الدخول. أعد تحميل الصفحة أو سجّل الدخول مجددًا.')
          setAuthLoading(false)
        }
      },
    )

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  async function submitEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!auth) return

    setBusy(true)
    setError('')
    try {
      if (mode === 'sign-up') {
        await createUserWithEmailAndPassword(auth, email.trim(), password)
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
    } catch (authError) {
      setError(getAuthErrorMessage(authError))
    } finally {
      setBusy(false)
    }
  }

  async function signInWithGoogle() {
    if (!auth) return

    setBusy(true)
    setError('')
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (authError) {
      setError(getAuthErrorMessage(authError))
    } finally {
      setBusy(false)
    }
  }

  async function signOutUser() {
    if (!auth) return

    setBusy(true)
    setError('')
    try {
      await signOut(auth)
    } catch (authError) {
      setError(getAuthErrorMessage(authError))
    } finally {
      setBusy(false)
    }
  }

  const isConfigured = missingFirebaseConfig.length === 0

  if (isConfigured && user && firestoreReady) {
    return (
      <Suspense
        fallback={
          <main className="min-h-screen px-4 py-10" role="status">
            <p className="mx-auto max-w-5xl text-sm font-semibold text-slate-600">
              جارٍ تحميل مساحة الطرود…
            </p>
          </main>
        }
      >
        <ParcelWorkspace
          busy={busy}
          onSignOut={() => void signOutUser()}
          signOutError={error}
          user={user}
        />
      </Suspense>
    )
  }

  return (
    <main className="app-shell-background flex min-h-screen items-center px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <section
          aria-labelledby="auth-title"
          className="glass-panel rounded-3xl p-6 shadow-2xl sm:p-8"
        >
          <div className="mb-7 text-center">
            <img
              alt="SwiPex"
              className="mx-auto mb-3 size-24 rounded-2xl shadow-lg"
              height="96"
              src="/icons/icon-192.png"
              width="96"
            />
            <h1 className="text-3xl font-extrabold text-slate-900">SwiPex</h1>
            <p className="mt-1 text-sm text-slate-500">
              نظام إدارة توصيل الطرود
            </p>
          </div>

          <div className="mb-7 text-center">
            <h2 className="text-xl font-extrabold text-slate-800" id="auth-title">
              {mode === 'sign-in' ? 'مرحبًا بك!' : 'إنشاء حساب جديد'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {mode === 'sign-in'
                ? 'قم بتسجيل الدخول للمتابعة'
                : 'أنشئ حسابك لمزامنة طرودك بأمان'}
            </p>
          </div>

          {isConfigured && user && !firestoreReady && (
            <div className="mb-5">
              <p className="break-all text-center text-sm text-slate-600" dir="ltr">
                {user.email}
              </p>
            </div>
          )}

          {!isConfigured ? (
            <div role="alert" className="text-sm leading-7 text-amber-900">
              <h2 className="font-extrabold">إعداد Firebase غير مكتمل</h2>
              <p className="mt-2">
                أضف متغيرات Firebase الناقصة إلى ملف <code>.env.local</code>،
                ثم أعد تشغيل خادم التطوير.
              </p>
              <p className="mt-2 text-xs" dir="ltr">
                {missingFirebaseConfig.join(', ')}
              </p>
            </div>
          ) : authLoading ? (
            <div
              className="py-8 text-center text-sm font-semibold text-slate-600"
              role="status"
            >
              جارٍ التحقق من جلسة الدخول…
            </div>
          ) : user ? (
            <div>
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm leading-6 text-red-800">
                تم تسجيل الدخول، لكن خدمة قاعدة البيانات لم تتهيأ بعد.
              </p>
              {error && <ErrorMessage message={error} />}
              <button
                className="mt-5 w-full rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy}
                onClick={signOutUser}
                type="button"
              >
                {busy ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
              </button>
            </div>
          ) : (
            <>
                {error && <ErrorMessage message={error} />}

                <form className="space-y-3" onSubmit={submitEmailAuth}>
                  <label className="block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">
                      البريد الإلكتروني
                    </span>
                    <input
                      autoComplete="email"
                      className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-left text-sm text-slate-800 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-400/40"
                      dir="ltr"
                      disabled={busy}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@example.com"
                      required
                      type="email"
                      value={email}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">
                      كلمة المرور
                    </span>
                    <input
                      autoComplete={
                        mode === 'sign-in' ? 'current-password' : 'new-password'
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-left text-sm text-slate-800 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-400/40"
                      dir="ltr"
                      disabled={busy}
                      minLength={6}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      type="password"
                      value={password}
                    />
                  </label>

                  <button
                    className="w-full rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={busy}
                    type="submit"
                  >
                    {busy
                      ? 'جارٍ المعالجة…'
                      : mode === 'sign-in'
                        ? 'الدخول بالبريد الإلكتروني'
                        : 'إنشاء الحساب'}
                  </button>
                </form>

                <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  أو
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                <button
                  className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-4 text-sm font-bold text-slate-700 shadow-lg transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busy}
                  onClick={signInWithGoogle}
                  type="button"
                >
                  <GoogleMark />
                  المتابعة باستخدام Google
                </button>

                <div className="mt-7 border-t border-slate-200 pt-5">
                  <p className="mb-4 text-center text-xs text-slate-400">
                    مزايا حسابك
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <AuthFeature color="blue" label="حساب خاص" symbol="◉" />
                    <AuthFeature color="green" label="مزامنة حية" symbol="↻" />
                    <AuthFeature color="purple" label="أجهزتك" symbol="▣" />
                  </div>
                </div>

                <p className="mt-5 text-center text-sm text-slate-600">
                  {mode === 'sign-in' ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}{' '}
                  <button
                    className="font-extrabold text-red-600 hover:text-red-700"
                    disabled={busy}
                    onClick={() => {
                      setError('')
                      setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
                    }}
                    type="button"
                  >
                    {mode === 'sign-in' ? 'إنشاء حساب' : 'تسجيل الدخول'}
                  </button>
                </p>
              </>
            )}
          </section>
        <footer className="mt-5 text-center text-xs leading-6 text-slate-500">
          سجّل الدخول بحسابك الشخصي. لا يوجد تسجيل دخول كضيف.
        </footer>
      </div>
    </main>
  )
}

function AuthFeature({
  color,
  label,
  symbol,
}: {
  color: 'blue' | 'green' | 'purple'
  label: string
  symbol: string
}) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
  }[color]

  return (
    <div className="p-2">
      <span
        aria-hidden="true"
        className={`mx-auto mb-2 grid size-10 place-items-center rounded-full text-sm font-bold ${colors}`}
      >
        {symbol}
      </span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  )
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p
      className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm leading-6 text-red-800"
      role="alert"
    >
      {message}
    </p>
  )
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
        transform="translate(0 4)"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.74 7.18l7.65 5.94c4.47-4.13 7.13-10.2 7.13-17.59Z"
        transform="translate(0 0)"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z"
        transform="translate(0 0)"
      />
      <path
        fill="#34A853"
        d="M24 48c6.47 0 11.9-2.13 15.85-5.86l-7.65-5.94c-2.13 1.43-4.85 2.28-8.2 2.28-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
        transform="translate(0 0)"
      />
    </svg>
  )
}

export default App
