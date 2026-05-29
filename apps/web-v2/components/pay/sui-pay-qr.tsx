"use client";

import { QrCode } from "@/components/audric/cards/shared/QrCode";
import { AudricMark } from "@/components/ui/audric-mark";
import { buildSuiPayUri } from "@/lib/sui-pay-uri";

/**
 * SuiPayQr — payment QR primitive with two modes:
 *   - **amount mode** (fixed payment link — covers invoicing too post
 *     V07E_INVOICE_DEPRECATION): renders a wallet-recognised
 *     transaction URI built from `createPaymentTransactionUri` (nonce, label,
 *     message all encoded). Wallets show a pre-filled send screen.
 *   - **open-receive mode** (`amount` is null): renders a bare
 *     `sui:pay?recipient=…&coinType=…` deep-link. Wallets prompt for the
 *     amount.
 *
 * Session 3 introduced the open-receive build; Session 4 lifted the amount
 * branch back from `apps/web` so `/pay/[slug]` can encode any receivable
 * (payment link or — pre-deprecation — invoice; payment links cover
 * both use cases now).
 */

interface SuiPayQrProps {
  /**
   * Amount in token units (e.g. 5.50 USDC). `null` (or omitted) for
   * open-receive mode. When set, `nonce` MUST also be provided.
   */
  amount: number | null;
  label?: string | null;
  memo?: string | null;
  /** Required when `amount` is set (each receivable gets a unique nonce). */
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
    <div className="relative rounded-lg border border-border bg-background p-3">
      <QrCode size={size} value={uri} />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="rounded bg-background p-1 text-foreground">
          <AudricMark size={14} />
        </span>
      </div>
    </div>
  );
}
