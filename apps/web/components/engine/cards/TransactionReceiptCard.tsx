'use client';

import { CardShell, SuiscanLink, fmtAmt } from './primitives';

interface TxReceiptData {
  tx: string;
  gasCost?: number;
  amount?: number;
  asset?: string;
  apy?: number;
  savingsBalance?: number;
  to?: string;
  contactName?: string;
  fromToken?: string;
  toToken?: string;
  fromAmount?: number;
  toAmount?: number;
  from?: string;
  received?: number | string;
  priceImpact?: number;
  route?: string;
  amountSui?: number;
  vSuiReceived?: number;
  vSuiAmount?: number;
  suiReceived?: number;
  fee?: number;
  healthFactor?: number;
  remainingDebt?: number;
  rewards?: { asset: string; amount: number; estimatedValueUsd?: number }[];
  totalValueUsd?: number;
  memo?: string;
  serviceName?: string;
  serviceEndpoint?: string;
  deliveryEstimate?: string;
}

type HeroLine = { label: string; value: string; emphasis?: 'positive' | 'negative' | 'neutral' };

function getHeroLines(data: TxReceiptData, toolName: string): HeroLine[] {
  const lines: HeroLine[] = [];

  if (toolName === 'swap_execute') {
    const swapFrom = data.fromToken ?? data.from;
    const swapTo = data.toToken ?? data.to;
    const swapFromAmt = data.fromAmount ?? data.amount ?? 0;
    const receivedRaw = data.toAmount ?? data.received;
    const swapToAmt = typeof receivedRaw === 'number' ? receivedRaw : (typeof receivedRaw === 'string' && receivedRaw !== 'unknown' ? parseFloat(receivedRaw) : undefined);

    lines.push({ label: 'Sold', value: `${fmtAmt(swapFromAmt)} ${swapFrom}`, emphasis: 'negative' });
    if (swapToAmt != null && !isNaN(swapToAmt)) {
      lines.push({ label: 'Received', value: `${fmtAmt(swapToAmt, 4)} ${swapTo}`, emphasis: 'positive' });
    }
    if (data.priceImpact != null && data.priceImpact > 0.01) {
      lines.push({ label: 'Impact', value: `${data.priceImpact.toFixed(2)}%`, emphasis: data.priceImpact > 1 ? 'negative' : 'neutral' });
    }
    return lines;
  }

  if (toolName === 'send_transfer') {
    lines.push({ label: 'Amount', value: `$${fmtAmt(data.amount ?? 0)}` });
    lines.push({ label: 'To', value: data.contactName ?? `${String(data.to ?? '').slice(0, 10)}...` });
    if (data.memo) lines.push({ label: 'Memo', value: data.memo });
    return lines;
  }

  if (toolName === 'save_deposit') {
    lines.push({ label: 'Deposited', value: `${fmtAmt(data.amount ?? 0)} ${data.asset ?? 'USDC'}` });
    if (data.apy != null) lines.push({ label: 'APY', value: `${(data.apy * 100).toFixed(2)}%`, emphasis: 'positive' });
    return lines;
  }

  if (toolName === 'withdraw') {
    lines.push({ label: 'Withdrawn', value: `${fmtAmt(data.amount ?? 0)} ${data.asset ?? 'USDC'}` });
    return lines;
  }

  if (toolName === 'borrow') {
    lines.push({ label: 'Borrowed', value: `$${fmtAmt(data.amount ?? 0)}` });
    if (data.healthFactor != null) {
      lines.push({ label: 'Health', value: data.healthFactor.toFixed(2), emphasis: data.healthFactor < 1.5 ? 'negative' : 'positive' });
    }
    return lines;
  }

  if (toolName === 'repay_debt') {
    lines.push({ label: 'Repaid', value: `$${fmtAmt(data.amount ?? 0)}` });
    if (data.remainingDebt != null) lines.push({ label: 'Remaining', value: `$${fmtAmt(data.remainingDebt)}` });
    return lines;
  }

  if (toolName === 'claim_rewards' && data.totalValueUsd != null) {
    lines.push({ label: 'Claimed', value: `$${fmtAmt(data.totalValueUsd)}`, emphasis: 'positive' });
    return lines;
  }

  if (toolName === 'volo_stake') {
    const stakeAmt = data.amountSui ?? data.amount ?? 0;
    lines.push({ label: 'Staked', value: `${fmtAmt(stakeAmt)} SUI` });
    if (data.vSuiReceived != null) lines.push({ label: 'Received', value: `${fmtAmt(data.vSuiReceived, 4)} vSUI`, emphasis: 'positive' });
    if (data.apy != null) lines.push({ label: 'APY', value: `${(data.apy * 100).toFixed(2)}%`, emphasis: 'positive' });
    return lines;
  }

  if (toolName === 'volo_unstake') {
    const unstakeAmt = data.vSuiAmount ?? data.amount ?? 0;
    lines.push({ label: 'Unstaked', value: `${fmtAmt(unstakeAmt, 4)} vSUI` });
    if (data.suiReceived != null) lines.push({ label: 'Received', value: `${fmtAmt(data.suiReceived, 4)} SUI`, emphasis: 'positive' });
    return lines;
  }

  if (toolName === 'pay_api') {
    if (data.serviceName) lines.push({ label: 'Service', value: data.serviceName });
    if (data.amount != null) lines.push({ label: 'Cost', value: `$${fmtAmt(data.amount)}` });
    if (data.deliveryEstimate) lines.push({ label: 'Delivery', value: data.deliveryEstimate });
    return lines;
  }

  if (data.amount != null) {
    lines.push({ label: 'Amount', value: `${fmtAmt(data.amount)} ${data.asset ?? 'USDC'}` });
  }

  return lines;
}

const emphasisClass: Record<string, string> = {
  positive: 'text-success',
  negative: 'text-warning',
  neutral: '',
};

export function TransactionReceiptCard({ data, toolName }: { data: TxReceiptData; toolName: string }) {
  if (!data.tx) return null;

  const lines = getHeroLines(data, toolName);

  return (
    <CardShell title="Transaction" noPadding>
      {lines.map((line) => (
        <div
          key={line.label}
          className="flex items-center justify-between px-3 py-2 text-[13px]"
          style={{ borderBottom: '0.5px solid var(--border)' }}
        >
          <span className="text-muted">{line.label}</span>
          <span className={`font-mono text-foreground ${line.emphasis ? emphasisClass[line.emphasis] : ''}`}>
            {line.value}
          </span>
        </div>
      ))}

      {data.gasCost != null && data.gasCost > 0 && (
        <div
          className="flex items-center justify-between px-3 py-2 text-[13px]"
          style={{ borderBottom: '0.5px solid var(--border)' }}
        >
          <span className="text-muted">Gas</span>
          <span className="font-mono text-foreground">{data.gasCost.toFixed(4)} SUI</span>
        </div>
      )}

      <div className="px-3 py-2">
        <SuiscanLink digest={data.tx} />
      </div>
    </CardShell>
  );
}
