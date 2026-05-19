'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Skeleton } from '@/components/ui/skeleton';

// QrCode — shared primitive for InvoiceCard + PaymentLinkCard. Ported
// from `apps/web/components/dashboard/QrCode.tsx` by Phase 5a.4
// (renderer migration sweep, 2026-05-19). API verbatim; the Skeleton
// fallback uses web-v2's shadcn Skeleton (no variant prop) sized via
// inline style.

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
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        // Best-effort: swallow QR errors and leave the skeleton.
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return <Skeleton style={{ width: size, height: size }} />;
  }

  return (
    // biome-ignore lint/performance/noImgElement: data-url QR code, no LCP concern
    <img
      src={dataUrl}
      alt={`QR code for ${value}`}
      width={size}
      height={size}
      className="rounded-lg"
    />
  );
}
