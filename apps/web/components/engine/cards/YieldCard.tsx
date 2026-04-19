'use client';

import { CardShell, fmtTvl } from './primitives';

interface YieldPool {
  pool: string;
  protocol: string;
  apy: number;
  tvl: number;
}

export function YieldCard({ data }: { data: YieldPool[] }) {
  const pools = data.slice(0, 8);
  if (!pools.length) return null;

  return (
    <CardShell title="Top Yields">
      <table className="w-full">
        <thead>
          <tr className="text-fg-muted text-[10px]">
            <th className="text-left font-medium pb-1">Pool</th>
            <th className="text-left font-medium pb-1">Protocol</th>
            <th className="text-right font-medium pb-1">APY</th>
            <th className="text-right font-medium pb-1">TVL</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {pools.map((p, i) => (
            <tr key={i} className="border-t border-border-subtle/50">
              <td className="py-1 text-fg-primary font-medium truncate max-w-[100px]">{p.pool}</td>
              <td className="py-1 text-fg-muted">{p.protocol}</td>
              <td className="py-1 text-right text-success-solid">{p.apy.toFixed(2)}%</td>
              <td className="py-1 text-right text-fg-muted">{fmtTvl(p.tvl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardShell>
  );
}
