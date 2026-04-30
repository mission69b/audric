'use client';

import { QrCode } from '@/components/dashboard/QrCode';
import { AudricMark } from '@/components/ui/AudricMark';
import { buildSuiPayUri } from '@/lib/sui-pay-uri';

interface SuiPayQrProps {
  recipientAddress: string;
  amount: number | null;
  nonce: string;
  label?: string | null;
  memo?: string | null;
  size?: number;
}

export function SuiPayQr({ recipientAddress, amount, nonce, label, memo, size = 180 }: SuiPayQrProps) {
  const uri = buildSuiPayUri({
    recipient: recipientAddress,
    amount,
    nonce,
    label,
    memo,
  });

  return (
    <div className="relative p-3 rounded-lg border border-border-subtle bg-surface-page">
      <QrCode value={uri} size={size} />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-fg-primary bg-surface-page p-1 rounded">
          <AudricMark size={14} />
        </span>
      </div>
    </div>
  );
}
