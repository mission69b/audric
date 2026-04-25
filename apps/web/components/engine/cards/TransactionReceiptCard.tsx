'use client';

import { CardShell, SuiscanLink, fmtAmt } from './primitives';
import { isSuiAddress } from '@/lib/sui-address';
import { ChunkedAddress } from '../ChunkedAddress';

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
  rewards?: {
    asset?: string;
    /** Reward token symbol (e.g. "vSUI") — engine populates this from coinType. */
    symbol?: string;
    amount: number;
    estimatedValueUsd?: number;
  }[];
  totalValueUsd?: number | null;
  memo?: string;
  serviceName?: string;
  serviceEndpoint?: string;
  deliveryEstimate?: string;
}

type HeroLine = {
  label: string;
  value: string;
  emphasis?: 'positive' | 'negative' | 'neutral';
  /**
   * When set, renders `value` as a full-width chunked-hex Sui address
   * (with the contact name as a sub-line if present) instead of the
   * compact right-aligned label/value row. Used for `send_transfer.to`
   * so a single-character typo is glanceable on the receipt — the
   * old `slice(0, 10)` truncation hid exactly the position where the
   * lost-funds bug occurred.
   */
  variant?: 'address';
  /** Raw 0x address shown beneath a contact name when variant === 'address'. */
  rawAddress?: string;
};

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
    // Defensive coerce: Cetus's deviationRatio sometimes arrives as a string,
    // and a stray .toFixed() on a non-number takes the chat down via the
    // React error boundary.
    const impactNum = data.priceImpact == null ? null : Number(data.priceImpact);
    if (impactNum != null && Number.isFinite(impactNum) && impactNum > 0.01) {
      lines.push({ label: 'Impact', value: `${impactNum.toFixed(2)}%`, emphasis: impactNum > 1 ? 'negative' : 'neutral' });
    }
    return lines;
  }

  if (toolName === 'send_transfer') {
    lines.push({ label: 'Amount', value: `$${fmtAmt(data.amount ?? 0)}` });
    const rawTo = String(data.to ?? '');
    if (data.contactName) {
      lines.push({
        label: 'To',
        value: data.contactName,
        variant: 'address',
        rawAddress: isSuiAddress(rawTo) ? rawTo : undefined,
      });
    } else {
      lines.push({
        label: 'To',
        value: rawTo,
        variant: 'address',
      });
    }
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

  if (toolName === 'claim_rewards') {
    const rewards = (data.rewards ?? []).filter((r) => Number.isFinite(r.amount) && r.amount > 0);

    // Per-reward lines (e.g. "0.0165 vSUI") — surfaces the actual on-chain
    // credit even when USD pricing is missing. We previously only showed
    // a "Claimed $X.XX" line that collapsed to "$0.00" or disappeared
    // entirely whenever `totalValueUsd` was null/0/NaN, which made successful
    // reward claims look like no-ops in the UI.
    for (const r of rewards) {
      const symbol = r.symbol ?? r.asset ?? 'REWARD';
      lines.push({
        label: 'Claimed',
        value: `${fmtAmt(r.amount, 4)} ${symbol}`,
        emphasis: 'positive',
      });
    }

    if (data.totalValueUsd != null && data.totalValueUsd > 0) {
      lines.push({
        label: 'Value',
        value: `~$${fmtAmt(data.totalValueUsd)}`,
        emphasis: 'positive',
      });
    }

    if (rewards.length === 0) {
      lines.push({ label: 'Claimed', value: 'No pending rewards', emphasis: 'neutral' });
    }

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
  positive: 'text-success-solid',
  negative: 'text-warning-solid',
  neutral: '',
};

export function TransactionReceiptCard({ data, toolName }: { data: TxReceiptData; toolName: string }) {
  if (!data.tx) return null;

  const lines = getHeroLines(data, toolName);

  return (
    <CardShell title="Transaction" noPadding>
      {lines.map((line, idx) => {
        if (line.variant === 'address') {
          // Full-width address row: contact name (if any) on the right,
          // chunked-hex address on its own line beneath. When the contact
          // name IS the address (no nickname), we just render the chunked
          // hex once. The chunked render is the whole point — typos at
          // position 20 are visible only when every nibble is shown.
          const addrToShow = line.rawAddress ?? line.value;
          const showName = line.rawAddress && line.value !== line.rawAddress;
          return (
            <div
              key={`${line.label}-${idx}`}
              className="px-3 py-2 text-[13px]"
              style={{ borderBottom: '0.5px solid var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-fg-secondary">{line.label}</span>
                {showName && (
                  <span className="font-mono text-fg-primary">{line.value}</span>
                )}
              </div>
              {isSuiAddress(addrToShow) && (
                <ChunkedAddress
                  address={addrToShow}
                  className="mt-1 text-[11px] text-fg-secondary"
                />
              )}
            </div>
          );
        }
        return (
          <div
            key={`${line.label}-${idx}`}
            className="flex items-center justify-between px-3 py-2 text-[13px]"
            style={{ borderBottom: '0.5px solid var(--border-subtle)' }}
          >
            <span className="text-fg-secondary">{line.label}</span>
            <span className={`font-mono text-fg-primary ${line.emphasis ? emphasisClass[line.emphasis] : ''}`}>
              {line.value}
            </span>
          </div>
        );
      })}

      {data.gasCost != null && data.gasCost > 0 && (
        <div
          className="flex items-center justify-between px-3 py-2 text-[13px]"
          style={{ borderBottom: '0.5px solid var(--border-subtle)' }}
        >
          <span className="text-fg-secondary">Gas</span>
          <span className="font-mono text-fg-primary">{data.gasCost.toFixed(4)} SUI</span>
        </div>
      )}

      <div className="px-3 py-2">
        <SuiscanLink digest={data.tx} />
      </div>
    </CardShell>
  );
}
