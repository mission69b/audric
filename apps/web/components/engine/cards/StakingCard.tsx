'use client';

import { CardShell, DetailRow, fmtAmt } from './primitives';

interface StakingData {
  apy: number;
  exchangeRate: number;
  totalStaked: number;
  totalVSui: number;
}

function fmtLargeNumber(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return fmtAmt(n, 0);
}

export function StakingCard({ data }: { data: StakingData }) {
  const apyPct = data.apy < 1 ? data.apy * 100 : data.apy;

  return (
    <CardShell title="Volo Staking">
      <div className="text-center mb-3">
        <span className="text-2xl font-semibold font-mono text-fg-primary">{apyPct.toFixed(2)}%</span>
        <div className="text-[10px] font-mono text-fg-muted uppercase tracking-wider mt-0.5">APY</div>
      </div>

      <div className="space-y-1 font-mono text-[11px]">
        <DetailRow label="Exchange Rate">1 vSUI = {fmtAmt(data.exchangeRate, 4)} SUI</DetailRow>
        <DetailRow label="Total Staked">{fmtLargeNumber(data.totalStaked)} SUI</DetailRow>
        <DetailRow label="Total vSUI">{fmtLargeNumber(data.totalVSui)}</DetailRow>
      </div>
    </CardShell>
  );
}
