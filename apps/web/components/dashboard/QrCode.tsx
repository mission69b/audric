'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Skeleton } from '@/components/ui/Skeleton';

interface QrCodeProps {
  value: string;
  size?: number;
}

export function QrCode({ value, size = 200 }: QrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      color: { dark: '#191919', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });

    return () => { cancelled = true; };
  }, [value, size]);

  if (!dataUrl) {
    return <Skeleton variant="block" width={size} height={size} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt={`QR code for ${value}`}
      width={size}
      height={size}
      className="rounded-lg"
    />
  );
}
