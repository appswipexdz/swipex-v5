# SwiPex v5

إصدار مستقل مبني باستخدام React 18 وVite 5 وTailwind CSS 3 وTypeScript. هذا
المجلد لا يعتمد وقت التشغيل على ملفات v4 أو بياناتها.

## المتطلبات والتشغيل

- Node.js 20 أو أحدث
- npm 10 أو أحدث

```bash
npm ci
npm run dev
```

## التحقق والبناء

```bash
npm run test:firestore-rules
npm run typecheck
npm run lint
npm run build
npm run preview
```

يتطلب اختبار قواعد Firestore وجود Java لتشغيل المحاكي المحلي.

## إعداد Firebase

1. في Firebase Console، فعّل Google وEmail/Password ضمن Authentication، وأنشئ
   قاعدة Cloud Firestore.
2. انسخ `.env.example` إلى `.env.local` وضع إعدادات تطبيق الويب في الملف
   المحلي. لا ترفع `.env.local` إلى Git.
3. أضف إلى GitHub Actions Repository Variables المتغيرات
   `VITE_FIREBASE_API_KEY` و`VITE_FIREBASE_AUTH_DOMAIN` و
   `VITE_FIREBASE_PROJECT_ID` و`VITE_FIREBASE_STORAGE_BUCKET` و
   `VITE_FIREBASE_MESSAGING_SENDER_ID` و`VITE_FIREBASE_APP_ID`.
4. قيّد مفتاح API بنطاقات النشر المصرح بها من Google Cloud Console. إعدادات
   Firebase المضمّنة في تطبيق الويب ليست أسرارًا؛ قواعد Firestore والتحقق
   من المستخدم هما أساس حماية البيانات.

تُهيّأ Analytics لاحقًا فقط بعد اتخاذ قرار صريح بشأن جمع بيانات الاستخدام.

## النشر على Cloudflare Pages

أنشئ مشروع Pages باسم `swipex-v5` مرة واحدة، ثم أضف أسرار GitHub التالية:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

سير العمل الموجود في `.github/workflows/swipex-v5-deploy.yml` يشغّل فحوصات
البناء لطلبات الدمج، وينشر تلقائيًا عند الدفع إلى فرع `main` في هذا المستودع.
يُحافظ على منطق البناء والنشر نفسه عند نقل المشروع إلى مستودع مستقل.

## تنظيم المشروع

- `src/`: تطبيق React وواجهة RTL.
- `public/`: manifest وملفات الإصدار وService Worker وأصول التطبيق.
- `tailwind.config.cjs`: إعداد Tailwind وخط Cairo.

تُضاف خدمات Firebase والميزات التشغيلية على مراحل. لا تُضع مفاتيح أو بيانات
اعتماد خاصة في ملفات الواجهة؛ تُضبط الإعدادات عند إضافة تكامل Firebase.
