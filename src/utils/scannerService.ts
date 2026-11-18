import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  EventDoc,
  InvitationDoc,
  QrTicketDoc,
  ScanLogDoc,
  SharedReportDoc,
} from '../types';
import { generateScanId, parseQrPayload } from './themePresets';

export interface GateScanOutcome {
  code: 'admitted' | 'duplicate' | 'invalid';
  headline: 'تم' | 'EROOR' | 'محاولة استخدام الرمز مره اخرى';
  guestName?: string;
  eventTitle?: string;
  attendingCount?: number;
  qrToken?: string;
}

/**
 * Atomic single-use barcode verification used by the homepage scanner.
 * Returns exact requested messages:
 * - "تم" on first valid admission
 * - "محاولة استخدام الرمز مره اخرى" on duplicate scan
 * - "EROOR" on unknown or malformed QR token
 */
export async function performAtomicGateScan(
  rawInput: string,
  scannedByEmail = 'gate-scanner'
): Promise<GateScanOutcome> {
  const parsed = parseQrPayload(rawInput);
  if (!parsed.validFormat) {
    return {
      code: 'invalid',
      headline: 'EROOR',
    };
  }

  const qrToken = parsed.qrToken;
  const qrRef = doc(db, 'qrTickets', qrToken);
  const scanId = generateScanId();

  let txResult: {
    outcome: 'admitted' | 'duplicate' | 'invalid';
    qrTicket?: QrTicketDoc;
    guestName?: string;
    attendingCount?: number;
  };

  try {
    txResult = await runTransaction(db, async (tx) => {
      const qrSnap = await tx.get(qrRef);
      if (!qrSnap.exists()) {
        return { outcome: 'invalid' };
      }

      const qrTicket = qrSnap.data() as QrTicketDoc;
      const invRef = doc(db, 'invitations', qrTicket.inviteToken);
      const invSnap = await tx.get(invRef);
      const inv = invSnap.exists() ? (invSnap.data() as InvitationDoc) : null;
      const guestName = inv
        ? [inv.guestTitle, inv.guestName].filter(Boolean).join(' ')
        : 'ضيف مدعو';
      const attendingCount = inv?.attendingCount || inv?.maxCompanions || 1;

      if (qrTicket.checkedIn) {
        return {
          outcome: 'duplicate',
          qrTicket,
          guestName,
          attendingCount,
        };
      }

      tx.update(qrRef, {
        checkedIn: true,
        checkedInAt: serverTimestamp(),
        lastScanId: scanId,
        updatedAt: serverTimestamp(),
      });

      if (invSnap.exists() && !inv?.checkedIn) {
        tx.update(invRef, {
          checkedIn: true,
          checkedInAt: serverTimestamp(),
          lastScanId: scanId,
          updatedAt: serverTimestamp(),
        });
      }

      return {
        outcome: 'admitted',
        qrTicket,
        guestName,
        attendingCount,
      };
    });
  } catch (err) {
    console.error('Gate transaction error:', err);
    return {
      code: 'invalid',
      headline: 'EROOR',
    };
  }

  if (txResult.outcome === 'invalid' || !txResult.qrTicket) {
    return {
      code: 'invalid',
      headline: 'EROOR',
    };
  }

  const { qrTicket } = txResult;
  const guestName = txResult.guestName || 'ضيف مدعو';
  const attendingCount = txResult.attendingCount || 1;

  // Record audit log (admitted or duplicate)
  try {
    await setDoc(doc(db, 'scanLogs', scanId), {
      scanId,
      eventSlug: qrTicket.eventSlug,
      qrToken: qrTicket.qrToken,
      inviteToken: qrTicket.inviteToken,
      guestName,
      attendingCount,
      result: txResult.outcome,
      scannedByEmail,
      scannedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Scan log write skipped:', err);
  }

  // Load event metadata & update shared host report if available
  let eventTitle: string | undefined;
  try {
    const eventSnap = await getDoc(doc(db, 'events', qrTicket.eventSlug));
    if (eventSnap.exists()) {
      const eventDoc = eventSnap.data() as EventDoc;
      eventTitle = eventDoc.title;

      if (eventDoc.shareToken) {
        const reportRef = doc(db, 'sharedReports', eventDoc.shareToken);
        const reportSnap = await getDoc(reportRef);
        if (reportSnap.exists()) {
          const report = reportSnap.data() as SharedReportDoc;
          const nowIso = new Date().toISOString();

          if (txResult.outcome === 'admitted') {
            const alreadyListed = report.checkedInGuests.some(
              (g) => g.guestName === guestName
            );
            const nextCheckedIn = alreadyListed
              ? report.checkedInGuests
              : [
                  {
                    guestName,
                    attendingCount,
                    checkedInAtIso: nowIso,
                  },
                  ...report.checkedInGuests,
                ];
            const nextPending = report.notCheckedInGuests.filter(
              (g) => g.guestName !== guestName
            );
            await updateDoc(reportRef, {
              checkedInGuests: nextCheckedIn.slice(0, 500),
              notCheckedInGuests: nextPending.slice(0, 500),
              duplicateScans: report.duplicateScans,
              updatedAt: serverTimestamp(),
            });
          } else if (txResult.outcome === 'duplicate') {
            const nextDuplicates = [
              {
                guestName,
                qrToken: qrTicket.qrToken,
                scannedAtIso: nowIso,
              },
              ...report.duplicateScans,
            ];
            await updateDoc(reportRef, {
              checkedInGuests: report.checkedInGuests,
              notCheckedInGuests: report.notCheckedInGuests,
              duplicateScans: nextDuplicates.slice(0, 300),
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('Shared report sync skipped:', err);
  }

  if (txResult.outcome === 'duplicate') {
    return {
      code: 'duplicate',
      headline: 'محاولة استخدام الرمز مره اخرى',
      guestName,
      eventTitle,
      attendingCount,
      qrToken: qrTicket.qrToken,
    };
  }

  return {
    code: 'admitted',
    headline: 'تم',
    guestName,
    eventTitle,
    attendingCount,
    qrToken: qrTicket.qrToken,
  };
}

/** Synchronize shared host report document from admin statistics view */
export async function syncSharedReportForEvent(
  event: EventDoc,
  invitations: InvitationDoc[],
  scanLogs: ScanLogDoc[]
): Promise<string> {
  const checkedInGuests = invitations
    .filter((inv) => inv.checkedIn)
    .map((inv) => ({
      guestName: [inv.guestTitle, inv.guestName].filter(Boolean).join(' '),
      attendingCount: inv.attendingCount || inv.maxCompanions || 1,
      checkedInAtIso: inv.checkedInAt?.toDate
        ? inv.checkedInAt.toDate().toISOString()
        : new Date().toISOString(),
    }))
    .slice(0, 500);

  const notCheckedInGuests = invitations
    .filter((inv) => !inv.checkedIn)
    .map((inv) => ({
      guestName: [inv.guestTitle, inv.guestName].filter(Boolean).join(' '),
      rsvpStatus: inv.rsvpStatus,
      maxCompanions: inv.maxCompanions,
    }))
    .slice(0, 500);

  const duplicateScans = scanLogs
    .filter((log) => log.result === 'duplicate')
    .map((log) => ({
      guestName: log.guestName,
      qrToken: log.qrToken,
      scannedAtIso: log.scannedAt?.toDate
        ? log.scannedAt.toDate().toISOString()
        : new Date().toISOString(),
    }))
    .slice(0, 300);

  const payload = {
    shareToken: event.shareToken,
    eventSlug: event.slug,
    eventTitle: event.title,
    dateText: event.dateText,
    venueName: event.venueName,
    totalInvited: invitations.length,
    checkedInGuests,
    notCheckedInGuests,
    duplicateScans,
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'sharedReports', event.shareToken), payload);
  return `${window.location.origin}/report/${event.shareToken}`;
}
