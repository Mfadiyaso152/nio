import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2, ShieldAlert } from 'lucide-react';
import {
  auth,
  isAuthorizedAdminUser,
  signInWithGoogleAdmin,
  signOutAdmin,
  verifyAdminOnServer,
} from '../firebase';

export function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      if (!isAuthorizedAdminUser(user)) {
        await signOutAdmin();
        setErrorMsg('هذا الحساب غير مصرح له بالدخول لإدارة نيو.');
        setLoading(false);
        return;
      }

      const verified = await verifyAdminOnServer(user);
      if (verified.authorized) {
        navigate('/admin', { replace: true });
      } else {
        await signOutAdmin();
        setErrorMsg(verified.error || 'تعذر التحقق من صلاحيات المسؤول.');
        setLoading(false);
      }
    });

    return () => unsub();
  }, [navigate]);

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setSigningIn(true);
    try {
      const result = await signInWithGoogleAdmin();
      if (!isAuthorizedAdminUser(result.user)) {
        await signOutAdmin();
        setErrorMsg('الدخول حصري لحساب الإدارة المعتمد فقط.');
        return;
      }
      const verified = await verifyAdminOnServer(result.user);
      if (!verified.authorized) {
        await signOutAdmin();
        setErrorMsg(verified.error || 'الحساب غير مصرح له على الخادم.');
        return;
      }
      navigate('/admin', { replace: true });
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'auth/unauthorized-domain') {
        setErrorMsg(
          'هذا الدومين غير مضاف في النطاقات الموثوقة (Authorized domains) داخل Firebase Authentication.'
        );
      } else {
        setErrorMsg('تعذر إتمام تسجيل الدخول عبر Google.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-[#F7F7F9] flex items-center justify-center text-[#34343D]"
      >
        <Loader2 className="w-7 h-7 animate-spin" />
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#F7F7F9] text-[#34343D] flex items-center justify-center p-5"
    >
      <div className="w-full max-w-md bg-white border border-[#E4E4EA] rounded-2xl p-8 text-center space-y-6 shadow-xs">
        <div className="w-20 h-20 mx-auto rounded-2xl border border-[#E4E4EA] p-2 bg-white">
          <img
            src="/assets/aistudio/nio_jpg_0e136059.jpg"
            alt="شعار نيو"
            className="w-full h-full object-contain"
          />
        </div>

        <div className="space-y-1.5">
          <h1 className="font-ruqaa text-3xl font-bold text-[#34343D]">
            إدارة منصة نيو | NIO
          </h1>
          <p className="text-sm text-[#6B6B76]">
            تسجيل الدخول مخصص لمسؤول المنصة المعتمد فقط
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2 text-right text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={signingIn}
          className="w-full flex items-center justify-center gap-3 py-3.5 px-5 bg-[#34343D] hover:bg-[#26262E] text-white rounded-xl text-sm font-bold transition-colors cursor-pointer disabled:opacity-60"
        >
          {signingIn ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
              />
            </svg>
          )}
          <span>المتابعة بحساب Google</span>
        </button>
      </div>
    </div>
  );
}
