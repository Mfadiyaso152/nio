import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  ImagePlus,
  Loader2,
  Mail,
  MessageCircle,
  Palette,
  Plus,
  QrCode,
  Save,
  Share2,
  Trash2,
  Type,
  Upload,
  UserCheck,
  UserX,
} from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  isAuthorizedAdminUser,
  OperationType,
  signOutAdmin,
  verifyAdminOnServer,
} from '../firebase';
import type {
  ArabicFontId,
  CanvasPngLayer,
  CanvasTextLayer,
  EventCanvasDesign,
  EventDoc,
  InvitationDoc,
  SharedReportEntry,
} from '../types';
import { FIELD_LIMITS } from '../types';
import {
  ARABIC_FONTS,
  compressImageToDataUrl,
  createDefaultCanvasDesign,
  downloadDataUrlPng,
  generateInviteToken,
  generateQrToken,
  generateRandomToken,
  renderInvitationPassPng,
} from '../utils/themePresets';
import { InvitationCardRenderer } from '../components/InvitationCardRenderer';
import { AppleWalletBadgeButton } from '../components/AppleWalletBadgeButton';
import { AppleWalletModal } from '../components/AppleWalletModal';

type WorkspaceTab = 'invitations' | 'design' | 'stats';
type StatsFilter = 'all' | 'attended' | 'absent' | 'duplicates';

export function AdminEventWorkspacePage() {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  const navigate = useNavigate();

  const [authReady, setAuthReady] = useState(false);
  const [eventDoc, setEventDoc] = useState<EventDoc | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('invitations');

  const [invitations, setInvitations] = useState<InvitationDoc[]>([]);
  const [reportEntries, setReportEntries] = useState<Record<string, SharedReportEntry>>({});

  // Single guest creation form
  const [guestName, setGuestName] = useState('');
  const [guestTitle, setGuestTitle] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [maxCompanions, setMaxCompanions] = useState(1);
  const [addingGuest, setAddingGuest] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadingInviteId, setDownloadingInviteId] = useState<string | null>(null);

  // Apple Wallet modal state
  const [walletTarget, setWalletTarget] = useState<{
    guestDisplay: string;
    qrToken: string;
    attendingCount: number;
  } | null>(null);

  // Design studio state
  const [draftDesign, setDraftDesign] = useState<EventCanvasDesign>(
    createDefaultCanvasDesign()
  );
  const [selectedLayer, setSelectedLayer] = useState<{
    id: string;
    kind: 'text' | 'png';
  } | null>(null);
  const [savingDesign, setSavingDesign] = useState(false);
  const [designMessage, setDesignMessage] = useState<string | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);

  // Stats tab filter & copy state
  const [statsFilter, setStatsFilter] = useState<StatsFilter>('all');
  const [copiedReport, setCopiedReport] = useState(false);

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

  // Listen to Event document
  useEffect(() => {
    if (!authReady || !eventSlug) return;
    const unsub = onSnapshot(
      doc(db, 'events', eventSlug),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as EventDoc;
          setEventDoc(data);
          setDraftDesign(data.canvasDesign || createDefaultCanvasDesign());
        } else {
          setEventDoc(null);
        }
        setLoadingEvent(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `events/${eventSlug}`);
      }
    );
    return () => unsub();
  }, [authReady, eventSlug]);

  // Listen to event invitations
  useEffect(() => {
    if (!authReady || !eventSlug) return;
    const q = query(collection(db, 'invitations'), where('eventSlug', '==', eventSlug));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: InvitationDoc[] = [];
        snap.forEach((d) => list.push(d.data() as InvitationDoc));
        list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setInvitations(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'invitations');
      }
    );
    return () => unsub();
  }, [authReady, eventSlug]);

  // Listen to live shared report entries for real-time check-in & duplicate attempts
  useEffect(() => {
    if (!authReady || !eventDoc?.shareToken) return;
    const q = query(
      collection(db, 'sharedReports', eventDoc.shareToken, 'entries'),
      where('shareToken', '==', eventDoc.shareToken)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const map: Record<string, SharedReportEntry> = {};
        snap.forEach((d) => {
          const entry = d.data() as SharedReportEntry;
          map[entry.qrToken] = entry;
        });
        setReportEntries(map);
      },
      (err) => {
        handleFirestoreError(
          err,
          OperationType.LIST,
          `sharedReports/${eventDoc.shareToken}/entries`
        );
      }
    );
    return () => unsub();
  }, [authReady, eventDoc?.shareToken]);

  const mergedGuests = useMemo(() => {
    return invitations.map((inv) => {
      const live = reportEntries[inv.qrToken];
      return {
        ...inv,
        checkedIn: live ? live.checkedIn : inv.checkedIn,
        checkedInAt: live ? live.checkedInAt : inv.checkedInAt,
        duplicateAttempts: live ? live.duplicateAttempts : inv.duplicateAttempts || 0,
        lastDuplicateAt: live ? live.lastDuplicateAt : inv.lastDuplicateAt,
        rsvpStatus: live ? live.rsvpStatus : inv.rsvpStatus,
        attendingCount: live ? live.attendingCount : inv.attendingCount,
      };
    });
  }, [invitations, reportEntries]);

  const stats = useMemo(() => {
    const total = mergedGuests.length;
    const attended = mergedGuests.filter((g) => g.checkedIn).length;
    const absent = total - attended;
    const duplicates = mergedGuests.filter((g) => (g.duplicateAttempts || 0) > 0).length;
    const confirmed = mergedGuests.filter((g) => g.rsvpStatus === 'confirmed').length;
    return { total, attended, absent, duplicates, confirmed };
  }, [mergedGuests]);

  const filteredStatsGuests = useMemo(() => {
    if (statsFilter === 'attended') return mergedGuests.filter((g) => g.checkedIn);
    if (statsFilter === 'absent') return mergedGuests.filter((g) => !g.checkedIn);
    if (statsFilter === 'duplicates')
      return mergedGuests.filter((g) => (g.duplicateAttempts || 0) > 0);
    return mergedGuests;
  }, [mergedGuests, statsFilter]);

  const copyText = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventDoc || !guestName.trim()) return;

    setAddingGuest(true);
    const inviteToken = generateInviteToken();
    const qrToken = generateQrToken();
    const cleanName = guestName.trim().slice(0, FIELD_LIMITS.guestNameMax);
    const cleanTitle = guestTitle.trim().slice(0, FIELD_LIMITS.guestTitleMax);
    const cleanPhone = guestPhone.trim().slice(0, FIELD_LIMITS.phoneMax);
    const cap = Math.max(1, Math.min(FIELD_LIMITS.maxCompanionsCap, maxCompanions || 1));
    const guestDisplay = [cleanTitle, cleanName].filter(Boolean).join(' ').slice(0, 140);

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'invitations', inviteToken), {
        inviteToken,
        qrToken,
        eventSlug: eventDoc.slug,
        shareToken: eventDoc.shareToken,
        guestName: cleanName,
        guestTitle: cleanTitle,
        phone: cleanPhone,
        groupName: '',
        maxCompanions: cap,
        attendingCount: 1,
        rsvpStatus: 'pending',
        guestNote: '',
        checkedIn: false,
        duplicateAttempts: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'qrTickets', qrToken), {
        qrToken,
        inviteToken,
        eventSlug: eventDoc.slug,
        shareToken: eventDoc.shareToken,
        guestDisplay,
        attendingCount: 1,
        rsvpStatus: 'pending',
        checkedIn: false,
        duplicateAttempts: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'sharedReports', eventDoc.shareToken, 'entries', qrToken), {
        qrToken,
        shareToken: eventDoc.shareToken,
        guestDisplay,
        groupName: '',
        maxCompanions: cap,
        attendingCount: 1,
        rsvpStatus: 'pending',
        checkedIn: false,
        duplicateAttempts: 0,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      setGuestName('');
      setGuestTitle('');
      setGuestPhone('');
      setMaxCompanions(1);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `invitations/${inviteToken}`);
    } finally {
      setAddingGuest(false);
    }
  };

  const handleDeleteInvitation = async (inv: InvitationDoc) => {
    if (!eventDoc) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'invitations', inv.inviteToken));
      batch.delete(doc(db, 'qrTickets', inv.qrToken));
      batch.delete(doc(db, 'sharedReports', eventDoc.shareToken, 'entries', inv.qrToken));
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `invitations/${inv.inviteToken}`);
    }
  };

  const handleDownloadInvitePng = async (inv: InvitationDoc) => {
    if (!eventDoc) return;
    setDownloadingInviteId(inv.inviteToken);
    try {
      const dataUrl = await renderInvitationPassPng({
        event: { ...eventDoc, canvasDesign: draftDesign },
        guestName: inv.guestName,
        guestTitle: inv.guestTitle,
        qrToken: inv.qrToken,
        includeQr: true,
      });
      downloadDataUrlPng(dataUrl, `nio-${inv.guestName}-${inv.qrToken}.png`);
    } finally {
      setDownloadingInviteId(null);
    }
  };

  // Design Studio Handlers
  const handleUploadBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setDesignError(null);
    try {
      const dataUrl = await compressImageToDataUrl(file, {
        maxWidth: 960,
        isPng: false,
        maxLength: FIELD_LIMITS.backgroundImageMax,
      });
      setDraftDesign((prev) => ({ ...prev, backgroundImage: dataUrl }));
    } catch (err) {
      setDesignError(err instanceof Error ? err.message : 'تعذر تحميل صورة الخلفية.');
    }
  };

  const handleUploadPngSticker = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setDesignError(null);

    if ((draftDesign.pngLayers?.length || 0) >= FIELD_LIMITS.pngLayersMax) {
      setDesignError(`الحد الأقصى لصور PNG هو ${FIELD_LIMITS.pngLayersMax} صور.`);
      return;
    }

    try {
      const src = await compressImageToDataUrl(file, {
        maxWidth: 500,
        isPng: true,
        maxLength: FIELD_LIMITS.pngLayerSrcMax,
      });
      const newLayer: CanvasPngLayer = {
        id: `png_${generateRandomToken(6)}`,
        src,
        x: 50,
        y: 25,
        widthPct: 35,
        opacity: 1,
      };
      setDraftDesign((prev) => ({
        ...prev,
        pngLayers: [...(prev.pngLayers || []), newLayer],
      }));
      setSelectedLayer({ id: newLayer.id, kind: 'png' });
    } catch (err) {
      setDesignError(err instanceof Error ? err.message : 'تعذر إضافة صورة PNG.');
    }
  };

  const handleAddTextLayer = () => {
    if ((draftDesign.textLayers?.length || 0) >= FIELD_LIMITS.textLayersMax) {
      setDesignError(`الحد الأقصى للنصوص هو ${FIELD_LIMITS.textLayersMax} نصوص.`);
      return;
    }
    const newLayer: CanvasTextLayer = {
      id: `txt_${generateRandomToken(6)}`,
      text: 'نص جديد',
      fontFamily: 'aref-ruqaa',
      fontSize: 26,
      color: '#34343D',
      x: 50,
      y: 50,
      bold: true,
    };
    setDraftDesign((prev) => ({
      ...prev,
      textLayers: [...(prev.textLayers || []), newLayer],
    }));
    setSelectedLayer({ id: newLayer.id, kind: 'text' });
  };

  const updateSelectedTextLayer = (patch: Partial<CanvasTextLayer>) => {
    if (!selectedLayer || selectedLayer.kind !== 'text') return;
    setDraftDesign((prev) => ({
      ...prev,
      textLayers: prev.textLayers.map((l) =>
        l.id === selectedLayer.id ? { ...l, ...patch } : l
      ),
    }));
  };

  const updateSelectedPngLayer = (patch: Partial<CanvasPngLayer>) => {
    if (!selectedLayer || selectedLayer.kind !== 'png') return;
    setDraftDesign((prev) => ({
      ...prev,
      pngLayers: prev.pngLayers.map((l) =>
        l.id === selectedLayer.id ? { ...l, ...patch } : l
      ),
    }));
  };

  const deleteSelectedLayer = () => {
    if (!selectedLayer) return;
    if (selectedLayer.kind === 'text') {
      setDraftDesign((prev) => ({
        ...prev,
        textLayers: prev.textLayers.filter((l) => l.id !== selectedLayer.id),
      }));
    } else {
      setDraftDesign((prev) => ({
        ...prev,
        pngLayers: prev.pngLayers.filter((l) => l.id !== selectedLayer.id),
      }));
    }
    setSelectedLayer(null);
  };

  const handleMoveLayer = (id: string, kind: 'text' | 'png', x: number, y: number) => {
    if (kind === 'text') {
      setDraftDesign((prev) => ({
        ...prev,
        textLayers: prev.textLayers.map((l) => (l.id === id ? { ...l, x, y } : l)),
      }));
    } else {
      setDraftDesign((prev) => ({
        ...prev,
        pngLayers: prev.pngLayers.map((l) => (l.id === id ? { ...l, x, y } : l)),
      }));
    }
  };

  const handleSaveDesign = async () => {
    if (!eventDoc) return;
    setSavingDesign(true);
    setDesignMessage(null);
    setDesignError(null);

    const approxSize = JSON.stringify(draftDesign).length;
    if (approxSize > 850000) {
      setDesignError('إجمالي حجم الخلفية والصور يتجاوز الحد المسموح، قلل من الصور أو اختر صورة أصغر.');
      setSavingDesign(false);
      return;
    }

    try {
      await updateDoc(doc(db, 'events', eventDoc.slug), {
        canvasDesign: draftDesign,
        updatedAt: serverTimestamp(),
      });
      setDesignMessage('تم حفظ التصميم بنجاح وسيظهر فوراً في جميع روابط الدعوات.');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `events/${eventDoc.slug}`);
    } finally {
      setSavingDesign(false);
    }
  };

  const activeTextLayer =
    selectedLayer?.kind === 'text'
      ? draftDesign.textLayers.find((l) => l.id === selectedLayer.id) || null
      : null;

  const activePngLayer =
    selectedLayer?.kind === 'png'
      ? draftDesign.pngLayers.find((l) => l.id === selectedLayer.id) || null
      : null;

  if (!authReady || loadingEvent) {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-[#F7F7F9] flex items-center justify-center text-[#34343D]"
      >
        <Loader2 className="w-7 h-7 animate-spin" />
      </div>
    );
  }

  if (!eventDoc) {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-[#F7F7F9] text-[#34343D] flex flex-col items-center justify-center p-6 text-center space-y-4"
      >
        <h2 className="font-ruqaa text-3xl font-bold">الحفل غير موجود</h2>
        <Link
          to="/admin"
          className="px-5 py-2.5 bg-[#34343D] text-white rounded-xl text-sm font-bold"
        >
          العودة لقائمة الحفلات
        </Link>
      </div>
    );
  }

  const shareReportUrl = `${window.location.origin}/report/${eventDoc.shareToken}`;

  return (
    <div dir="rtl" className="min-h-screen bg-[#F7F7F9] text-[#34343D]">
      {/* Workspace Header */}
      <header className="bg-white border-b border-[#E4E4EA] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/admin"
              className="p-2 rounded-xl border border-[#E4E4EA] bg-[#F7F7F9] hover:bg-[#ECECF2] text-[#34343D] transition-colors"
              title="العودة للحفلات"
            >
              <ArrowRight className="w-4 h-4" />
            </Link>
            <img
              src="/assets/aistudio/nio_jpg_0e136059.jpg"
              alt="NIO"
              className="w-10 h-10 rounded-xl object-contain border border-[#E4E4EA] p-0.5 bg-white"
            />
            <div>
              <h1 className="font-ruqaa text-2xl font-bold text-[#34343D] leading-tight">
                {eventDoc.title}
              </h1>
              <p className="text-xs text-[#6B6B76] font-mono-tabular" dir="ltr">
                /admin/event/{eventDoc.slug}
              </p>
            </div>
          </div>

          {/* 3 Main Tabs */}
          <nav className="flex items-center gap-1.5 bg-[#F7F7F9] p-1 rounded-xl border border-[#E4E4EA]">
            <button
              type="button"
              onClick={() => setActiveTab('invitations')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                activeTab === 'invitations'
                  ? 'bg-[#34343D] text-white shadow-xs'
                  : 'text-[#6B6B76] hover:text-[#34343D]'
              }`}
            >
              <Mail className="w-4 h-4" />
              <span>الدعوات</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('design')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                activeTab === 'design'
                  ? 'bg-[#34343D] text-white shadow-xs'
                  : 'text-[#6B6B76] hover:text-[#34343D]'
              }`}
            >
              <Palette className="w-4 h-4" />
              <span>التصاميم</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('stats')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                activeTab === 'stats'
                  ? 'bg-[#34343D] text-white shadow-xs'
                  : 'text-[#6B6B76] hover:text-[#34343D]'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>الإحصاءات</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-7">
        {/* TAB 1: INVITATIONS */}
        {activeTab === 'invitations' && (
          <div className="space-y-6">
            {/* Add Single Person Invitation Form */}
            <form
              onSubmit={handleAddInvitation}
              className="bg-white border border-[#E4E4EA] rounded-2xl p-6 space-y-4 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-ruqaa text-2xl font-bold text-[#34343D]">
                    إضافة دعوة لشخص
                  </h2>
                  <p className="text-xs text-[#6B6B76] mt-0.5">
                    يتم توليد رابط دعوة خاص وباركود مستقل وبطاقة Apple Wallet لكل مدعو
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="lg:col-span-2">
                  <label className="block text-xs font-bold mb-1">اسم المدعو *</label>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="مثال: أحمد بن عبدالله السالم"
                    className="w-full px-3.5 py-2.5 bg-[#F7F7F9] border border-[#E4E4EA] rounded-xl text-sm focus:outline-none focus:border-[#34343D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">اللقب (اختياري)</label>
                  <input
                    type="text"
                    value={guestTitle}
                    onChange={(e) => setGuestTitle(e.target.value)}
                    placeholder="الأستاذ / الشيخ"
                    className="w-full px-3.5 py-2.5 bg-[#F7F7F9] border border-[#E4E4EA] rounded-xl text-sm focus:outline-none focus:border-[#34343D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">رقم الجوال</label>
                  <input
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="05xxxxxxxx"
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 bg-[#F7F7F9] border border-[#E4E4EA] rounded-xl text-sm focus:outline-none focus:border-[#34343D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">عدد الأشخاص</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxCompanions}
                    onChange={(e) => setMaxCompanions(Number(e.target.value) || 1)}
                    className="w-full px-3.5 py-2.5 bg-[#F7F7F9] border border-[#E4E4EA] rounded-xl text-sm tabular-nums focus:outline-none focus:border-[#34343D]"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={addingGuest}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#34343D] hover:bg-[#26262E] text-white rounded-xl text-sm font-bold transition-colors cursor-pointer disabled:opacity-60"
                >
                  {addingGuest ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  <span>إصدار الدعوة والرابط</span>
                </button>
              </div>
            </form>

            {/* Invitations List */}
            <div className="bg-white border border-[#E4E4EA] rounded-2xl overflow-hidden shadow-xs">
              <div className="px-6 py-4 border-b border-[#E4E4EA] flex items-center justify-between">
                <h3 className="font-ruqaa text-xl font-bold text-[#34343D]">
                  قائمة الدعوات ({mergedGuests.length})
                </h3>
              </div>

              {mergedGuests.length === 0 ? (
                <div className="p-10 text-center text-sm text-[#6B6B76]">
                  لم يتم إضافة أي مدعو حتى الآن. أضف أول ضيف من النموذج أعلاه.
                </div>
              ) : (
                <div className="divide-y divide-[#E4E4EA]">
                  {mergedGuests.map((inv) => {
                    const inviteUrl = `${window.location.origin}/invite/${inv.inviteToken}`;
                    const guestDisplay = [inv.guestTitle, inv.guestName]
                      .filter(Boolean)
                      .join(' ');
                    const waLink = `https://wa.me/${inv.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                      `حياكم الله ${guestDisplay}، يسعدنا دعوتكم لحضور ${eventDoc.title}.\nرابط الدعوة وتذكرة الدخول:\n${inviteUrl}`
                    )}`;

                    return (
                      <div
                        key={inv.inviteToken}
                        className="p-4 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-[#F7F7F9]/60 transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-ruqaa text-xl font-bold text-[#34343D]">
                              {guestDisplay}
                            </p>

                            {inv.checkedIn ? (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                                تم الدخول
                              </span>
                            ) : inv.rsvpStatus === 'confirmed' ? (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                                أكد الحضور
                              </span>
                            ) : inv.rsvpStatus === 'declined' ? (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200">
                                اعتذر
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#F7F7F9] text-[#6B6B76] border border-[#E4E4EA]">
                                بانتظار الرد
                              </span>
                            )}

                            {(inv.duplicateAttempts || 0) > 0 && (
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                                محاولة تكرار ({inv.duplicateAttempts})
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-[#6B6B76] font-mono-tabular">
                            <span dir="ltr">{inv.qrToken}</span>
                            <span>•</span>
                            <span dir="ltr">/invite/{inv.inviteToken.slice(0, 14)}...</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => copyText(inviteUrl, inv.inviteToken)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F7F7F9] hover:bg-[#ECECF2] border border-[#E4E4EA] text-xs font-bold text-[#34343D] cursor-pointer"
                          >
                            {copiedId === inv.inviteToken ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span>تم النسخ</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>نسخ الرابط</span>
                              </>
                            )}
                          </button>

                          <a
                            href={`/invite/${inv.inviteToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F7F7F9] hover:bg-[#ECECF2] border border-[#E4E4EA] text-xs font-bold text-[#34343D]"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>فتح الدعوة</span>
                          </a>

                          <AppleWalletBadgeButton
                            compact
                            onClick={() =>
                              setWalletTarget({
                                guestDisplay,
                                qrToken: inv.qrToken,
                                attendingCount: inv.attendingCount || 1,
                              })
                            }
                          />

                          <button
                            type="button"
                            onClick={() => handleDownloadInvitePng(inv)}
                            disabled={downloadingInviteId === inv.inviteToken}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#34343D] hover:bg-[#26262E] text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                          >
                            {downloadingInviteId === inv.inviteToken ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                            <span>PNG</span>
                          </button>

                          {inv.phone && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>واتساب</span>
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteInvitation(inv)}
                            className="p-2 rounded-xl text-[#6B6B76] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="حذف الدعوة"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: FREEFORM DESIGN STUDIO */}
        {activeTab === 'design' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Controls Column */}
            <div className="lg:col-span-7 bg-white border border-[#E4E4EA] rounded-2xl p-6 space-y-6 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E4EA] pb-4">
                <div>
                  <h2 className="font-ruqaa text-2xl font-bold text-[#34343D]">
                    استوديو التصميم الحر
                  </h2>
                  <p className="text-xs text-[#6B6B76]">
                    ارفق أي خلفية، أضف نصوصاً بجميع الخطوط ومنها خط الرقعة، وأضف صور PNG فوق التصميم
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSaveDesign}
                  disabled={savingDesign}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#34343D] hover:bg-[#26262E] text-white rounded-xl text-sm font-bold transition-colors cursor-pointer disabled:opacity-60"
                >
                  {savingDesign ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>حفظ التصميم</span>
                </button>
              </div>

              {designMessage && (
                <p className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  {designMessage}
                </p>
              )}
              {designError && (
                <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                  {designError}
                </p>
              )}

              {/* Step 1: Background Image & Color */}
              <div className="space-y-3 bg-[#F7F7F9] border border-[#E4E4EA] rounded-2xl p-4">
                <h3 className="font-ruqaa text-lg font-bold text-[#34343D]">
                  1. خلفية الدعوة
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#34343D] hover:bg-[#26262E] text-white rounded-xl text-xs font-bold cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>إرفاق صورة خلفية</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadBackground}
                      className="hidden"
                    />
                  </label>

                  {draftDesign.backgroundImage && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraftDesign((prev) => ({ ...prev, backgroundImage: '' }))
                      }
                      className="px-3 py-2 bg-white border border-[#E4E4EA] text-red-600 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      إزالة الخلفية
                    </button>
                  )}

                  <div className="flex items-center gap-2 mr-auto">
                    <span className="text-xs font-bold text-[#6B6B76]">لون الخلفية:</span>
                    <input
                      type="color"
                      value={draftDesign.backgroundColor}
                      onChange={(e) =>
                        setDraftDesign((prev) => ({
                          ...prev,
                          backgroundColor: e.target.value,
                        }))
                      }
                      className="w-9 h-9 rounded-lg border border-[#E4E4EA] cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Step 2: Add Text or PNG Layers */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleAddTextLayer}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-[#F7F7F9] border border-[#34343D] text-[#34343D] rounded-xl text-xs font-bold cursor-pointer"
                >
                  <Type className="w-4 h-4" />
                  <span>+ إضافة نص فوق الخلفية</span>
                </button>

                <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-[#F7F7F9] border border-[#34343D] text-[#34343D] rounded-xl text-xs font-bold cursor-pointer">
                  <ImagePlus className="w-4 h-4" />
                  <span>+ إضافة صورة PNG</span>
                  <input
                    type="file"
                    accept="image/png,image/webp,image/*"
                    onChange={handleUploadPngSticker}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Layers Quick Selector */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-[#6B6B76]">
                  الطبقات المضافة (اضغط على أي عنصر أو اسحبه مباشرة في المعاينة):
                </p>
                <div className="flex flex-wrap gap-2">
                  {draftDesign.textLayers.map((layer) => (
                    <button
                      key={layer.id}
                      type="button"
                      onClick={() => setSelectedLayer({ id: layer.id, kind: 'text' })}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        selectedLayer?.id === layer.id
                          ? 'bg-[#34343D] text-white border-[#34343D]'
                          : 'bg-[#F7F7F9] text-[#34343D] border-[#E4E4EA]'
                      }`}
                    >
                      نص: {layer.text.slice(0, 18)}
                    </button>
                  ))}

                  {draftDesign.pngLayers.map((png, idx) => (
                    <button
                      key={png.id}
                      type="button"
                      onClick={() => setSelectedLayer({ id: png.id, kind: 'png' })}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        selectedLayer?.id === png.id
                          ? 'bg-[#34343D] text-white border-[#34343D]'
                          : 'bg-[#F7F7F9] text-[#34343D] border-[#E4E4EA]'
                      }`}
                    >
                      PNG #{idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Text Layer Inspector */}
              {activeTextLayer && (
                <div className="bg-[#F7F7F9] border border-[#E4E4EA] rounded-2xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-ruqaa text-lg font-bold">تعديل النص المحدد</h4>
                    <button
                      type="button"
                      onClick={deleteSelectedLayer}
                      className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف النص</span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold">المحتوى</label>
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedTextLayer({
                            text: `${activeTextLayer.text} {اسم_المدعو}`.trim(),
                          })
                        }
                        className="text-[11px] font-bold text-[#34343D] underline cursor-pointer"
                      >
                        إدراج {'{اسم_المدعو}'} تلقائياً
                      </button>
                    </div>
                    <input
                      type="text"
                      value={activeTextLayer.text}
                      onChange={(e) => updateSelectedTextLayer({ text: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-[#E4E4EA] rounded-xl text-sm focus:outline-none focus:border-[#34343D]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">نوع الخط</label>
                      <select
                        value={activeTextLayer.fontFamily}
                        onChange={(e) =>
                          updateSelectedTextLayer({
                            fontFamily: e.target.value as ArabicFontId,
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-[#E4E4EA] rounded-xl text-xs font-bold"
                      >
                        {ARABIC_FONTS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold mb-1">
                        الحجم ({activeTextLayer.fontSize}px)
                      </label>
                      <input
                        type="range"
                        min={12}
                        max={64}
                        value={activeTextLayer.fontSize}
                        onChange={(e) =>
                          updateSelectedTextLayer({ fontSize: Number(e.target.value) })
                        }
                        className="w-full accent-[#34343D]"
                      />
                    </div>

                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <label className="block text-xs font-bold mb-1">اللون</label>
                        <input
                          type="color"
                          value={activeTextLayer.color}
                          onChange={(e) =>
                            updateSelectedTextLayer({ color: e.target.value })
                          }
                          className="w-10 h-9 rounded-lg border border-[#E4E4EA] cursor-pointer"
                        />
                      </div>

                      <label className="inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer pb-2">
                        <input
                          type="checkbox"
                          checked={activeTextLayer.bold}
                          onChange={(e) =>
                            updateSelectedTextLayer({ bold: e.target.checked })
                          }
                          className="accent-[#34343D]"
                        />
                        <span>عريض</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">
                        الموضع الأفقي ({activeTextLayer.x}%)
                      </label>
                      <input
                        type="range"
                        min={5}
                        max={95}
                        value={activeTextLayer.x}
                        onChange={(e) =>
                          updateSelectedTextLayer({ x: Number(e.target.value) })
                        }
                        className="w-full accent-[#34343D]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">
                        الموضع العمودي ({activeTextLayer.y}%)
                      </label>
                      <input
                        type="range"
                        min={5}
                        max={95}
                        value={activeTextLayer.y}
                        onChange={(e) =>
                          updateSelectedTextLayer({ y: Number(e.target.value) })
                        }
                        className="w-full accent-[#34343D]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Active PNG Layer Inspector */}
              {activePngLayer && (
                <div className="bg-[#F7F7F9] border border-[#E4E4EA] rounded-2xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-ruqaa text-lg font-bold">تعديل صورة PNG المحددة</h4>
                    <button
                      type="button"
                      onClick={deleteSelectedLayer}
                      className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف الصورة</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">
                        العرض ({activePngLayer.widthPct}%)
                      </label>
                      <input
                        type="range"
                        min={10}
                        max={95}
                        value={activePngLayer.widthPct}
                        onChange={(e) =>
                          updateSelectedPngLayer({ widthPct: Number(e.target.value) })
                        }
                        className="w-full accent-[#34343D]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold mb-1">
                        الشفافية ({Math.round(activePngLayer.opacity * 100)}%)
                      </label>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={activePngLayer.opacity}
                        onChange={(e) =>
                          updateSelectedPngLayer({ opacity: Number(e.target.value) })
                        }
                        className="w-full accent-[#34343D]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold mb-1">
                        الموضع الأفقي ({activePngLayer.x}%)
                      </label>
                      <input
                        type="range"
                        min={5}
                        max={95}
                        value={activePngLayer.x}
                        onChange={(e) =>
                          updateSelectedPngLayer({ x: Number(e.target.value) })
                        }
                        className="w-full accent-[#34343D]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold mb-1">
                        الموضع العمودي ({activePngLayer.y}%)
                      </label>
                      <input
                        type="range"
                        min={5}
                        max={95}
                        value={activePngLayer.y}
                        onChange={(e) =>
                          updateSelectedPngLayer({ y: Number(e.target.value) })
                        }
                        className="w-full accent-[#34343D]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Live Draggable Preview Column */}
            <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-3">
              <p className="text-xs font-bold text-[#6B6B76] text-center">
                معاينة مباشرة (يمكنك سحب النصوص والصور لتغيير مكانها)
              </p>
              <InvitationCardRenderer
                design={draftDesign}
                editable
                selectedLayerId={selectedLayer?.id || null}
                onSelectLayer={(id, kind) =>
                  setSelectedLayer(id ? { id, kind } : null)
                }
                onMoveLayer={handleMoveLayer}
              />
            </div>
          </div>
        )}

        {/* TAB 3: STATISTICS & HOST SHARE LINK */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            {/* Share Link Banner for Event Host */}
            <div className="bg-white border border-[#E4E4EA] rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-[#34343D]" />
                  <h2 className="font-ruqaa text-2xl font-bold text-[#34343D]">
                    مشاركة الإحصاءات مع صاحب الحفل
                  </h2>
                </div>
                <p className="text-xs text-[#6B6B76]">
                  يعرض هذا الرابط لصاحب الحفل أسماء الحاضرين ومن لم يحضر ومحاولات تكرار الباركود بشكل مباشر
                </p>
                <p className="text-xs font-mono-tabular text-[#34343D] pt-1" dir="ltr">
                  {shareReportUrl}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareReportUrl);
                    setCopiedReport(true);
                    setTimeout(() => setCopiedReport(false), 2000);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#34343D] hover:bg-[#26262E] text-white rounded-xl text-sm font-bold cursor-pointer"
                >
                  {copiedReport ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>تم نسخ رابط المشاركة</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4" />
                      <span>مشاركة ونسخ الرابط</span>
                    </>
                  )}
                </button>

                <a
                  href={`/report/${eventDoc.shareToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#F7F7F9] hover:bg-[#ECECF2] border border-[#E4E4EA] text-[#34343D] rounded-xl text-sm font-bold"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>فتح صفحة التقرير</span>
                </a>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-[#E4E4EA] rounded-2xl p-5 space-y-1">
                <div className="flex items-center justify-between text-[#6B6B76]">
                  <span className="text-xs font-bold">إجمالي الدعوات</span>
                  <QrCode className="w-4 h-4" />
                </div>
                <p className="text-3xl font-extrabold tabular-nums text-[#34343D]">
                  {stats.total}
                </p>
              </div>

              <div className="bg-white border border-[#E4E4EA] rounded-2xl p-5 space-y-1">
                <div className="flex items-center justify-between text-emerald-700">
                  <span className="text-xs font-bold">تم حضورهم</span>
                  <UserCheck className="w-4 h-4" />
                </div>
                <p className="text-3xl font-extrabold tabular-nums text-emerald-700">
                  {stats.attended}
                </p>
              </div>

              <div className="bg-white border border-[#E4E4EA] rounded-2xl p-5 space-y-1">
                <div className="flex items-center justify-between text-[#6B6B76]">
                  <span className="text-xs font-bold">لم يحضروا بعد</span>
                  <UserX className="w-4 h-4" />
                </div>
                <p className="text-3xl font-extrabold tabular-nums text-[#34343D]">
                  {stats.absent}
                </p>
              </div>

              <div className="bg-white border border-[#E4E4EA] rounded-2xl p-5 space-y-1">
                <div className="flex items-center justify-between text-amber-700">
                  <span className="text-xs font-bold">محاولات تكرار الباركود</span>
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <p className="text-3xl font-extrabold tabular-nums text-amber-700">
                  {stats.duplicates}
                </p>
              </div>
            </div>

            {/* Filterable Breakdown List */}
            <div className="bg-white border border-[#E4E4EA] rounded-2xl overflow-hidden shadow-xs">
              <div className="px-6 py-4 border-b border-[#E4E4EA] flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-ruqaa text-xl font-bold text-[#34343D]">
                  تفاصيل الحضور والتكرار
                </h3>

                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['all', `الكل (${stats.total})`],
                      ['attended', `حضر (${stats.attended})`],
                      ['absent', `لم يحضر (${stats.absent})`],
                      ['duplicates', `تكرار الباركود (${stats.duplicates})`],
                    ] as [StatsFilter, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setStatsFilter(id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                        statsFilter === id
                          ? 'bg-[#34343D] text-white'
                          : 'bg-[#F7F7F9] text-[#6B6B76] hover:text-[#34343D]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredStatsGuests.length === 0 ? (
                <div className="p-10 text-center text-sm text-[#6B6B76]">
                  لا توجد بيانات مطابقة لهذا التصنيف.
                </div>
              ) : (
                <div className="divide-y divide-[#E4E4EA]">
                  {filteredStatsGuests.map((g) => {
                    const guestDisplay = [g.guestTitle, g.guestName].filter(Boolean).join(' ');
                    return (
                      <div
                        key={g.inviteToken}
                        className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div>
                          <p className="font-ruqaa text-xl font-bold text-[#34343D]">
                            {guestDisplay}
                          </p>
                          <p className="text-xs text-[#6B6B76] font-mono-tabular" dir="ltr">
                            {g.qrToken}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {g.checkedIn ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>حضر</span>
                            </span>
                          ) : (
                            <span className="text-xs font-bold px-3 py-1 rounded-lg bg-[#F7F7F9] text-[#6B6B76] border border-[#E4E4EA]">
                              لم يحضر
                            </span>
                          )}

                          {(g.duplicateAttempts || 0) > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>حاول تكرار الباركود ({g.duplicateAttempts})</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {walletTarget && (
        <AppleWalletModal
          open
          onClose={() => setWalletTarget(null)}
          event={eventDoc}
          guestDisplay={walletTarget.guestDisplay}
          qrToken={walletTarget.qrToken}
          attendingCount={walletTarget.attendingCount}
        />
      )}
    </div>
  );
}
