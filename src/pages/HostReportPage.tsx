import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Loader2,
  MapPin,
  QrCode,
  UserCheck,
  UserX,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { SharedReportEntry, SharedReportMeta } from '../types';

type FilterKind = 'all' | 'attended' | 'absent' | 'duplicates';

export function HostReportPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<SharedReportMeta | null>(null);
  const [entries, setEntries] = useState<SharedReportEntry[]>([]);
  const [filter, setFilter] = useState<FilterKind>('all');

  useEffect(() => {
    if (!shareToken) {
      setLoading(false);
      return;
    }

    let unsubEntries: (() => void) | undefined;

    async function init() {
      try {
        const metaSnap = await getDoc(doc(db, 'sharedReports', shareToken!));
        if (!metaSnap.exists()) {
          setLoading(false);
          return;
        }
        setMeta(metaSnap.data() as SharedReportMeta);

        const q = query(
          collection(db, 'sharedReports', shareToken!, 'entries'),
          where('shareToken', '==', shareToken!)
        );
        unsubEntries = onSnapshot(
          q,
          (snap) => {
            const list: SharedReportEntry[] = [];
            snap.forEach((d) => list.push(d.data() as SharedReportEntry));
            list.sort((a, b) => a.guestDisplay.localeCompare(b.guestDisplay, 'ar'));
            setEntries(list);
            setLoading(false);
          },
          (err) => {
            handleFirestoreError(
              err,
              OperationType.LIST,
              `sharedReports/${shareToken}/entries`
            );
          }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `sharedReports/${shareToken}`);
      }
    }

    void init();
    return () => {
      unsubEntries?.();
    };
  }, [shareToken]);

  const counts = useMemo(() => {
    const total = entries.length;
    const attended = entries.filter((e) => e.checkedIn).length;
    const absent = total - attended;
    const duplicates = entries.filter((e) => (e.duplicateAttempts || 0) > 0).length;
    return { total, attended, absent, duplicates };
  }, [entries]);

  const filtered = useMemo(() => {
    if (filter === 'attended') return entries.filter((e) => e.checkedIn);
    if (filter === 'absent') return entries.filter((e) => !e.checkedIn);
    if (filter === 'duplicates')
      return entries.filter((e) => (e.duplicateAttempts || 0) > 0);
    return entries;
  }, [entries, filter]);

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

  if (!meta) {
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
        <h1 className="font-ruqaa text-3xl font-bold">رابط الإحصاءات غير صالح</h1>
        <p className="text-sm text-[#6B6B76]">
          تأكد من صحة رابط المشاركة المرسل من منظم الحفل.
        </p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#F7F7F9] text-[#34343D]">
      <header className="bg-white border-b border-[#E4E4EA]">
        <div className="max-w-5xl mx-auto px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/nio_jpg_0e136059.jpg"
              alt="NIO"
              className="w-11 h-11 rounded-xl object-contain border border-[#E4E4EA] p-1 bg-white"
            />
            <div>
              <h1 className="font-ruqaa text-2xl sm:text-3xl font-bold text-[#34343D]">
                تقرير حضور: {meta.eventTitle}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-xs text-[#6B6B76] mt-0.5">
                {meta.dateText && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {meta.dateText}
                  </span>
                )}
                {meta.venueName && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {meta.venueName}
                  </span>
                )}
              </div>
            </div>
          </div>

          <span className="font-ruqaa text-lg font-bold text-[#34343D]">
            نيو | NIO
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-8 space-y-6">
        {/* Live Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E4E4EA] rounded-2xl p-5 space-y-1">
            <div className="flex items-center justify-between text-[#6B6B76]">
              <span className="text-xs font-bold">إجمالي المدعوين</span>
              <QrCode className="w-4 h-4" />
            </div>
            <p className="text-3xl font-extrabold tabular-nums">{counts.total}</p>
          </div>

          <div className="bg-white border border-[#E4E4EA] rounded-2xl p-5 space-y-1">
            <div className="flex items-center justify-between text-emerald-700">
              <span className="text-xs font-bold">حضروا الحفل</span>
              <UserCheck className="w-4 h-4" />
            </div>
            <p className="text-3xl font-extrabold tabular-nums text-emerald-700">
              {counts.attended}
            </p>
          </div>

          <div className="bg-white border border-[#E4E4EA] rounded-2xl p-5 space-y-1">
            <div className="flex items-center justify-between text-[#6B6B76]">
              <span className="text-xs font-bold">لم يحضروا</span>
              <UserX className="w-4 h-4" />
            </div>
            <p className="text-3xl font-extrabold tabular-nums">{counts.absent}</p>
          </div>

          <div className="bg-white border border-[#E4E4EA] rounded-2xl p-5 space-y-1">
            <div className="flex items-center justify-between text-amber-700">
              <span className="text-xs font-bold">تكرار الباركود</span>
              <AlertTriangle className="w-4 h-4" />
            </div>
            <p className="text-3xl font-extrabold tabular-nums text-amber-700">
              {counts.duplicates}
            </p>
          </div>
        </div>

        {/* Guest Attendance List */}
        <div className="bg-white border border-[#E4E4EA] rounded-2xl overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-[#E4E4EA] flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-ruqaa text-xl font-bold text-[#34343D]">
              سجل المدعوين المباشر
            </h2>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['all', `الكل (${counts.total})`],
                  ['attended', `حضر (${counts.attended})`],
                  ['absent', `لم يحضر (${counts.absent})`],
                  ['duplicates', `تكرار الباركود (${counts.duplicates})`],
                ] as [FilterKind, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                    filter === id
                      ? 'bg-[#34343D] text-white'
                      : 'bg-[#F7F7F9] text-[#6B6B76] hover:text-[#34343D]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#6B6B76]">
              لا توجد سجلات ضمن هذا التصنيف حالياً.
            </div>
          ) : (
            <div className="divide-y divide-[#E4E4EA]">
              {filtered.map((entry) => (
                <div
                  key={entry.qrToken}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <p className="font-ruqaa text-xl font-bold text-[#34343D]">
                      {entry.guestDisplay}
                    </p>
                    <p className="text-xs text-[#6B6B76] font-mono-tabular" dir="ltr">
                      {entry.qrToken}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {entry.checkedIn ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>حضر</span>
                      </span>
                    ) : (
                      <span className="text-xs font-bold px-3 py-1 rounded-lg bg-[#F7F7F9] text-[#6B6B76] border border-[#E4E4EA]">
                        لم يحضر
                      </span>
                    )}

                    {(entry.duplicateAttempts || 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>حاول استخدام الباركود {entry.duplicateAttempts + 1} مرات</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
