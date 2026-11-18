import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  CalendarDays,
  CheckCircle2,
  Download,
  Loader2,
  MapPin,
  XCircle,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { EventDoc, InvitationDoc, QrTicketDoc } from '../types';
import { FIELD_LIMITS } from '../types';
import {
  downloadDataUrlPng,
  downloadQrOnlyPng,
  renderInvitationPassPng,
} from '../utils/themePresets';
import { InvitationCardRenderer } from '../components/InvitationCardRenderer';
import { QrCodeDisplay } from '../components/QrCodeDisplay';
import { AppleWalletBadgeButton } from '../components/AppleWalletBadgeButton';
import { AppleWalletModal } from '../components/AppleWalletModal';

export function GuestInvitationPage() {
  const { inviteToken } = useParams<{ inviteToken: string }>();

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<InvitationDoc | null>(null);
  const [eventDoc, setEventDoc] = useState<EventDoc | null>(null);
  const [ticket, setTicket] = useState<QrTicketDoc | null>(null);

  const [attendingCount, setAttendingCount] = useState(1);
  const [guestNote, setGuestNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);

  useEffect(() => {
    if (!inviteToken) {
      setLoading(false);
      return;
    }

    let active = true;
    async function load() {
      try {
        const invSnap = await getDoc(doc(db, 'invitations', inviteToken!));
        if (!invSnap.exists()) {
          if (active) setLoading(false);
          return;
        }
        const invData = invSnap.data() as InvitationDoc;

        const [evSnap, tkSnap] = await Promise.all([
          getDoc(doc(db, 'events', invData.eventSlug)),
          getDoc(doc(db, 'qrTickets', invData.qrToken)),
        ]);

        if (!active) return;
        setInvitation(invData);
        setAttendingCount(invData.attendingCount || 1);
        setGuestNote(invData.guestNote || '');
        if (evSnap.exists()) setEventDoc(evSnap.data() as EventDoc);
        if (tkSnap.exists()) setTicket(tkSnap.data() as QrTicketDoc);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `invitations/${inviteToken}`);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [inviteToken]);

  const handleRsvp = async (status: 'confirmed' | 'declined') => {
    if (!invitation || !eventDoc) return;
    setSubmitting(true);
    const nextCount =
      status === 'declined'
        ? 0
        : Math.max(1, Math.min(invitation.maxCompanions, attendingCount));
    const cleanNote = guestNote.trim().slice(0, FIELD_LIMITS.guestNoteMax);

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'invitations', invitation.inviteToken), {
        rsvpStatus: status,
        attendingCount: nextCount,
        guestNote: cleanNote,
        rsvpAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'qrTickets', invitation.qrToken), {
        rsvpStatus: status,
        attendingCount: nextCount,
        updatedAt: serverTimestamp(),
      });
      batch.update(
        doc(db, 'sharedReports', invitation.shareToken, 'entries', invitation.qrToken),
        {
          rsvpStatus: status,
          attendingCount: nextCount,
          updatedAt: serverTimestamp(),
        }
      );

      await batch.commit();
      setInvitation((prev) =>
        prev
          ? {
              ...prev,
              rsvpStatus: status,
              attendingCount: nextCount,
              guestNote: cleanNote,
            }
          : prev
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `invitations/${invitation.inviteToken}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadFullPng = async () => {
    if (!invitation || !eventDoc) return;
    setDownloadingPng(true);
    try {
      const dataUrl = await renderInvitationPassPng({
        event: eventDoc,
        guestName: invitation.guestName,
        guestTitle: invitation.guestTitle,
        qrToken: invitation.qrToken,
        includeQr: true,
      });
      downloadDataUrlPng(dataUrl, `nio-invite-${invitation.qrToken}.png`);
    } finally {
      setDownloadingPng(false);
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

  if (!invitation || !eventDoc) {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-[#F7F7F9] text-[#34343D] flex flex-col items-center justify-center p-6 text-center space-y-3"
      >
        <img
          src="/assets/aistudio/nio_jpg_0e136059.jpg"
          alt="NIO"
          className="w-16 h-16 rounded-2xl object-contain border border-[#E4E4EA] p-1.5 bg-white"
        />
        <h1 className="font-ruqaa text-3xl font-bold">الدعوة غير متوفرة</h1>
        <p className="text-sm text-[#6B6B76]">
          يرجى التحقق من رابط الدعوة المرسل إليك.
        </p>
      </div>
    );
  }

  const guestDisplay = [invitation.guestTitle, invitation.guestName]
    .filter(Boolean)
    .join(' ');
  const isCheckedIn = Boolean(ticket?.checkedIn || invitation.checkedIn);

  return (
    <div dir="rtl" className="min-h-screen bg-[#F7F7F9] text-[#34343D] py-8 px-4">
      <div className="max-w-lg mx-auto space-y-5">
        {/* Top Brand Pill */}
        <div className="flex items-center justify-center gap-2.5">
          <img
            src="/assets/aistudio/nio_jpg_0e136059.jpg"
            alt="NIO"
            className="w-9 h-9 rounded-xl object-contain border border-[#E4E4EA] p-0.5 bg-white"
          />
          <span className="font-ruqaa text-xl font-bold text-[#34343D]">
            نيو | NIO
          </span>
        </div>

        {/* Custom Freeform Invitation Canvas + Action Slot */}
        <InvitationCardRenderer
          design={eventDoc.canvasDesign}
          guestName={invitation.guestName}
          guestTitle={invitation.guestTitle}
        >
          <div className="space-y-5">
            {/* Event Key Info */}
            {(eventDoc.dateText || eventDoc.venueName) && (
              <div className="space-y-1.5 text-xs text-[#52525E] border-b border-[#E4E4EA] pb-4">
                {eventDoc.dateText && (
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-[#34343D]" />
                    <span>
                      {eventDoc.dateText}
                      {eventDoc.timeText ? ` • ${eventDoc.timeText}` : ''}
                    </span>
                  </div>
                )}
                {eventDoc.venueName && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#34343D]" />
                    <span>
                      {eventDoc.venueName}
                      {eventDoc.city ? ` - ${eventDoc.city}` : ''}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Checked-In Banner */}
            {isCheckedIn && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold text-center">
                تم مسح تذكرتك وتسجيل دخولك بنجاح. نتمنى لك أمسية سعيدة!
              </div>
            )}

            {/* RSVP Controls (shown when pending or allowing change before check-in) */}
            {invitation.rsvpStatus !== 'confirmed' && !isCheckedIn && (
              <div className="space-y-3">
                <p className="font-ruqaa text-xl font-bold text-center text-[#34343D]">
                  يسرنا تأكيد حضوركم الكريم
                </p>

                {invitation.maxCompanions > 1 && (
                  <div className="flex items-center justify-between bg-[#F7F7F9] border border-[#E4E4EA] rounded-xl px-4 py-2.5">
                    <span className="text-xs font-bold">عدد الحاضرين</span>
                    <select
                      value={attendingCount}
                      onChange={(e) => setAttendingCount(Number(e.target.value))}
                      className="bg-white border border-[#E4E4EA] rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums"
                    >
                      {Array.from(
                        { length: invitation.maxCompanions },
                        (_, idx) => idx + 1
                      ).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleRsvp('confirmed')}
                    className="inline-flex items-center justify-center gap-2 py-3 px-4 bg-[#34343D] hover:bg-[#26262E] text-white rounded-xl text-sm font-bold cursor-pointer disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تأكيد الحضور</span>
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleRsvp('declined')}
                    className="inline-flex items-center justify-center gap-2 py-3 px-4 bg-[#F7F7F9] hover:bg-[#ECECF2] text-[#34343D] border border-[#E4E4EA] rounded-xl text-sm font-bold cursor-pointer disabled:opacity-60"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>أعتذر عن الحضور</span>
                  </button>
                </div>
              </div>
            )}

            {invitation.rsvpStatus === 'declined' && !isCheckedIn && (
              <p className="text-xs text-center text-[#6B6B76]">
                تم تسجيل اعتذارك عن الحضور. يمكنك الضغط على «تأكيد الحضور» أعلاه إذا تغيرت خططك.
              </p>
            )}

            {/* Ticket QR + PNG + Apple Wallet (Shown upon confirmation) */}
            {invitation.rsvpStatus === 'confirmed' && (
              <div className="space-y-4 text-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>تم تأكيد حضورك • تذكرة الدخول جاهزة</span>
                </div>

                <div className="flex flex-col items-center gap-2 py-2">
                  <QrCodeDisplay
                    value={invitation.qrToken}
                    size={196}
                    className="rounded-xl"
                  />
                  <span className="font-mono-tabular text-xs font-bold text-[#6B6B76]">
                    {invitation.qrToken}
                  </span>
                </div>

                <div className="space-y-2.5">
                  <AppleWalletBadgeButton onClick={() => setWalletOpen(true)} />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadFullPng}
                      disabled={downloadingPng}
                      className="inline-flex items-center justify-center gap-2 py-2.5 px-3 bg-[#34343D] hover:bg-[#26262E] text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-60"
                    >
                      {downloadingPng ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      <span>حفظ البطاقة PNG</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadQrOnlyPng(invitation.qrToken, invitation.guestName)}
                      className="inline-flex items-center justify-center gap-2 py-2.5 px-3 bg-[#F7F7F9] hover:bg-[#ECECF2] text-[#34343D] border border-[#E4E4EA] rounded-xl text-xs font-bold cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>حفظ الباركود PNG</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </InvitationCardRenderer>
      </div>

      <AppleWalletModal
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        event={eventDoc}
        guestDisplay={guestDisplay}
        qrToken={invitation.qrToken}
        attendingCount={invitation.attendingCount || 1}
      />
    </div>
  );
}
