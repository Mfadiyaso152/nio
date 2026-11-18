import QRCode from 'qrcode';
import type {
  ArabicFontId,
  CanvasTextLayer,
  EventCanvasDesign,
  EventDoc,
  EventType,
} from '../types';

export const NIO_COLORS = {
  ink: '#34343D',
  inkHover: '#26262E',
  surface: '#FFFFFF',
  canvas: '#F7F7F9',
  border: '#E4E4EA',
  muted: '#6B6B76',
} as const;

export const NIO_WHATSAPP_NUMBER = '966536894854';
export const NIO_WHATSAPP_DISPLAY = '0536894854';
export const PUBLIC_SITE_URL = (
  import.meta.env.VITE_PUBLIC_SITE_URL || 'https://nio-wmgr.vercel.app'
).replace(/\/+$/, '');

export function buildWhatsAppOrderUrl(message?: string): string {
  const text =
    message ||
    'السلام عليكم، أرغب بالاستفسار وطلب خدمة الدعوات الإلكترونية عبر منصة نيو | NIO.';
  return `https://wa.me/${NIO_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export const ARABIC_FONTS: {
  id: ArabicFontId;
  label: string;
  cssFamily: string;
  className: string;
}[] = [
  {
    id: 'aref-ruqaa',
    label: 'خط الرقعة',
    cssFamily: '"Aref Ruqaa", "Amiri", serif',
    className: 'font-ruqaa',
  },
  {
    id: 'amiri',
    label: 'الخط الأميري',
    cssFamily: '"Amiri", serif',
    className: 'font-amiri',
  },
  {
    id: 'cairo',
    label: 'خط كايرو',
    cssFamily: '"Cairo", sans-serif',
    className: 'font-cairo',
  },
  {
    id: 'tajawal',
    label: 'خط تجوال',
    cssFamily: '"Tajawal", sans-serif',
    className: 'font-tajawal',
  },
  {
    id: 'reem-kufi',
    label: 'الخط الكوفي',
    cssFamily: '"Reem Kufi", sans-serif',
    className: 'font-kufi',
  },
  {
    id: 'scheherazade',
    label: 'خط النسخ',
    cssFamily: '"Scheherazade New", serif',
    className: 'font-naskh',
  },
];

export function getFontCss(fontId: ArabicFontId): string {
  return ARABIC_FONTS.find((f) => f.id === fontId)?.cssFamily || '"Aref Ruqaa", serif';
}

export function getFontClass(fontId: ArabicFontId): string {
  return ARABIC_FONTS.find((f) => f.id === fontId)?.className || 'font-ruqaa';
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding: 'حفل زفاف',
  engagement: 'حفل ملكة / خطوبة',
  graduation: 'حفل تخرج',
  reception: 'حفل استقبال',
  private: 'مناسبة خاصة',
};

export function createDefaultCanvasDesign(params?: {
  title?: string;
  hostNames?: string;
  dateText?: string;
  timeText?: string;
  venueName?: string;
}): EventCanvasDesign {
  const layers: CanvasTextLayer[] = [
    {
      id: 'layer-greeting',
      text: 'يتشرف بدعوتكم لحضور',
      fontFamily: 'aref-ruqaa',
      fontSize: 22,
      color: '#6B6B76',
      x: 50,
      y: 16,
      bold: false,
    },
    {
      id: 'layer-title',
      text: params?.title || 'حفل زفاف',
      fontFamily: 'aref-ruqaa',
      fontSize: 38,
      color: '#34343D',
      x: 50,
      y: 28,
      bold: true,
    },
    {
      id: 'layer-hosts',
      text: params?.hostNames || 'عائلة الكريم',
      fontFamily: 'amiri',
      fontSize: 28,
      color: '#34343D',
      x: 50,
      y: 41,
      bold: true,
    },
    {
      id: 'layer-guest',
      text: 'الأستاذ / {اسم_المدعو}',
      fontFamily: 'aref-ruqaa',
      fontSize: 26,
      color: '#34343D',
      x: 50,
      y: 56,
      bold: true,
    },
    {
      id: 'layer-date',
      text: [params?.dateText, params?.timeText].filter(Boolean).join(' • ') || 'الجمعة • 8:00 مساءً',
      fontFamily: 'cairo',
      fontSize: 16,
      color: '#52525E',
      x: 50,
      y: 72,
      bold: false,
    },
    {
      id: 'layer-venue',
      text: params?.venueName || 'قاعة الاحتفالات',
      fontFamily: 'cairo',
      fontSize: 16,
      color: '#52525E',
      x: 50,
      y: 80,
      bold: false,
    },
  ];

  return {
    backgroundImage: '',
    backgroundColor: '#FFFFFF',
    accentColor: '#34343D',
    textColor: '#34343D',
    fontFamily: 'aref-ruqaa',
    textLayers: layers,
    pngLayers: [],
  };
}

export function substituteGuestPlaceholders(
  text: string,
  guestName?: string,
  guestTitle?: string
): string {
  const name = guestName?.trim() || 'ضيفنا الكريم';
  const title = guestTitle?.trim() || '';
  return text
    .replace(/\{اسم_المدعو\}/g, name)
    .replace(/\{الاسم\}/g, name)
    .replace(/\{اللقب\}/g, title)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function generateRandomToken(length = 22): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

export function generateInviteToken(): string {
  return `inv_${generateRandomToken(20)}`;
}

export function generateQrToken(): string {
  return `NIO-${generateRandomToken(10).toUpperCase()}`;
}

export function generateShareToken(): string {
  return `rpt_${generateRandomToken(20)}`;
}

// Transliterates Arabic characters so each event name produces a readable URL-safe slug
const ARABIC_TO_LATIN: Record<string, string> = {
  أ: 'a',
  إ: 'e',
  آ: 'a',
  ا: 'a',
  ب: 'b',
  ت: 't',
  ث: 'th',
  ج: 'j',
  ح: 'h',
  خ: 'kh',
  د: 'd',
  ذ: 'dh',
  ر: 'r',
  ز: 'z',
  س: 's',
  ش: 'sh',
  ص: 's',
  ض: 'd',
  ط: 't',
  ظ: 'z',
  ع: 'a',
  غ: 'gh',
  ف: 'f',
  ق: 'q',
  ك: 'k',
  ل: 'l',
  م: 'm',
  ن: 'n',
  ه: 'h',
  ة: 'a',
  و: 'w',
  ي: 'y',
  ى: 'a',
  ئ: 'y',
  ؤ: 'w',
};

export function createEventSlug(title: string): string {
  let mapped = '';
  for (const ch of title.trim()) {
    if (ARABIC_TO_LATIN[ch]) {
      mapped += ARABIC_TO_LATIN[ch];
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      mapped += ch.toLowerCase();
    } else if (ch === ' ' || ch === '-' || ch === '_') {
      mapped += '-';
    }
  }
  const cleaned = mapped
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  const suffix = generateRandomToken(4).toLowerCase();
  if (!cleaned || cleaned.length < 2) {
    return `nio-event-${suffix}`;
  }
  return `${cleaned}-${suffix}`;
}

export function sanitizeSlugInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

/**
 * Compresses an uploaded image file in-browser so it fits comfortably inside Firestore's 1MB doc limit
 * and matches firebase-blueprint maxLength constraints.
 */
export async function compressImageToDataUrl(
  file: File,
  options: { maxWidth: number; isPng: boolean; maxLength: number }
): Promise<string> {
  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة الملف المحدد.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('الملف ليس صورة صالحة.'));
    image.src = rawUrl;
  });

  const scale = Math.min(1, options.maxWidth / Math.max(img.width, 1));
  let targetW = Math.max(1, Math.round(img.width * scale));
  let targetH = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('المتصفح لا يدعم معالجة الصور.');
  }

  const mimeType = options.isPng ? 'image/png' : 'image/jpeg';
  let quality = options.isPng ? 0.92 : 0.82;
  let result = '';

  for (let attempt = 0; attempt < 5; attempt++) {
    canvas.width = targetW;
    canvas.height = targetH;
    ctx.clearRect(0, 0, targetW, targetH);
    if (!options.isPng) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // For PNG stickers try webp with alpha if PNG exceeds cap
    if (options.isPng) {
      result = canvas.toDataURL('image/png');
      if (result.length > options.maxLength) {
        result = canvas.toDataURL('image/webp', Math.max(0.55, quality - attempt * 0.1));
      }
    } else {
      result = canvas.toDataURL(mimeType, Math.max(0.45, quality - attempt * 0.1));
    }

    if (result.length <= options.maxLength) {
      return result;
    }

    targetW = Math.max(120, Math.round(targetW * 0.78));
    targetH = Math.max(120, Math.round(targetH * 0.78));
  }

  if (result.length > options.maxLength) {
    throw new Error('حجم الصورة كبير جداً بعد الضغط، يُرجى اختيار صورة أصغر.');
  }

  return result;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('تعذر تحميل الصورة'));
    img.src = src;
  });
}

/**
 * Renders the complete custom invitation (background + PNG overlays + Arabic text layers + QR code) to a downloadable PNG.
 */
export async function renderInvitationPassPng(params: {
  event: EventDoc;
  guestName: string;
  guestTitle?: string;
  qrToken: string;
  includeQr?: boolean;
}): Promise<string> {
  const { event, guestName, guestTitle, qrToken, includeQr = true } = params;
  const design = event.canvasDesign;

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const width = 1080;
  const height = includeQr ? 1560 : 1360;
  const cardHeight = 1360;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D unavailable');
  }

  // Base fill
  ctx.fillStyle = design.backgroundColor || '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Custom background image
  if (design.backgroundImage) {
    try {
      const bg = await loadImage(design.backgroundImage);
      const imgRatio = bg.width / Math.max(bg.height, 1);
      const boxRatio = width / cardHeight;
      let drawW = width;
      let drawH = cardHeight;
      let dx = 0;
      let dy = 0;
      if (imgRatio > boxRatio) {
        drawH = cardHeight;
        drawW = drawH * imgRatio;
        dx = (width - drawW) / 2;
      } else {
        drawW = width;
        drawH = drawW / imgRatio;
        dy = (cardHeight - drawH) / 2;
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, cardHeight);
      ctx.clip();
      ctx.drawImage(bg, dx, dy, drawW, drawH);
      ctx.restore();
    } catch {
      // fallback to backgroundColor
    }
  }

  // PNG overlays
  for (const png of design.pngLayers || []) {
    try {
      const img = await loadImage(png.src);
      const targetW = (png.widthPct / 100) * width;
      const aspect = img.height / Math.max(img.width, 1);
      const targetH = targetW * aspect;
      const cx = (png.x / 100) * width;
      const cy = (png.y / 100) * cardHeight;
      ctx.save();
      ctx.globalAlpha = png.opacity ?? 1;
      ctx.drawImage(img, cx - targetW / 2, cy - targetH / 2, targetW, targetH);
      ctx.restore();
    } catch {
      // skip invalid overlay
    }
  }

  // Text layers
  const scaleFactor = width / 420; // studio preview width ~420px
  for (const layer of design.textLayers || []) {
    const resolved = substituteGuestPlaceholders(layer.text, guestName, guestTitle);
    if (!resolved) continue;
    const pxSize = Math.round((layer.fontSize || 24) * scaleFactor);
    const weight = layer.bold ? '700' : '400';
    const fontCss = getFontCss(layer.fontFamily);
    ctx.save();
    ctx.font = `${weight} ${pxSize}px ${fontCss}`;
    ctx.fillStyle = layer.color || '#34343D';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    const x = (layer.x / 100) * width;
    const y = (layer.y / 100) * cardHeight;
    ctx.fillText(resolved, x, y, width - 80);
    ctx.restore();
  }

  // Optional QR footer strip
  if (includeQr && qrToken) {
    ctx.fillStyle = '#34343D';
    ctx.fillRect(0, cardHeight, width, height - cardHeight);

    const qrDataUrl = await QRCode.toDataURL(qrToken, {
      width: 240,
      margin: 1,
      color: { dark: '#34343D', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',
    });
    const qrImg = await loadImage(qrDataUrl);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(width - 210, cardHeight + 25, 150, 150);
    ctx.drawImage(qrImg, width - 202, cardHeight + 33, 134, 134);

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'right';
    ctx.direction = 'rtl';
    ctx.font = '700 32px "Aref Ruqaa", serif';
    ctx.fillText(guestName || 'ضيفنا الكريم', width - 245, cardHeight + 76);

    ctx.fillStyle = '#D4D4DD';
    ctx.font = '500 22px "Cairo", sans-serif';
    ctx.fillText(event.title, width - 245, cardHeight + 120);

    ctx.font = '600 18px "JetBrains Mono", monospace';
    ctx.fillText(qrToken, width - 245, cardHeight + 158);
  }

  return canvas.toDataURL('image/png');
}

export async function downloadQrOnlyPng(qrToken: string, guestName: string): Promise<void> {
  const dataUrl = await QRCode.toDataURL(qrToken, {
    width: 720,
    margin: 3,
    color: { dark: '#34343D', light: '#FFFFFF' },
    errorCorrectionLevel: 'H',
  });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `nio-qr-${guestName.replace(/\s+/g, '-')}-${qrToken}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function downloadDataUrlPng(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function downloadCalendarIcs(event: EventDoc, guestName: string): void {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const start = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
  const dtStart = start.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const dtEnd = end.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NIO Events//AR',
    'BEGIN:VEVENT',
    `UID:${event.slug}-${stamp}@nio.events`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${event.title} - ${guestName}`,
    `DESCRIPTION:${event.subtitle || event.title} (${event.dateText} ${event.timeText})`,
    `LOCATION:${event.venueName}${event.city ? ` - ${event.city}` : ''}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.slug}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
