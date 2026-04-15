'use client';

import { QrCode } from '@/components/dashboard/QrCode';
import { AudricMark } from '@/components/ui/AudricMark';

const USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const USDC_DECIMALS = 6;

interface SuiPayQrProps {
  recipientAddress: string;
  amount: number | null;
  size?: number;
}

function buildSuiPayUri(recipient: string, amount: number | null): string {
  const params = new URLSearchParams({
    recipient,
    coinType: USDC_TYPE,
  });
  if (amount !== null && amount > 0) {
    const rawAmount = Math.floor(amount * 10 ** USDC_DECIMALS);
    params.set('amount', String(rawAmount));
  }
  return `sui:pay?${params.toString()}`;
}

export function SuiPayQr({ recipientAddress, amount, size = 180 }: SuiPayQrProps) {
  const uri = buildSuiPayUri(recipientAddress, amount);

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
