'use client';

import { AddressBadge, CardShell, fmtUsd, fmtYield, QRow } from './primitives';
import { AssetRow, MetricBlock } from './shared';

// SavingsCard — `savings_info` tool renderer.
//
// [R6.4 / A3 — 2026-05-30] Rebuilt to the phase2 read-card spec
// (`t2000-AFI/audric/phase2-read-cards.html` R5): a live NAVI eyebrow
// with a blended-APY meta badge, a "Deposited" hero MetricBlock, the
// supply (and any borrow) positions as compact AssetRows, an earnings
// projection in dotted QRows, and a dashed footer. Data shape +
// derivations preserved from the prior `apps/web` port.

interface SavingsPosition {
  symbol: string;
  amount: number;
  valueUsd: number;
  apy: number;
  type: 'supply' | 'borrow';
  protocol?: string;
}

interface SavingsData {
  positions?: SavingsPosition[];
  earnings?: { currentApy: number; dailyEarning: number; supplied: number };
  address?: string;
  isSelfQuery?: boolean;
  suinsName?: string | null;
}

function fmtApy(apy: number): string {
  // Engine APYs arrive either as a fraction (0.0524) or a percent (5.24).
  const pct = apy < 1 ? apy * 100 : apy;
  return `${pct.toFixed(2)}%`;
}

export function SavingsCard({ data }: { data: SavingsData }) {
  const supplies =
    data.positions?.filter((p) => p.type === 'supply' && p.valueUsd >= 0.01) ??
    [];
  const borrows =
    data.positions?.filter((p) => p.type === 'borrow' && p.valueUsd >= 0.01) ??
    [];
  const hasEarnings = !!data.earnings && data.earnings.supplied > 0;

  if (!supplies.length && !borrows.length && !hasEarnings) return null;

  const depositedUsd =
    data.earnings?.supplied ??
    supplies.reduce((sum, p) => sum + p.valueUsd, 0);
  const dailyEarning = data.earnings?.dailyEarning ?? 0;
  const yearlyEarning = dailyEarning * 365;

  const isWatched = data.isSelfQuery === false && !!data.address;
  const badge = isWatched ? (
    <AddressBadge address={data.address!} suinsName={data.suinsName} />
  ) : data.earnings ? (
    <span className="font-mono text-[11px] text-muted-foreground tracking-[0.02em]">
      {fmtApy(data.earnings.currentApy)} APY
    </span>
  ) : undefined;

  return (
    <CardShell
      title="NAVI savings"
      live
      badge={badge}
      footer={
        <>
          <span>Compounded daily</span>
          <span>Withdraw any time</span>
        </>
      }
    >
      <div className="space-y-3.5">
        <MetricBlock
          label="Deposited"
          value={`$${fmtUsd(depositedUsd)}`}
          sub={supplies.length === 1 ? `${supplies[0]!.symbol} · NAVI` : 'NAVI'}
        />

        {supplies.length > 0 && (
          <div className="border-border border-t pt-1.5">
            {supplies.map((p) => (
              <AssetRow
                key={`supply-${p.symbol}`}
                symbol={p.symbol}
                sub="deposited"
                amount={p.amount.toLocaleString('en-US', {
                  maximumFractionDigits: 4,
                })}
                value={fmtApy(p.apy)}
                tone="success"
              />
            ))}
          </div>
        )}

        {borrows.length > 0 && (
          <div className="border-border border-t pt-1.5">
            {borrows.map((p) => (
              <AssetRow
                key={`borrow-${p.symbol}`}
                symbol={p.symbol}
                sub="borrowed"
                amount={`$${fmtUsd(p.valueUsd)}`}
                value={fmtApy(p.apy)}
                tone="warning"
              />
            ))}
          </div>
        )}

        {hasEarnings && dailyEarning > 0 && (
          <div className="border-border border-t pt-1">
            <QRow label="Per year" tone="up">
              +{fmtYield(yearlyEarning)}
            </QRow>
            <QRow label="Per day" tone="up">
              +{fmtYield(dailyEarning)}
            </QRow>
          </div>
        )}
      </div>
    </CardShell>
  );
}
