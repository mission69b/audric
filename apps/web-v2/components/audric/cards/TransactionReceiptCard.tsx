'use client';

import type { ReactNode } from 'react';
import { isSuiAddress } from '@/lib/sui-address';
import { SUISCAN_TX_URL, SUISCAN_ICON, fmtAmt } from './primitives';
import { ChunkedAddress } from './shared/ChunkedAddress';

// TransactionReceiptCard — write-tool receipt renderer. Ported from
// `apps/web/components/engine/cards/TransactionReceiptCard.tsx` by
// Phase 5a.4 (renderer migration sweep, 2026-05-19). Verbatim except:
//   1. `ChunkedAddress` resolved from `./shared/ChunkedAddress`
//      (Phase 5a.4 vendored copy) instead of the legacy engine root.
//   2. `ReceiptChoreography` (motion/, HEAVY subsurface) is a
//      PERMANENT no-op passthrough — founder-locked 2026-05-19 to
//      skeleton-pulse only. The legacy stagger + fade-in motion is
//      intentionally NOT ported. See BENEFITS_SPEC_v07c.md §"Phase 5".

function ReceiptChoreography({
  children,
}: {
  tone?: 'success' | 'neutral';
  children: ReactNode;
}) {
  // Permanent passthrough — motion family deleted from Phase 5
  // scope. The accent stripe + checkmark badge below carry the
  // "transaction landed" signal without animation.
  return <>{children}</>;
}

interface TxReceiptData {
  tx: string;
  gasCost?: number;
  amount?: number;
  asset?: string;
  apy?: number;
  savingsBalance?: number;
  to?: string;
  contactName?: string;
  suinsName?: string;
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
    symbol?: string;
    amount: number;
    estimatedValueUsd?: number;
  }[];
  totalValueUsd?: number | null;
  claimed?: {
    symbol?: string;
    amount: number;
    estimatedValueUsd?: number;
  }[];
  swaps?: {
    fromSymbol: string;
    inputAmount: number;
    expectedOutputUsdc: number;
  }[];
  skipped?: {
    symbol?: string;
    amount: number;
    reason: 'untradeable' | 'dust' | 'no-route';
  }[];
  expectedUsdcDeposited?: number;
  memo?: string;
  serviceName?: string;
  serviceEndpoint?: string;
  deliveryEstimate?: string;
}

type HeroLine = {
  label: string;
  value: string;
  emphasis?: 'positive' | 'negative' | 'neutral';
  variant?: 'address';
  rawAddress?: string;
};

function getHeroLines(data: TxReceiptData, toolName: string): HeroLine[] {
  const lines: HeroLine[] = [];

  if (toolName === 'swap_execute') {
    const swapFrom = data.fromToken ?? data.from;
    const swapTo = data.toToken ?? data.to;
    const swapFromAmt = data.fromAmount ?? data.amount ?? 0;
    const receivedRaw = data.toAmount ?? data.received;
    const swapToAmt =
      typeof receivedRaw === 'number'
        ? receivedRaw
        : typeof receivedRaw === 'string' && receivedRaw !== 'unknown'
          ? Number.parseFloat(receivedRaw)
          : undefined;

    lines.push({
      label: 'Sold',
      value: `${fmtAmt(swapFromAmt)} ${swapFrom}`,
      emphasis: 'negative',
    });
    if (swapToAmt != null && !Number.isNaN(swapToAmt)) {
      lines.push({
        label: 'Received',
        value: `${fmtAmt(swapToAmt, 4)} ${swapTo}`,
        emphasis: 'positive',
      });
    }
    const impactNum =
      data.priceImpact == null ? null : Number(data.priceImpact);
    if (impactNum != null && Number.isFinite(impactNum) && impactNum > 0.01) {
      lines.push({
        label: 'Impact',
        value: `${impactNum.toFixed(2)}%`,
        emphasis: impactNum > 1 ? 'negative' : 'neutral',
      });
    }
    return lines;
  }

  if (toolName === 'send_transfer') {
    lines.push({ label: 'Amount', value: `$${fmtAmt(data.amount ?? 0)}` });
    const rawTo = String(data.to ?? '');
    const displayName = data.contactName ?? data.suinsName;
    if (displayName) {
      lines.push({
        label: 'To',
        value: displayName,
        variant: 'address',
        rawAddress: isSuiAddress(rawTo) ? rawTo : undefined,
      });
    } else {
      lines.push({ label: 'To', value: rawTo, variant: 'address' });
    }
    if (data.memo) lines.push({ label: 'Memo', value: data.memo });
    return lines;
  }

  if (toolName === 'save_deposit') {
    lines.push({
      label: 'Deposited',
      value: `${fmtAmt(data.amount ?? 0)} ${data.asset ?? 'USDC'}`,
    });
    if (data.apy != null)
      lines.push({
        label: 'APY',
        value: `${(data.apy * 100).toFixed(2)}%`,
        emphasis: 'positive',
      });
    return lines;
  }

  if (toolName === 'withdraw') {
    lines.push({
      label: 'Withdrawn',
      value: `${fmtAmt(data.amount ?? 0)} ${data.asset ?? 'USDC'}`,
    });
    return lines;
  }

  if (toolName === 'borrow') {
    lines.push({ label: 'Borrowed', value: `$${fmtAmt(data.amount ?? 0)}` });
    if (data.healthFactor != null) {
      lines.push({
        label: 'Health',
        value: data.healthFactor.toFixed(2),
        emphasis: data.healthFactor < 1.5 ? 'negative' : 'positive',
      });
    }
    return lines;
  }

  if (toolName === 'repay_debt') {
    lines.push({ label: 'Repaid', value: `$${fmtAmt(data.amount ?? 0)}` });
    if (data.remainingDebt != null)
      lines.push({
        label: 'Remaining',
        value: `$${fmtAmt(data.remainingDebt)}`,
      });
    return lines;
  }

  if (toolName === 'claim_rewards') {
    const rewards = (data.rewards ?? []).filter(
      (r) => Number.isFinite(r.amount) && r.amount > 0,
    );

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
      lines.push({
        label: 'Claimed',
        value: 'No pending rewards',
        emphasis: 'neutral',
      });
    }

    return lines;
  }

  if (toolName === 'harvest_rewards') {
    const claimed = (data.claimed ?? []).filter(
      (r) => Number.isFinite(r.amount) && r.amount > 0,
    );
    const swaps = (data.swaps ?? []).filter((s) =>
      Number.isFinite(s.expectedOutputUsdc),
    );
    const skipped = data.skipped ?? [];
    const deposited = data.expectedUsdcDeposited ?? 0;

    for (const c of claimed) {
      const symbol = c.symbol ?? 'REWARD';
      lines.push({
        label: 'Claimed',
        value: `${fmtAmt(c.amount, 4)} ${symbol}`,
        emphasis: 'positive',
      });
    }

    for (const s of swaps) {
      lines.push({
        label: 'Swapped',
        value: `${s.fromSymbol} → ~${fmtAmt(s.expectedOutputUsdc, 4)} USDC`,
      });
    }

    if (deposited > 0) {
      lines.push({
        label: 'Deposited',
        value: `~$${fmtAmt(deposited)} USDC`,
        emphasis: 'positive',
      });
    }

    for (const sk of skipped) {
      const symbol = sk.symbol ?? 'token';
      const reasonLabel =
        sk.reason === 'dust'
          ? 'Sent to wallet (dust)'
          : sk.reason === 'no-route'
            ? 'Sent to wallet (no swap route)'
            : 'Sent to wallet (untradeable)';
      lines.push({
        label: reasonLabel,
        value: `${fmtAmt(sk.amount, 4)} ${symbol}`,
      });
    }

    if (
      claimed.length === 0 &&
      swaps.length === 0 &&
      deposited === 0 &&
      skipped.length === 0
    ) {
      lines.push({
        label: 'Harvested',
        value: 'No rewards available',
        emphasis: 'neutral',
      });
    }

    return lines;
  }

  // [S.277] volo_stake / volo_unstake branches removed — engine tools
  // cut in 2.18.0 ("Earns Its Keep" audit).

  if (data.amount != null) {
    lines.push({
      label: 'Amount',
      value: `${fmtAmt(data.amount)} ${data.asset ?? 'USDC'}`,
    });
  }

  return lines;
}

const emphasisClass: Record<string, string> = {
  positive: 'text-success',
  negative: 'text-warning',
  neutral: '',
};

// [R6.3] Per-tool receipt header (title + settlement sub) per the
// phase2-receipts-denials spec. The body rrows still come from
// `getHeroLines`; this just supplies the calm green-header headline.
function getReceiptHeader(
  data: TxReceiptData,
  toolName: string,
): { title: string; sub: string } {
  const sub = 'Settled on Sui';
  switch (toolName) {
    case 'save_deposit':
      return { title: 'Saved to NAVI', sub };
    case 'withdraw':
      return { title: 'Withdrawn from NAVI', sub };
    case 'send_transfer': {
      const name = data.contactName ?? data.suinsName;
      return { title: name ? `Sent to ${name}` : 'Sent', sub };
    }
    case 'borrow':
      return { title: 'Borrowed against savings', sub };
    case 'repay_debt':
      return { title: 'Repaid NAVI debt', sub };
    case 'claim_rewards':
      return { title: 'Claimed rewards', sub };
    case 'harvest_rewards':
      return { title: 'Compounded rewards', sub };
    case 'swap_execute': {
      const from = data.fromToken ?? data.from;
      const to = data.toToken ?? data.to;
      return {
        title: from && to ? `Swapped ${from} → ${to}` : 'Swap settled',
        sub,
      };
    }
    default:
      return { title: 'Transaction settled', sub };
  }
}

function ReceiptCheck() {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success text-background">
      <svg aria-hidden="true" fill="none" height="13" viewBox="0 0 16 16" width="13">
        <title>Settled</title>
        <path
          d="M3.5 8.5L6.5 11.5L13 4.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    </span>
  );
}

export function TransactionReceiptCard({
  data,
  toolName,
}: {
  data: TxReceiptData;
  toolName: string;
}) {
  if (!data.tx) return null;

  const lines = getHeroLines(data, toolName);
  const { title, sub } = getReceiptHeader(data, toolName);
  const shortDigest = `${data.tx.slice(0, 4)}…${data.tx.slice(-3)}`;

  return (
    <ReceiptChoreography tone="success">
      <div
        className="my-1.5 overflow-hidden rounded-lg border bg-card"
        style={{
          borderColor: 'color-mix(in srgb, var(--success) 18%, transparent)',
        }}
      >
        <div
          className="flex items-center gap-3 border-border border-b px-[18px] py-[14px]"
          style={{
            background: 'color-mix(in srgb, var(--success) 5%, transparent)',
          }}
        >
          <ReceiptCheck />
          <div>
            <h3 className="font-medium text-[14px] text-foreground tracking-[-0.011em]">
              {title}
            </h3>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {sub}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1 px-[18px] py-[14px]">
          {lines.map((line, idx) => {
            if (line.variant === 'address') {
              const addrToShow = line.rawAddress ?? line.value;
              const showName =
                line.rawAddress && line.value !== line.rawAddress;
              return (
                <div className="py-[3px] text-[13px]" key={`${line.label}-${idx}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-muted-foreground">{line.label}</span>
                    {showName && (
                      <span className="font-mono font-medium text-foreground">
                        {line.value}
                      </span>
                    )}
                  </div>
                  {isSuiAddress(addrToShow) && (
                    <ChunkedAddress
                      address={addrToShow}
                      className="mt-1 text-[11px] text-muted-foreground"
                    />
                  )}
                </div>
              );
            }
            return (
              <div
                className="flex items-baseline justify-between py-[3px] text-[13px]"
                key={`${line.label}-${idx}`}
              >
                <span className="text-muted-foreground">{line.label}</span>
                <span
                  className={`font-mono font-medium tabular-nums ${
                    line.emphasis ? emphasisClass[line.emphasis] : 'text-foreground'
                  }`}
                >
                  {line.value}
                </span>
              </div>
            );
          })}

          {data.gasCost != null && data.gasCost > 0 && (
            <div className="flex items-baseline justify-between py-[3px] text-[13px]">
              <span className="text-muted-foreground">Gas</span>
              <span className="font-mono font-medium tabular-nums text-foreground">
                {data.gasCost.toFixed(4)} SUI
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-border border-t border-dashed px-[18px] py-[11px]">
          <span className="font-mono text-[11px] text-muted-foreground">
            {shortDigest}
          </span>
          <a
            className="inline-flex items-center gap-1 border-foreground/30 border-b font-mono text-[11px] text-foreground transition hover:border-foreground"
            href={`${SUISCAN_TX_URL}/${data.tx}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            View on Sui
            {SUISCAN_ICON}
          </a>
        </div>
      </div>
    </ReceiptChoreography>
  );
}
