import type { Timestamp } from 'firebase/firestore';

export type EventType = 'wedding' | 'engagement' | 'graduation' | 'reception' | 'private';

export type ArabicFontId =
  | 'aref-ruqaa'
  | 'amiri'
  | 'cairo'
  | 'tajawal'
  | 'reem-kufi'
  | 'scheherazade';

export type RsvpStatus = 'pending' | 'confirmed' | 'declined';

export interface CanvasTextLayer {
  id: string;
  text: string;
  fontFamily: ArabicFontId;
  fontSize: number;
  color: string;
  x: number;
  y: number;
  bold: boolean;
}

export interface CanvasPngLayer {
  id: string;
  src: string;
  x: number;
  y: number;
  widthPct: number;
  opacity: number;
}

export interface EventCanvasDesign {
  backgroundImage: string;
  backgroundColor: string;
  accentColor: string;
  textColor: string;
  fontFamily: ArabicFontId;
  textLayers: CanvasTextLayer[];
  pngLayers: CanvasPngLayer[];
}

export interface EventDoc {
  slug: string;
  shareToken: string;
  title: string;
  subtitle: string;
  eventType: EventType;
  hostNames: string;
  dateText: string;
  timeText: string;
  venueName: string;
  city: string;
  mapUrl: string;
  welcomeMessage: string;
  isActive: boolean;
  canvasDesign: EventCanvasDesign;
  ownerEmail: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface InvitationDoc {
  inviteToken: string;
  qrToken: string;
  eventSlug: string;
  shareToken: string;
  guestName: string;
  guestTitle: string;
  phone: string;
  groupName: string;
  maxCompanions: number;
  attendingCount: number;
  rsvpStatus: RsvpStatus;
  guestNote: string;
  checkedIn: boolean;
  checkedInAt?: Timestamp | null;
  duplicateAttempts: number;
  lastDuplicateAt?: Timestamp | null;
  rsvpAt?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface QrTicketDoc {
  qrToken: string;
  inviteToken: string;
  eventSlug: string;
  shareToken: string;
  guestDisplay: string;
  attendingCount: number;
  rsvpStatus: RsvpStatus;
  checkedIn: boolean;
  checkedInAt?: Timestamp | null;
  duplicateAttempts: number;
  lastDuplicateAt?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SharedReportMeta {
  shareToken: string;
  eventSlug: string;
  eventTitle: string;
  dateText: string;
  venueName: string;
  updatedAt?: Timestamp;
}

export interface SharedReportEntry {
  qrToken: string;
  shareToken: string;
  guestDisplay: string;
  groupName: string;
  maxCompanions: number;
  attendingCount: number;
  rsvpStatus: RsvpStatus;
  checkedIn: boolean;
  checkedInAt?: Timestamp | null;
  duplicateAttempts: number;
  lastDuplicateAt?: Timestamp | null;
  updatedAt?: Timestamp;
}

export interface WalletIntegrationStatus {
  apple: boolean;
  google: boolean;
  samsung: boolean;
}

export const FIELD_LIMITS = {
  slugMax: 64,
  shareTokenMax: 64,
  titleMax: 120,
  subtitleMax: 180,
  hostNamesMax: 120,
  dateTextMax: 80,
  timeTextMax: 60,
  venueNameMax: 120,
  cityMax: 60,
  mapUrlMax: 300,
  welcomeMessageMax: 600,
  guestNameMax: 120,
  guestTitleMax: 60,
  phoneMax: 30,
  groupNameMax: 60,
  guestNoteMax: 300,
  maxCompanionsCap: 20,
  textLayersMax: 20,
  pngLayersMax: 10,
  textLayerContentMax: 300,
  backgroundImageMax: 450000,
  pngLayerSrcMax: 300000,
} as const;
