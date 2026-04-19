'use client';

import { CardShell, DetailRow, Gauge, StatusBadge, fmtUsd } from './primitives';

interface HealthData {
  healthFactor: number;
  supplied: number;
  borrowed: number;
  maxBorrow?: number;
  liquidationThreshold?: number;
  status?: string;
}

function getHfStatus(hf: number): 'healthy' | 'warning' | 'danger' | 'critical' {
  if (hf < 1.2) return 'critical';
  if (hf < 1.5) return 'danger';
  if (hf < 2.0) return 'warning';
  return 'healthy';
}

export function HealthCard({ data }: { data: HealthData }) {
  const hf = data.healthFactor;
  const status = getHfStatus(hf);

  return (
    <CardShell title="Health Factor" badge={<StatusBadge status={status} />}>
      <div className="text-center mb-2">
        <span className="text-2xl font-semibold font-mono text-fg-primary">{hf.toFixed(2)}</span>
      </div>

      <div className="mb-3">
        <Gauge
          value={hf}
          min={0}
          max={5}
          thresholds={[
            { value: 1.0, label: 'Liq.' },
            { value: hf, label: `You: ${hf.toFixed(1)}` },
          ]}
        />
      </div>

      <div className="space-y-1 font-mono text-[11px]">
        <DetailRow label="Supplied">${fmtUsd(data.supplied)}</DetailRow>
        <DetailRow label="Borrowed">${fmtUsd(data.borrowed)}</DetailRow>
        {data.maxBorrow != null && (
          <DetailRow label="Max Borrow">${fmtUsd(data.maxBorrow)}</DetailRow>
        )}
        {data.liquidationThreshold != null && (
          <DetailRow label="Liq. Threshold">{data.liquidationThreshold.toFixed(2)}</DetailRow>
        )}
      </div>
    </CardShell>
  );
}
