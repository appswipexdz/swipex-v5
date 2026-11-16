import { FirebaseError } from 'firebase/app'

const authErrorMessages: Record<string, string> = {
  'auth/email-already-in-use': 'هذا البريد مسجّل مسبقًا. سجّل الدخول بدلًا من ذلك.',
  'auth/invalid-credential': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة.',
  'auth/operation-not-allowed':
    'طريقة تسجيل الدخول هذه غير مفعّلة في إعدادات Firebase.',
  'auth/popup-closed-by-user': 'أُغلقت نافذة Google قبل اكتمال تسجيل الدخول.',
  'auth/popup-blocked': 'حظر المتصفح نافذة Google المنبثقة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.',
  'auth/too-many-requests': 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.',
  'auth/weak-password': 'كلمة المرور ضعيفة؛ استخدم 6 أحرف على الأقل.',
  'auth/network-request-failed': 'تعذر الاتصال. تحقق من الإنترنت ثم أعد المحاولة.',
  'auth/account-exists-with-different-credential':
    'يوجد حساب بهذا البريد عبر طريقة تسجيل دخول أخرى.',
}

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    const message = authErrorMessages[error.code]
    if (message) return message

    console.error('Firebase authentication error:', error)
  } else {
    console.error('Unexpected authentication error:', error)
  }

  return 'تعذر إكمال تسجيل الدخول. حاول مجددًا أو تحقق من إعدادات الحساب.'
}
