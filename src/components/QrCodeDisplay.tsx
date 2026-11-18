import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeDisplayProps {
  value: string;
  size?: number;
  className?: string;
  alt?: string;
}

export function QrCodeDisplay({
  value,
  size = 220,
  className = '',
  alt = 'رمز الدخول QR',
}: QrCodeDisplayProps) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 2,
      color: {
        dark: '#141414',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch((err) => {
        console.error('QR generation error:', err);
      });

    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-stone-100 animate-pulse flex items-center justify-center text-xs text-stone-400 ${className}`}
      >
        جارٍ التوليد...
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={alt}
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      className={`block bg-white p-2 border border-stone-200 ${className}`}
    />
  );
}
