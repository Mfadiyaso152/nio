# دليل التشغيل والنشر — منصة نيو | NIO

## 1. الدومين الرسمي
- الرابط العام للمنصة: `https://nio-wmgr.vercel.app/`

## 2. المتطلبات الأساسية وإعداد Firebase
- مشروع Firebase مُهيأ (`firebase-applet-config.json` — `citric-phenomenon-f7854`):
  - **Authentication**: تفعيل مزود **Google Sign-In**.
  - **Authorized Domains**: تأكد من إضافة الدومين `nio-wmgr.vercel.app` ضمن **Firebase Console → Authentication → Settings → Authorized domains** ليعمل تسجيل دخول المسؤول (`mfb.15.f@gmail.com`) على Vercel بدون حظر.
  - **Cloud Firestore**: قاعدة البيانات `ai-studio-51c97bbf-2ce7-4994-9043-5c542e89200e` + نشر ملف `firestore.rules`.

## 3. النشر على Vercel
- ملف `vercel.json` مضبوط لإعادة توجيه جميع مسارات التطبيق (`/admin`, `/login`, `/admin/event/*`, `/invite/*`, `/report/*`) إلى `index.html` مع دعم دوال `/api/*` داخل مجلد `/api`.
- متغيرات البيئة الاختيارية في Vercel:
  - `VITE_PUBLIC_SITE_URL=https://nio-wmgr.vercel.app`
  - متغيرات **Apple Wallet** (`.pkpass` عند توفر شهادات Apple Developer): `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_WALLET_CERT_PEM`, `APPLE_WALLET_KEY_PEM`, `APPLE_WALLET_WWDR_PEM`.

## 4. التشغيل المحلي
```bash
npm install
npm run dev      # التشغيل التطويري على المنفذ 3000
npm run lint     # فحص TypeScript
npm run build    # بناء حزمة الإنتاج
npm start        # تشغيل الإنتاج عبر server.ts
```
