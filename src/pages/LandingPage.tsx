import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Keyboard,
  MessageCircle,
  QrCode,
  ScanLine,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { QrTicketDoc } from '../types';
import {
  buildWhatsAppOrderUrl,
  NIO_WHATSAPP_DISPLAY,
} from '../utils/themePresets';

type ScanFeedbackState =
  | { kind: 'idle' }
  | { kind: 'processing' }
  | { kind: 'success'; label: 'تم'; guestDisplay: string; qrToken: string }
  | { kind: 'duplicate'; label: 'محاولة استخدام الرمز مره اخرى'; guestDisplay: string; attempts: number }
  | { kind: 'error'; label: 'EROOR'; detail: string };

export function LandingPage() {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanFeedbackState>({ kind: 'idle' });
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);
  const lastTokenTimeRef = useRef<{ token: string; ts: number }>({ token: '', ts: 0 });
  const scannerRegionId = 'nio-home-qr-scanner';

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .then(() => scannerRef.current?.clear())
          .catch(() => {});
        scannerRef.current = null;
      }
    };
  }, []);

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // ignore stop errors when camera is already inactive
      }
      scannerRef.current = null;
    }
    setCameraActive(false);
  };

  const processScannedCode = async (rawValue: string) => {
    const token = rawValue.trim();
    if (!token || busyRef.current) return;

    const now = Date.now();
    if (
      lastTokenTimeRef.current.token === token &&
      now - lastTokenTimeRef.current.ts < 3000
    ) {
      return;
    }
    lastTokenTimeRef.current = { token, ts: now };

    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(token)) {
      setScanState({
        kind: 'error',
        label: 'EROOR',
        detail: 'الرمز المقروء غير صالح.',
      });
      return;
    }

    busyRef.current = true;
    setScanState({ kind: 'processing' });

    try {
      const outcome = await runTransaction(db, async (tx) => {
        const ticketRef = doc(db, 'qrTickets', token);
        const ticketSnap = await tx.get(ticketRef);

        if (!ticketSnap.exists()) {
          return { status: 'invalid' as const };
        }

        const ticket = ticketSnap.data() as QrTicketDoc;
        const entryRef = doc(
          db,
          'sharedReports',
          ticket.shareToken,
          'entries',
          ticket.qrToken
        );
        const entrySnap = await tx.get(entryRef);

        if (ticket.checkedIn) {
          const nextAttempts = (ticket.duplicateAttempts || 0) + 1;
          tx.update(ticketRef, {
            duplicateAttempts: nextAttempts,
            lastDuplicateAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          if (entrySnap.exists()) {
            tx.update(entryRef, {
              duplicateAttempts: nextAttempts,
              lastDuplicateAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          return {
            status: 'duplicate' as const,
            guestDisplay: ticket.guestDisplay,
            attempts: nextAttempts,
          };
        }

        tx.update(ticketRef, {
          checkedIn: true,
          checkedInAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        if (entrySnap.exists()) {
          tx.update(entryRef, {
            checkedIn: true,
            checkedInAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        return {
          status: 'admitted' as const,
          guestDisplay: ticket.guestDisplay,
          qrToken: ticket.qrToken,
        };
      });

      if (outcome.status === 'invalid') {
        setScanState({
          kind: 'error',
          label: 'EROOR',
          detail: 'هذا الرمز غير مسجل في قائمة الدعوات.',
        });
      } else if (outcome.status === 'duplicate') {
        setScanState({
          kind: 'duplicate',
          label: 'محاولة استخدام الرمز مره اخرى',
          guestDisplay: outcome.guestDisplay,
          attempts: outcome.attempts,
        });
      } else {
        setScanState({
          kind: 'success',
          label: 'تم',
          guestDisplay: outcome.guestDisplay,
          qrToken: outcome.qrToken,
        });
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('permission')) {
        handleFirestoreError(err, OperationType.WRITE, `qrTickets/${token}`);
      }
      setScanState({
        kind: 'error',
        label: 'EROOR',
        detail: 'تعذر التحقق من الرمز، تأكد من الاتصال وحاول مجدداً.',
      });
    } finally {
      busyRef.current = false;
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    setScanState({ kind: 'idle' });
    setCameraActive(true);

    // Wait one tick for container to mount
    await new Promise((r) => setTimeout(r, 80));

    try {
      const qr = new Html5Qrcode(scannerRegionId);
      scannerRef.current = qr;
      await qr.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 240, height: 240 },
        },
        (decodedText) => {
          void processScannedCode(decodedText);
        },
        () => {}
      );
    } catch {
      setCameraActive(false);
      setCameraError(
        'تعذر الوصول للكاميرا. يرجى السماح للمتصفح باستخدام الكاميرا أو التحقق من إعدادات الجهاز.'
      );
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    lastTokenTimeRef.current = { token: '', ts: 0 };
    void processScannedCode(manualCode);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#F7F7F9] text-[#34343D] flex flex-col">
      {/* Minimal Header — Brand only, NO admin/login buttons */}
      <header className="bg-white border-b border-[#E4E4EA]">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <img
              src="/assets/aistudio/nio_jpg_0e136059.jpg"
              alt="شعار نيو NIO"
              className="w-12 h-12 rounded-xl object-contain border border-[#E4E4EA] bg-white p-1"
            />
            <div>
              <h1 className="font-ruqaa text-2xl sm:text-3xl font-bold text-[#34343D] leading-none">
                نيو | NIO
              </h1>
              <p className="text-xs text-[#6B6B76] mt-1">
                دعوات الحفلات والأعراس الرقمية
              </p>
            </div>
          </div>

          <a
            href={buildWhatsAppOrderUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-[#34343D] hover:bg-[#26262E] text-white rounded-xl text-sm font-bold transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            <span>اطلب عبر واتساب</span>
          </a>
        </div>
      </header>

      <main className="flex-1">
        {/* Clean Concise Intro Section — No Mockups or Shapes */}
        <section className="max-w-4xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-10 text-center space-y-6">
          <div className="w-24 h-24 mx-auto rounded-2xl bg-white border border-[#E4E4EA] p-2.5 shadow-xs flex items-center justify-center">
            <img
              src="/assets/aistudio/nio_jpg_0e136059.jpg"
              alt="NIO"
              className="w-full h-full object-contain"
            />
          </div>

          <h2 className="font-ruqaa text-4xl sm:text-5xl font-bold text-[#34343D] leading-tight">
            منصة نيو لإدارة دعوات الحفلات والأعراس
          </h2>

          <p className="text-base sm:text-lg text-[#52525E] max-w-2xl mx-auto leading-relaxed">
            نصمّم لك دعوة مناسبتك بهوية خاصة، ونصدر لكل ضيف رابط دعوة مستقل وباركود دخول ذكي
            مع إمكانية الحفظ في Apple Wallet ومتابعة الحضور لحظياً عند البوابة.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={buildWhatsAppOrderUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 bg-[#34343D] hover:bg-[#26262E] text-white rounded-2xl text-base font-bold transition-colors shadow-sm"
            >
              <MessageCircle className="w-5 h-5" />
              <span>اطلب خدمتك الآن عبر واتساب</span>
              <span className="font-mono-tabular text-sm opacity-85" dir="ltr">
                {NIO_WHATSAPP_DISPLAY}
              </span>
            </a>
          </div>
        </section>

        {/* Simple 3-Point Explanation */}
        <section className="max-w-4xl mx-auto px-5 sm:px-8 pb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-[#E4E4EA] rounded-2xl p-6 space-y-2 text-center">
              <QrCode className="w-7 h-7 mx-auto text-[#34343D]" />
              <h3 className="font-ruqaa text-xl font-bold text-[#34343D]">
                دعوة وباركود لكل ضيف
              </h3>
              <p className="text-sm text-[#6B6B76] leading-relaxed">
                رابط خاص باسم المدعو مع باركود دخول فريد وخيار الإضافة إلى Apple Wallet.
              </p>
            </div>

            <div className="bg-white border border-[#E4E4EA] rounded-2xl p-6 space-y-2 text-center">
              <ShieldCheck className="w-7 h-7 mx-auto text-[#34343D]" />
              <h3 className="font-ruqaa text-xl font-bold text-[#34343D]">
                تنظيم دخول آمن
              </h3>
              <p className="text-sm text-[#6B6B76] leading-relaxed">
                مسح سريع بالكاميرا عند مدخل الحفل لمنع التكرار وضمان دخول المصرح لهم فقط.
              </p>
            </div>

            <div className="bg-white border border-[#E4E4EA] rounded-2xl p-6 space-y-2 text-center">
              <ScanLine className="w-7 h-7 mx-auto text-[#34343D]" />
              <h3 className="font-ruqaa text-xl font-bold text-[#34343D]">
                تقرير مباشر لصاحب الحفل
              </h3>
              <p className="text-sm text-[#6B6B76] leading-relaxed">
                متابعة فورية لعدد الحاضرين والمتغيبين ومحاولات تكرار الباركود عبر رابط خاص.
              </p>
            </div>
          </div>
        </section>

        {/* Bottom Gate QR Scanner Section */}
        <section
          id="gate-scanner"
          className="bg-white border-t border-[#E4E4EA] py-12 px-5 sm:px-8"
        >
          <div className="max-w-xl mx-auto space-y-6 text-center">
            <div className="space-y-2">
              <h2 className="font-ruqaa text-3xl sm:text-4xl font-bold text-[#34343D]">
                مسح رمز الدعوات
              </h2>
              <p className="text-sm text-[#6B6B76]">
                فعّل الكاميرا ووجّهها نحو باركود الضيف للتحقق من الدخول فوراً
              </p>
            </div>

            {/* Camera Controls & Viewport */}
            <div className="bg-[#F7F7F9] border border-[#E4E4EA] rounded-2xl p-5 space-y-4">
              {!cameraActive ? (
                <button
                  type="button"
                  onClick={startCamera}
                  className="w-full py-4 px-6 bg-[#34343D] hover:bg-[#26262E] text-white rounded-xl text-base font-bold inline-flex items-center justify-center gap-3 transition-colors cursor-pointer"
                >
                  <Camera className="w-5 h-5" />
                  <span>فتح الكاميرا لمسح الرمز</span>
                </button>
              ) : (
                <div className="space-y-3">
                  <div
                    id={scannerRegionId}
                    className="w-full max-w-sm mx-auto rounded-xl overflow-hidden bg-black border border-[#E4E4EA]"
                  />
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-[#ECECF2] text-[#34343D] border border-[#E4E4EA] rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <CameraOff className="w-4 h-4" />
                    <span>إيقاف الكاميرا</span>
                  </button>
                </div>
              )}

              {cameraError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                  {cameraError}
                </p>
              )}

              {/* Exact Status Result Display */}
              {scanState.kind === 'processing' && (
                <div className="py-5 px-4 rounded-xl bg-white border border-[#E4E4EA] text-sm font-bold text-[#34343D]">
                  جارٍ التحقق من الرمز...
                </div>
              )}

              {scanState.kind === 'success' && (
                <div className="py-6 px-4 rounded-xl bg-emerald-50 border-2 border-emerald-500 text-emerald-900 space-y-1.5">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" />
                  <p className="font-ruqaa text-3xl font-bold">{scanState.label}</p>
                  <p className="text-sm font-bold">{scanState.guestDisplay}</p>
                  <p className="text-xs text-emerald-700">تم تسجيل الدخول بنجاح</p>
                </div>
              )}

              {scanState.kind === 'duplicate' && (
                <div className="py-6 px-4 rounded-xl bg-amber-50 border-2 border-amber-500 text-amber-950 space-y-1.5">
                  <AlertTriangle className="w-10 h-10 mx-auto text-amber-600" />
                  <p className="font-ruqaa text-2xl sm:text-3xl font-bold">
                    {scanState.label}
                  </p>
                  <p className="text-sm font-bold">{scanState.guestDisplay}</p>
                  <p className="text-xs text-amber-800">
                    عدد محاولات التكرار المسجلة: {scanState.attempts}
                  </p>
                </div>
              )}

              {scanState.kind === 'error' && (
                <div className="py-6 px-4 rounded-xl bg-red-50 border-2 border-red-500 text-red-900 space-y-1.5">
                  <XCircle className="w-10 h-10 mx-auto text-red-600" />
                  <p className="font-mono-tabular text-3xl font-extrabold tracking-wider">
                    {scanState.label}
                  </p>
                  <p className="text-xs text-red-700">{scanState.detail}</p>
                </div>
              )}

              {/* Optional manual fallback toggle */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowManualInput((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#6B6B76] hover:text-[#34343D] cursor-pointer"
                >
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>{showManualInput ? 'إخفاء الإدخال اليدوي' : 'إدخال الرمز يدوياً'}</span>
                </button>

                {showManualInput && (
                  <form onSubmit={handleManualSubmit} className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      placeholder="مثال: NIO-ABC123"
                      dir="ltr"
                      className="flex-1 px-3 py-2 bg-white border border-[#E4E4EA] rounded-xl text-sm font-mono-tabular focus:outline-none focus:border-[#34343D]"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#34343D] text-white text-sm font-bold rounded-xl hover:bg-[#26262E] transition-colors cursor-pointer"
                    >
                      تحقق
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#34343D] text-white py-6 px-5 text-center">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/75">
          <p className="font-ruqaa text-base text-white">نيو | NIO للدعوات الرقمية</p>
          <a
            href={buildWhatsAppOrderUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors font-mono-tabular"
            dir="ltr"
          >
            WhatsApp: {NIO_WHATSAPP_DISPLAY}
          </a>
        </div>
      </footer>
    </div>
  );
}
