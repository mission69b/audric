'use client';

import { QrCode } from '@/components/dashboard/QrCode';
import { AudricMark } from '@/components/ui/AudricMark';
import { buildSuiPayUri } from '@/lib/sui-pay-uri';

interface SuiPayQrProps {
  recipientAddress: string;
  /**
   * Amount in token units (e.g. 5.50 USDC). `null` for open-receive
   * mode ("send me whatever") — the QR encodes a bare `sui:pay?recipient=…`
   * deep-link without an amount or nonce.
   */
  amount: number | null;
  /**
   * Required ONLY when `amount` is set (invoice mode). Open-receive mode
   * (amount === null) ignores it — the URI has no nonce because there's
   * no payment to deduplicate. Optional in the type so consumers like
   * SPEC 10's UsernameClaimSuccess (open-receive only) don't have to
   * pass a placeholder.
   */
  nonce?: string;
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
