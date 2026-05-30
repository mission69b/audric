'use client';

import { AddressBadge, CardShell, fmtUsd } from './primitives';
import { HFGauge, MetricBlock } from './shared';

// HealthCardV2 — `health_check` tool renderer.
//
// [R6.4 / A3 — 2026-05-30] Rebuilt to the phase2 read-card spec
// (`t2000-AFI/audric/phase2-read-cards.html` R2): the compact HFGauge
// dial beside a 2-up MetricBlock grid (collateral / debt / borrow
// capacity / liq. threshold), with a zone-status footer. Data shape +
// HF-resolution logic preserved from the prior `apps/web` port.

const DEBT_DUST_USD = 0.01;

export interface HealthAssetRow {
  symbol: string;
  amount: number;
  valueUsd: number;
}

export interface HealthCardV2Data {
  healthFactor: number | null | undefined;
  supplied: number;
  borrowed: number;
  maxBorrow?: number;
  liquidationThreshold?: number;
  address?: string;
  isSelfQuery?: boolean;
  suinsName?: string | null;
  suppliedAssets?: HealthAssetRow[];
  borrowedAssets?: HealthAssetRow[];
}

interface HealthCardV2Props {
  data: HealthCardV2Data;
  /** Reserved for Phase 5c. No-op today. */
  variant?: 'default' | 'post-write';
}

function resolveHFForGauge(
  hf: number | null | undefined,
  borrowed: number
): number {
  if (borrowed <= DEBT_DUST_USD) return Number.POSITIVE_INFINITY;
  if (hf == null || !Number.isFinite(hf)) return Number.POSITIVE_INFINITY;
  return hf;
}

type Zone = 'safe' | 'warn' | 'danger';

function zoneFor(hf: number): Zone {
  if (!Number.isFinite(hf) || hf > 2) return 'safe';
  if (hf >= 1.3) return 'warn';
  return 'danger';
}

const ZONE_DOT: Record<Zone, string> = {
  danger: 'bg-destructive',
  safe: 'bg-success',
  warn: 'bg-warning',
};

const ZONE_TEXT: Record<Zone, string> = {
  danger: 'text-destructive',
  safe: 'text-success',
  warn: 'text-warning',
};

const ZONE_LABEL: Record<Zone, string> = {
  danger: 'At risk',
  safe: 'Safe',
  warn: 'Watch',
};

export function HealthCardV2({ data }: HealthCardV2Props) {
  const hfForGauge = resolveHFForGauge(data.healthFactor, data.borrowed);
  const zone = zoneFor(hfForGauge);
  const liqThreshold =
    data.liquidationThreshold != null && data.liquidationThreshold > 0
      ? data.liquidationThreshold
      : null;
  const isWatched = data.isSelfQuery === false && !!data.address;
  const badge = isWatched ? (
    <AddressBadge address={data.address!} suinsName={data.suinsName} />
  ) : undefined;

  const hasDebt = data.borrowed > DEBT_DUST_USD;
  const hasBorrowingCapacity =
    data.maxBorrow != null &&
    data.maxBorrow > 0 &&
    data.maxBorrow >= data.borrowed;
  const remainingCapacity = hasBorrowingCapacity
    ? Math.max(0, data.maxBorrow! - data.borrowed)
    : null;
  const showLiqThreshold = liqThreshold != null && liqThreshold !== 1.0;

  return (
    <CardShell
      title="NAVI · health"
      live={hasDebt}
      badge={badge}
      footer={
        <span className={`inline-flex items-center gap-2 ${ZONE_TEXT[zone]}`}>
          <span className={`h-[7px] w-[7px] rounded-full ${ZONE_DOT[zone]}`} />
          {ZONE_LABEL[zone]}
        </span>
      }
    >
      <div className="flex items-center gap-[18px]">
        <HFGauge
          healthFactor={hfForGauge}
          liquidationThreshold={liqThreshold ?? 1.0}
          className="shrink-0"
        />
        <div className="grid flex-1 grid-cols-2 gap-x-3.5 gap-y-3.5">
          <MetricBlock
            label="Collateral"
            value={`$${fmtUsd(data.supplied)}`}
            size="sm"
          />
          <MetricBlock
            label="Borrowed"
            value={`$${fmtUsd(data.borrowed)}`}
            size="sm"
            className={hasDebt ? '[&_span:nth-child(2)]:text-warning' : ''}
          />
          {remainingCapacity != null && (
            <MetricBlock
              label="Borrowable"
              value={`$${fmtUsd(remainingCapacity)}`}
              size="sm"
            />
          )}
          {showLiqThreshold && (
            <MetricBlock
              label="Liq. threshold"
              value={liqThreshold!.toFixed(2)}
              size="sm"
            />
          )}
        </div>
      </div>
    </CardShell>
  );
}
