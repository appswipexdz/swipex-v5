import { useEffect, useState, type FormEvent } from 'react'
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
import { auth, missingFirebaseConfig } from './lib/firebase'

type AuthMode = 'sign-in' | 'sign-up'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(auth !== null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!auth) return

    return onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser)
        setAuthLoading(false)
      },
      (authStateError) => {
        console.error('Firebase auth state listener failed:', authStateError)
        setError('تعذر التحقق من جلسة الدخول. أعد تحميل الصفحة أو سجّل الدخول مجددًا.')
        setAuthLoading(false)
      },
    )
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

  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between">
          <a className="flex items-center gap-3" href="/" aria-label="SwiPex">
            <span className="grid size-11 place-items-center rounded-2xl bg-brand-600 text-lg font-extrabold text-white shadow-lg shadow-brand-600/20">
              S
            </span>
            <span>
              <span className="block text-lg font-extrabold tracking-tight text-slate-900">
                SwiPex
              </span>
              <span className="block text-xs font-semibold text-slate-500">
                النسخة الخامسة
              </span>
            </span>
          </a>
          <span className="rounded-full border border-brand-100 bg-white px-3 py-1.5 text-xs font-bold text-brand-700">
            V5 · 5.0.0
          </span>
        </header>

        <section className="my-auto grid gap-10 py-12 md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700">
              <span className="size-2 rounded-full bg-emerald-500" />
              إدارة توصيل الطرود، بحسابك الخاص
            </p>
            <h1 className="max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-slate-950 sm:text-5xl">
              تجربة أسرع،
              <span className="block text-brand-700">وبنية جاهزة للنمو.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-slate-600">
              سجّل الدخول للبدء. بياناتك منفصلة عن حسابات المستخدمين الآخرين
              ومتاحة على أجهزتك بعد تفعيل المزامنة.
            </p>
          </div>

          <section
            aria-labelledby="auth-title"
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8"
          >
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
                <h2
                  id="auth-title"
                  className="text-xl font-extrabold text-slate-900"
                >
                  أهلًا بك
                </h2>
                <p className="mt-2 break-all text-sm text-slate-600" dir="ltr">
                  {user.email}
                </p>
                <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">
                  تم تسجيل الدخول بنجاح. ستُضاف إدارة الطرود والمزامنة في المرحلة
                  التالية.
                </p>
                {error && <ErrorMessage message={error} />}
                <button
                  className="mt-5 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busy}
                  onClick={signOutUser}
                  type="button"
                >
                  {busy ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
                </button>
              </div>
            ) : (
              <>
                <h2
                  id="auth-title"
                  className="text-xl font-extrabold text-slate-900"
                >
                  {mode === 'sign-in' ? 'تسجيل الدخول' : 'إنشاء حساب'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {mode === 'sign-in'
                    ? 'استخدم حساب Google أو بريدك الإلكتروني.'
                    : 'أنشئ حسابًا بالبريد الإلكتروني وكلمة المرور.'}
                </p>

                {error && <ErrorMessage message={error} />}

                <form className="mt-6 space-y-4" onSubmit={submitEmailAuth}>
                  <label className="block">
                    <span className="mb-2 block text-sm font-bold text-slate-700">
                      البريد الإلكتروني
                    </span>
                    <input
                      autoComplete="email"
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm outline-none transition focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
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
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm outline-none transition focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
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
                    className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busy}
                  onClick={signInWithGoogle}
                  type="button"
                >
                  <GoogleMark />
                  المتابعة باستخدام Google
                </button>

                <p className="mt-5 text-center text-sm text-slate-600">
                  {mode === 'sign-in' ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}{' '}
                  <button
                    className="font-extrabold text-brand-700 hover:text-brand-600"
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
        </section>

        <footer className="border-t border-slate-200 pt-4 text-xs leading-6 text-slate-500">
          سجّل الدخول بحسابك الشخصي. لا يوجد تسجيل دخول كضيف.
        </footer>
      </div>
    </main>
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
