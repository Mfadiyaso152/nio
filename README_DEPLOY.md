# دليل التشغيل والنشر — منصة وِصال | WISAL

## 1. المتطلبات الأساسية
- Node.js 20+
- مشروع Firebase مُهيأ (`firebase-applet-config.json`) مع تفعيل:
  - **Authentication**: مزود Google Sign-In
  - **Cloud Firestore**: قاعدة البيانات السحابية + نشر ملف `firestore.rules`

## 2. متغيرات البيئة (`.env`)
انسخ ملف `.env.example` إلى `.env`:
- `APP_URL`: الرابط العام للمنصة.
- **تكامل Apple Wallet** (اختياري): `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_WALLET_CERT_PEM`, `APPLE_WALLET_KEY_PEM`, `APPLE_WALLET_WWDR_PEM`.
- **تكامل Google Wallet** (اختياري): `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SA_JSON`.
- **تكامل Samsung Wallet** (اختياري): `SAMSUNG_WALLET_PARTNER_ID`, `SAMSUNG_WALLET_CARD_ID`, `SAMSUNG_WALLET_PRIVATE_KEY`.

> ملاحظة: أزرار المحافظ الرقمية في صفحة تذكرة المدعو تُعرض تلقائياً فقط عند توفر شهادات ومفاتيح التكامل الرسمية على الخادم.

## 3. التشغيل المحلي والإنتاج
```bash
npm install
npm run dev      # التشغيل التطويري على المنفذ 3000
npm run lint     # فحص TypeScript
npm run build    # بناء حزمة الإنتاج
npm start        # تشغيل الإنتاج عبر server.ts
```

## 4. الأمان وصلاحيات الإدارة
- الدخول إلى لوحة التحكم، إنشاء المناسبات، استعراض قوائم المدعوين، التقارير، ومسح التذاكر عند البوابة محصور بالكامل لحساب Google المعتمد (`mfb.15.f@gmail.com`) عبر:
  1. التحقق من توقيع رمز الجلسة (`Firebase ID Token`) على الخادم (`/api/auth/verify-admin`).
  2. قواعد أمان Firestore في `firestore.rules`.
- تأكيد حضور الضيف ومكافحة التكرار عند البوابة منفذان عبر `runTransaction` الذرية داخل Firestore لضمان عدم مرور تذكرة واحدة من جهازين في الوقت نفسه.
