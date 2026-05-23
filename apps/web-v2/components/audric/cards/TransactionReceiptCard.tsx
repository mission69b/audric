'use client';

import type { ReactNode } from 'react';
import { isSuiAddress } from '@/lib/sui-address';
import { CardShell, SuiscanLink, fmtAmt } from './primitives';
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
  positive: 'text-success-solid',
  negative: 'text-warning-solid',
  neutral: '',
};

// [S.277] Grid-hero tool set was Volo-only (the only writes whose
// receipt benefited from a 2-column grid layout). Now empty; kept as
// `new Set<string>()` so the call sites continue to no-op gracefully
// without conditional-import gymnastics.
const USE_GRID_HERO_TOOLS = new Set<string>();

export function TransactionReceiptCard({
  data,
  toolName,
}: {
  data: TxReceiptData;
  toolName: string;
}) {
  if (!data.tx) return null;

  const lines = getHeroLines(data, toolName);
  const useGridHero = USE_GRID_HERO_TOOLS.has(toolName) && lines.length > 0;

  if (useGridHero) {
    return (
      <ReceiptChoreography tone="success">
        <CardShell title="Transaction" noPadding>
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${lines.length}, 1fr)`,
            }}
          >
            {lines.map((line, idx) => (
              <div
                key={`${line.label}-${idx}`}
                className="px-2.5 py-1.5"
                style={
                  idx < lines.length - 1
                    ? { borderRight: '0.5px solid var(--border-subtle)' }
                    : undefined
                }
              >
                <div className="text-fg-muted mb-1 text-[10px] uppercase tracking-wider">
                  {line.label}
                </div>
                <div
                  className={`font-mono font-medium text-[13px] ${
                    line.emphasis
                      ? emphasisClass[line.emphasis]
                      : 'text-fg-primary'
                  }`}
                >
                  {line.value}
                </div>
              </div>
            ))}
          </div>

          {data.gasCost != null && data.gasCost > 0 && (
            <div
              className="flex items-center justify-between px-3 py-2 text-[13px]"
              style={{ borderTop: '0.5px solid var(--border-subtle)' }}
            >
              <span className="text-fg-secondary">Gas</span>
              <span className="font-mono text-fg-primary">
                {data.gasCost.toFixed(4)} SUI
              </span>
            </div>
          )}

          <div className="px-3 py-2">
            <SuiscanLink digest={data.tx} />
          </div>
        </CardShell>
      </ReceiptChoreography>
    );
  }

  return (
    <ReceiptChoreography tone="success">
      <CardShell title="Transaction" noPadding>
        {lines.map((line, idx) => {
          if (line.variant === 'address') {
            const addrToShow = line.rawAddress ?? line.value;
            const showName =
              line.rawAddress && line.value !== line.rawAddress;
            return (
              <div
                key={`${line.label}-${idx}`}
                className="px-3 py-2 text-[13px]"
                style={{
                  borderBottom: '0.5px solid var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-fg-secondary">{line.label}</span>
                  {showName && (
                    <span className="font-mono text-fg-primary">
                      {line.value}
                    </span>
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
              <span
                className={`font-mono text-fg-primary ${
                  line.emphasis ? emphasisClass[line.emphasis] : ''
                }`}
              >
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
            <span className="font-mono text-fg-primary">
              {data.gasCost.toFixed(4)} SUI
            </span>
          </div>
        )}

        <div className="px-3 py-2">
          <SuiscanLink digest={data.tx} />
        </div>
      </CardShell>
    </ReceiptChoreography>
  );
}
