"use client";

import { QrCode } from "@/components/audric/cards/shared/QrCode";
import { AudricMark } from "@/components/ui/audric-mark";
import { buildSuiPayUri } from "@/lib/sui-pay-uri";

/**
 * SuiPayQr — payment QR primitive with two modes:
 *   - **amount mode** (invoice / fixed payment): renders a wallet-recognised
 *     transaction URI built from `createPaymentTransactionUri` (nonce, label,
 *     message all encoded). Wallets show a pre-filled send screen.
 *   - **open-receive mode** (`amount` is null): renders a bare
 *     `sui:pay?recipient=…&coinType=…` deep-link. Wallets prompt for the
 *     amount.
 *
 * Session 3 introduced the open-receive build; Session 4 lifted the amount
 * branch back from `apps/web` so `/pay/[slug]` can encode invoices.
 */

interface SuiPayQrProps {
  /**
   * Amount in token units (e.g. 5.50 USDC). `null` (or omitted) for
   * open-receive mode. When set, `nonce` MUST also be provided.
   */
  amount: number | null;
  label?: string | null;
  memo?: string | null;
  /** Required when `amount` is set (each invoice gets a unique nonce). */
  nonce?: string;
  recipientAddress: string;
  size?: number;
}

export function SuiPayQr({
  recipientAddress,
  amount,
  nonce,
  label,
  memo,
  size = 180,
}: SuiPayQrProps) {
  const uri = buildSuiPayUri({
    recipient: recipientAddress,
    amount,
    nonce,
    label,
    memo,
  });

  return (
    <div className="relative rounded-lg border border-border-subtle bg-surface-page p-3">
      <QrCode size={size} value={uri} />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="rounded bg-surface-page p-1 text-fg-primary">
          <AudricMark size={14} />
        </span>
      </div>
    </div>
  );
}
