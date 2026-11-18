import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  ArrowLeft,
  CalendarDays,
  Loader2,
  LogOut,
  MapPin,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  ADMIN_EMAIL,
  auth,
  db,
  handleFirestoreError,
  isAuthorizedAdminUser,
  OperationType,
  signOutAdmin,
  verifyAdminOnServer,
} from '../firebase';
import type { EventDoc, EventType } from '../types';
import { FIELD_LIMITS } from '../types';
import {
  createDefaultCanvasDesign,
  createEventSlug,
  EVENT_TYPE_LABELS,
  generateShareToken,
  sanitizeSlugInput,
} from '../utils/themePresets';

export function AdminEventsHomePage() {
  const navigate = useNavigate();
  const [authReady, setAuthReady] = useState(false);
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [eventType, setEventType] = useState<EventType>('wedding');
  const [hostNames, setHostNames] = useState('');
  const [dateText, setDateText] = useState('');
  const [timeText, setTimeText] = useState('');
  const [venueName, setVenueName] = useState('');
  const [city, setCity] = useState('الرياض');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<EventDoc | null>(null);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || !isAuthorizedAdminUser(user)) {
        navigate('/login', { replace: true });
        return;
      }
      const verified = await verifyAdminOnServer(user);
      if (!verified.authorized) {
        await signOutAdmin();
        navigate('/login', { replace: true });
        return;
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, [navigate]);

  useEffect(() => {
    if (!authReady) return;
    const unsub = onSnapshot(
      collection(db, 'events'),
      (snap) => {
        const list: EventDoc[] = [];
        snap.forEach((d) => {
          list.push(d.data() as EventDoc);
        });
        list.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() || 0;
          const tb = b.createdAt?.toMillis?.() || 0;
          return tb - ta;
        });
        setEvents(list);
        setLoadingEvents(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'events');
      }
    );
    return () => unsub();
  }, [authReady]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!slugTouched) {
      setSlugInput(val.trim() ? createEventSlug(val) : '');
    }
  };

  const resetCreateForm = () => {
    setTitle('');
    setSlugInput('');
    setSlugTouched(false);
    setEventType('wedding');
    setHostNames('');
    setDateText('');
    setTimeText('');
    setVenueName('');
    setCity('الرياض');
    setFormError(null);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanTitle = title.trim().slice(0, FIELD_LIMITS.titleMax);
    const cleanSlug = sanitizeSlugInput(slugInput || createEventSlug(cleanTitle));

    if (cleanTitle.length < 2) {
      setFormError('يرجى إدخال اسم الحفل.');
      return;
    }
    if (cleanSlug.length < 2) {
      setFormError('يرجى إدخال رابط إنجليزي صالح للحفل.');
      return;
    }
    if (events.some((ev) => ev.slug === cleanSlug)) {
      setFormError('يوجد حفل آخر بنفس الرابط، يرجى تغييره.');
      return;
    }

    setCreating(true);
    try {
      const shareToken = generateShareToken();
      const cleanHosts = hostNames.trim().slice(0, FIELD_LIMITS.hostNamesMax);
      const cleanDate = dateText.trim().slice(0, FIELD_LIMITS.dateTextMax);
      const cleanTime = timeText.trim().slice(0, FIELD_LIMITS.timeTextMax);
      const cleanVenue = venueName.trim().slice(0, FIELD_LIMITS.venueNameMax);
      const cleanCity = city.trim().slice(0, FIELD_LIMITS.cityMax);

      const canvasDesign = createDefaultCanvasDesign({
        title: cleanTitle,
        hostNames: cleanHosts || cleanTitle,
        dateText: cleanDate,
        timeText: cleanTime,
        venueName: cleanVenue,
      });

      const batch = writeBatch(db);
      batch.set(doc(db, 'events', cleanSlug), {
        slug: cleanSlug,
        shareToken,
        title: cleanTitle,
        subtitle: EVENT_TYPE_LABELS[eventType],
        eventType,
        hostNames: cleanHosts,
        dateText: cleanDate,
        timeText: cleanTime,
        venueName: cleanVenue,
        city: cleanCity,
        mapUrl: '',
        welcomeMessage: 'نتشرف بدعوتكم لحضور مناسبتنا السعيدة',
        isActive: true,
        canvasDesign,
        ownerEmail: ADMIN_EMAIL,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'sharedReports', shareToken), {
        shareToken,
        eventSlug: cleanSlug,
        eventTitle: cleanTitle,
        dateText: cleanDate,
        venueName: cleanVenue,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      setShowCreateModal(false);
      resetCreateForm();
      navigate(`/admin/event/${cleanSlug}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `events/${cleanSlug}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteEvent = async (ev: EventDoc) => {
    setDeletingSlug(ev.slug);
    try {
      // Remove event invitations, qrTickets, shared report entries, shared report meta, and event doc
      const invSnap = await getDocs(
        query(collection(db, 'invitations'), where('eventSlug', '==', ev.slug))
      );
      const batch = writeBatch(db);
      invSnap.forEach((d) => {
        const data = d.data() as { inviteToken: string; qrToken: string };
        batch.delete(doc(db, 'invitations', data.inviteToken));
        batch.delete(doc(db, 'qrTickets', data.qrToken));
        if (ev.shareToken) {
          batch.delete(doc(db, 'sharedReports', ev.shareToken, 'entries', data.qrToken));
        }
      });
      await batch.commit();

      if (ev.shareToken) {
        await deleteDoc(doc(db, 'sharedReports', ev.shareToken)).catch(() => {});
      }
      await deleteDoc(doc(db, 'events', ev.slug));
      setConfirmDeleteEvent(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `events/${ev.slug}`);
    } finally {
      setDeletingSlug(null);
    }
  };

  if (!authReady) {
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
    <div dir="rtl" className="min-h-screen bg-[#F7F7F9] text-[#34343D]">
      {/* Header */}
      <header className="bg-white border-b border-[#E4E4EA] sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <img
              src="/assets/aistudio/nio_jpg_0e136059.jpg"
              alt="NIO"
              className="w-11 h-11 rounded-xl object-contain border border-[#E4E4EA] p-1 bg-white"
            />
            <div>
              <h1 className="font-ruqaa text-2xl font-bold text-[#34343D]">
                لوحة الحفلات | نيو
              </h1>
              <p className="text-xs text-[#6B6B76] font-mono-tabular" dir="ltr">
                {ADMIN_EMAIL}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                resetCreateForm();
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#34343D] hover:bg-[#26262E] text-white rounded-xl text-sm font-bold transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة حفل جديد</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                await signOutAdmin();
                navigate('/login', { replace: true });
              }}
              className="p-2.5 rounded-xl border border-[#E4E4EA] bg-white hover:bg-[#F7F7F9] text-[#6B6B76] hover:text-[#34343D] transition-colors cursor-pointer"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 sm:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-ruqaa text-3xl font-bold text-[#34343D]">
              الحفلات والمناسبات
            </h2>
            <p className="text-sm text-[#6B6B76] mt-1">
              اختر أي حفل لفتح صفحته المستقلة وإدارة الدعوات والتصاميم والإحصاءات
            </p>
          </div>
          <span className="px-3.5 py-1.5 bg-white border border-[#E4E4EA] rounded-xl text-xs font-bold tabular-nums">
            إجمالي الحفلات: {events.length}
          </span>
        </div>

        {loadingEvents ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-[#34343D]" />
          </div>
        ) : events.length === 0 ? (
          <div className="bg-white border border-[#E4E4EA] rounded-2xl p-12 text-center space-y-4">
            <p className="font-ruqaa text-2xl font-bold text-[#34343D]">
              لا توجد حفلات مضافة حالياً
            </p>
            <p className="text-sm text-[#6B6B76]">
              أضف أول حفل للبدء بتخصيص التصميم وإصدار الدعوات
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#34343D] text-white rounded-xl text-sm font-bold hover:bg-[#26262E] transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة حفل جديد</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {events.map((ev) => (
              <div
                key={ev.slug}
                className="bg-white border border-[#E4E4EA] rounded-2xl p-5 flex flex-col justify-between gap-5 hover:border-[#34343D]/40 transition-colors shadow-xs"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[#F7F7F9] border border-[#E4E4EA] text-[#34343D]">
                      {EVENT_TYPE_LABELS[ev.eventType] || 'مناسبة'}
                    </span>

                    <button
                      type="button"
                      onClick={() => setConfirmDeleteEvent(ev)}
                      className="p-1.5 rounded-lg text-[#6B6B76] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="حذف الحفل"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <h3 className="font-ruqaa text-2xl font-bold text-[#34343D] leading-snug">
                      {ev.title}
                    </h3>
                    <p
                      className="text-xs text-[#6B6B76] font-mono-tabular mt-1 truncate"
                      dir="ltr"
                    >
                      /admin/event/{ev.slug}
                    </p>
                  </div>

                  <div className="space-y-1.5 text-xs text-[#52525E] pt-1">
                    {ev.dateText && (
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-3.5 h-3.5 text-[#6B6B76]" />
                        <span>
                          {ev.dateText}
                          {ev.timeText ? ` • ${ev.timeText}` : ''}
                        </span>
                      </div>
                    )}
                    {ev.venueName && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-[#6B6B76]" />
                        <span>
                          {ev.venueName}
                          {ev.city ? ` - ${ev.city}` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <Link
                  to={`/admin/event/${ev.slug}`}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 bg-[#34343D] hover:bg-[#26262E] text-white rounded-xl text-sm font-bold transition-colors"
                >
                  <span>فتح صفحة الحفل</span>
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Event Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-lg bg-white border border-[#E4E4EA] rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E4E4EA]">
              <h3 className="font-ruqaa text-2xl font-bold text-[#34343D]">
                إضافة حفل جديد
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-[#6B6B76] hover:bg-[#F7F7F9] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="p-6 space-y-4">
              {formError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                  {formError}
                </p>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#34343D]">
                  اسم الحفل *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="مثال: زفاف محمد ونورة"
                  className="w-full px-3.5 py-2.5 bg-[#F7F7F9] border border-[#E4E4EA] rounded-xl text-sm focus:outline-none focus:border-[#34343D]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#34343D]">
                  الرابط المختصر للحفل (URL) *
                </label>
                <div className="flex items-center bg-[#F7F7F9] border border-[#E4E4EA] rounded-xl px-3" dir="ltr">
                  <span className="text-xs text-[#6B6B76] font-mono-tabular">
                    /admin/event/
                  </span>
                  <input
                    type="text"
                    required
                    value={slugInput}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlugInput(sanitizeSlugInput(e.target.value));
                    }}
                    placeholder="mohammed-noura"
                    className="flex-1 py-2.5 pl-1 bg-transparent text-sm font-mono-tabular focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#34343D]">
                    نوع المناسبة
                  </label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as EventType)}
                    className="w-full px-3.5 py-2.5 bg-[#F7F7F9] border border-[#E4E4EA] rounded-xl text-sm focus:outline-none focus:border-[#34343D]"
                  >
                    {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#34343D]">
                    أصحاب الحفل
                  </label>
                  <input
                    type="text"
                    value={hostNames}
                    onChange={(e) => setHostNames(e.target.value)}
                    placeholder="عائلة السالم والعتيبي"
                    className="w-full px-3.5 py-2.5 bg-[#F7F7F9] border border-[#E4E4EA] rounded-xl text-sm focus:outline-none focus:border-[#34343D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#34343D]">
                    التاريخ
                  </label>
                  <input
                    type="text"
                    value={dateText}
                    onChange={(e) => setDateText(e.target.value)}
                    placeholder="الجمعة 25 ذو القعدة"
                    className="w-full px-3.5 py-2.5 bg-[#F7F7F9] border border-[#E4E4EA] rounded-xl text-sm focus:outline-none focus:border-[#34343D]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#34343D]">
                    الوقت
                  </label>
                  <input
                    type="text"
                    value={timeText}
                    onChange={(e) => setTimeText(e.target.value)}
                    placeholder="8:30 مساءً"
                    className="w-full px-3.5 py-2.5 bg-[#F7F7F9] border border-[#E4E4EA] rounded-xl text-sm focus:outline-none focus:border-[#34343D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#34343D]">
                    القاعة / الموقع
                  </label>
                  <input
                    type="text"
                    value={venueName}
                    onChange={(e) => setVenueName(e.target.value)}
                    placeholder="قاعة الريان"
                    className="w-full px-3.5 py-2.5 bg-[#F7F7F9] border border-[#E4E4EA] rounded-xl text-sm focus:outline-none focus:border-[#34343D]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#34343D]">
                    المدينة
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="الرياض"
                    className="w-full px-3.5 py-2.5 bg-[#F7F7F9] border border-[#E4E4EA] rounded-xl text-sm focus:outline-none focus:border-[#34343D]"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#E4E4EA] text-sm font-bold text-[#6B6B76] hover:bg-[#F7F7F9] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-6 py-2.5 rounded-xl bg-[#34343D] hover:bg-[#26262E] text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>إنشاء وفتح الحفل</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteEvent && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setConfirmDeleteEvent(null)}
        >
          <div
            className="w-full max-w-sm bg-white border border-[#E4E4EA] rounded-2xl p-6 space-y-4 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-ruqaa text-2xl font-bold text-[#34343D]">
              حذف الحفل؟
            </h3>
            <p className="text-sm text-[#6B6B76]">
              سيتم حذف <strong className="text-[#34343D]">{confirmDeleteEvent.title}</strong> وجميع
              دعواته وتذاكره نهائياً.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteEvent(null)}
                className="px-4 py-2.5 rounded-xl border border-[#E4E4EA] text-sm font-bold text-[#6B6B76] hover:bg-[#F7F7F9] cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={deletingSlug === confirmDeleteEvent.slug}
                onClick={() => handleDeleteEvent(confirmDeleteEvent)}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {deletingSlug === confirmDeleteEvent.slug && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                <span>تأكيد الحذف</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
