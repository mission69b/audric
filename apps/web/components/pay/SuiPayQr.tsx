'use client';

import { createPaymentTransactionUri } from '@mysten/payment-kit';
import { QrCode } from '@/components/dashboard/QrCode';
import { AudricMark } from '@/components/ui/AudricMark';

const USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const USDC_DECIMALS = 6;

interface SuiPayQrProps {
  recipientAddress: string;
  amount: number | null;
  nonce: string;
  label?: string | null;
  memo?: string | null;
  size?: number;
}

export function SuiPayQr({ recipientAddress, amount, nonce, label, memo, size = 180 }: SuiPayQrProps) {
  let uri: string;
  if (amount !== null && amount > 0) {
    const rawAmount = BigInt(Math.floor(amount * 10 ** USDC_DECIMALS));
    uri = createPaymentTransactionUri({
      receiverAddress: recipientAddress,
      amount: rawAmount,
      coinType: USDC_TYPE,
      nonce,
      ...(label ? { label } : {}),
      ...(memo ? { message: memo } : {}),
    });
  } else {
    const params = new URLSearchParams({ recipient: recipientAddress, coinType: USDC_TYPE });
    uri = `sui:pay?${params.toString()}`;
  }

  return (
    <div className="relative p-3 rounded-lg border border-border bg-background">
      <QrCode value={uri} size={size} />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-foreground bg-background p-1 rounded">
          <AudricMark size={14} />
        </span>
      </div>
    </div>
  );
}
