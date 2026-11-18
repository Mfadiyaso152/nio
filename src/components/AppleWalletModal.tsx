import { useEffect, useState } from 'react';
import { Calendar, Download, Loader2, X } from 'lucide-react';
import { AppleWalletIcon } from './AppleWalletBadgeButton';
import { QrCodeDisplay } from './QrCodeDisplay';
import type { EventDoc, WalletIntegrationStatus } from '../types';
import {
  downloadCalendarIcs,
  downloadDataUrlPng,
  renderInvitationPassPng,
} from '../utils/themePresets';

interface AppleWalletModalProps {
  open: boolean;
  onClose: () => void;
  event: EventDoc;
  guestDisplay: string;
  qrToken: string;
  attendingCount?: number;
}

export function AppleWalletModal({
  open,
  onClose,
  event,
  guestDisplay,
  qrToken,
  attendingCount = 1,
}: AppleWalletModalProps) {
  const [status, setStatus] = useState<WalletIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    let active = true;
    fetch('/api/wallet/status')
      .then((res) => res.json())
      .then((data: WalletIntegrationStatus) => {
        if (active) setStatus(data);
      })
      .catch(() => {
        if (active) setStatus({ apple: false, google: false, samsung: false });
      });
    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

  const handleDownloadPkpass = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/wallet/apple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrToken,
          eventTitle: event.title,
          eventSlug: event.slug,
          dateText: event.dateText,
          timeText: event.timeText,
          venueName: event.venueName,
          city: event.city,
          guestDisplay,
          attendingCount,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        setMessage(err.error || 'تعذر توليد ملف Apple Wallet.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nio-${qrToken}.pkpass`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage('تم تحميل تذكرة Apple Wallet (.pkpass) بنجاح.');
    } catch {
      setMessage('حدث خطأ أثناء الاتصال بالخادم.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPassPng = async () => {
    setDownloadingPng(true);
    try {
      const pngUrl = await renderInvitationPassPng({
        event,
        guestName: guestDisplay,
        qrToken,
        includeQr: true,
      });
      downloadDataUrlPng(pngUrl, `nio-pass-${qrToken}.png`);
    } finally {
      setDownloadingPng(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white border border-[#E4E4EA] rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E4EA]">
          <div className="flex items-center gap-2.5">
            <AppleWalletIcon className="w-7 h-5" />
            <h3 className="font-ruqaa text-xl font-bold text-[#34343D]">
              بطاقة Apple Wallet
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#6B6B76] hover:bg-[#F7F7F9] hover:text-[#34343D] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Apple Wallet Pass Styled Card */}
          <div className="rounded-2xl bg-[#34343D] text-white p-5 border border-black/20 space-y-4">
            <div className="flex items-center justify-between border-b border-white/15 pb-3">
              <div className="flex items-center gap-2">
                <img
                  src="/assets/aistudio/nio_jpg_0e136059.jpg"
                  alt="NIO"
                  className="w-8 h-8 rounded-lg object-contain bg-white p-0.5"
                />
                <span className="font-ruqaa text-base font-bold">نيو | NIO</span>
              </div>
              <span className="text-[11px] font-cairo text-white/75">تذكرة دخول</span>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] text-white/65">المناسبة</p>
              <p className="font-ruqaa text-2xl font-bold leading-snug">{event.title}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs pt-1">
              <div>
                <p className="text-[11px] text-white/65">المدعو</p>
                <p className="font-bold text-white mt-0.5 truncate">{guestDisplay}</p>
              </div>
              <div>
                <p className="text-[11px] text-white/65">التاريخ</p>
                <p className="font-bold text-white mt-0.5 truncate">
                  {event.dateText || 'سيُحدد لاحقاً'}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl p-3 flex flex-col items-center gap-2">
              <QrCodeDisplay value={qrToken} size={132} className="border-0 p-0" />
              <span className="font-mono-tabular text-[11px] text-[#34343D] font-semibold">
                {qrToken}
              </span>
            </div>
          </div>

          {message && (
            <p className="text-xs text-center font-medium text-[#34343D] bg-[#F7F7F9] border border-[#E4E4EA] rounded-lg px-3 py-2">
              {message}
            </p>
          )}

          <div className="space-y-2.5">
            {status?.apple && (
              <button
                type="button"
                onClick={handleDownloadPkpass}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 py-3 px-4 bg-black hover:bg-[#1C1C1E] text-white rounded-xl text-sm font-bold transition-colors cursor-pointer disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <AppleWalletIcon className="w-6 h-4" />
                )}
                <span>إضافة مباشرة إلى Apple Wallet (.pkpass)</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadPassPng}
              disabled={downloadingPng}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#34343D] hover:bg-[#26262E] text-white rounded-xl text-sm font-bold transition-colors cursor-pointer disabled:opacity-60"
            >
              {downloadingPng ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>حفظ بطاقة الدعوة والباركود (PNG)</span>
            </button>

            <button
              type="button"
              onClick={() => downloadCalendarIcs(event, guestDisplay)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#F7F7F9] hover:bg-[#ECECF2] text-[#34343D] border border-[#E4E4EA] rounded-xl text-sm font-bold transition-colors cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              <span>إضافة الموعد إلى تقويم Apple</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
