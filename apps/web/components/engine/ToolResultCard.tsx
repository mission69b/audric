'use client';

import type { ToolExecution } from '@/lib/engine-types';

interface RateEntry {
  saveApy: number;
  borrowApy: number;
  ltv?: number;
  price?: number;
}

interface BalanceData {
  available?: number;
  savings?: number;
  debt?: number;
  total?: number;
  holdings?: { symbol: string; balance: number; usdValue: number }[];
}

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
}

interface YieldPool {
  pool: string;
  protocol: string;
  apy: number;
  tvl: number;
}

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(2);
}

function CardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface/50 overflow-hidden my-1.5">
      <div className="px-3 py-1.5 border-b border-border">
        <span className="text-[10px] font-mono uppercase tracking-widest text-dim">{title}</span>
      </div>
      <div className="px-3 py-2 text-xs">{children}</div>
    </div>
  );
}

function RatesCard({ data }: { data: Record<string, RateEntry> }) {
  const entries = Object.entries(data)
    .filter(([, v]) => v && typeof v.saveApy === 'number')
    .sort(([, a], [, b]) => b.saveApy - a.saveApy)
    .slice(0, 8);

  if (!entries.length) return null;

  return (
    <CardShell title="Lending Rates">
      <table className="w-full">
        <thead>
          <tr className="text-dim text-[10px]">
            <th className="text-left font-medium pb-1">Asset</th>
            <th className="text-right font-medium pb-1">Supply</th>
            <th className="text-right font-medium pb-1">Borrow</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {entries.map(([symbol, rate]) => (
            <tr key={symbol} className="border-t border-border/50">
              <td className="py-1 text-foreground font-medium">{symbol}</td>
              <td className="py-1 text-right text-emerald-400">{fmtPct(rate.saveApy)}%</td>
              <td className="py-1 text-right text-amber-400">{fmtPct(rate.borrowApy)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardShell>
  );
}

function BalanceCard({ data }: { data: BalanceData }) {
  return (
    <CardShell title="Balance">
      <div className="flex gap-4 mb-2 font-mono">
        {data.total != null && (
          <div>
            <span className="text-dim text-[10px] block">Total</span>
            <span className="text-foreground font-medium">${fmtUsd(data.total)}</span>
          </div>
        )}
        {data.available != null && (
          <div>
            <span className="text-dim text-[10px] block">Cash</span>
            <span className="text-foreground">${fmtUsd(data.available)}</span>
          </div>
        )}
        {(data.savings ?? 0) > 0 && (
          <div>
            <span className="text-dim text-[10px] block">Savings</span>
            <span className="text-emerald-400">${fmtUsd(data.savings!)}</span>
          </div>
        )}
        {(data.debt ?? 0) > 0 && (
          <div>
            <span className="text-dim text-[10px] block">Debt</span>
            <span className="text-amber-400">${fmtUsd(data.debt!)}</span>
          </div>
        )}
      </div>
      {data.holdings && data.holdings.length > 0 && (
        <div className="space-y-0.5 font-mono text-[11px]">
          {data.holdings.slice(0, 6).map((h) => (
            <div key={h.symbol} className="flex justify-between">
              <span className="text-foreground">{h.symbol}</span>
              <span className="text-dim">
                {h.balance.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                {h.usdValue > 0 ? ` · $${fmtUsd(h.usdValue)}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

function SavingsCard({ data }: { data: SavingsData }) {
  const supplies = data.positions?.filter((p) => p.type === 'supply') ?? [];
  const borrows = data.positions?.filter((p) => p.type === 'borrow') ?? [];

  if (!supplies.length && !borrows.length) return null;

  return (
    <CardShell title="Savings Positions">
      {supplies.length > 0 && (
        <table className="w-full mb-1">
          <thead>
            <tr className="text-dim text-[10px]">
              <th className="text-left font-medium pb-1">Supply</th>
              <th className="text-right font-medium pb-1">Amount</th>
              <th className="text-right font-medium pb-1">APY</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {supplies.map((p, i) => (
              <tr key={i} className="border-t border-border/50">
                <td className="py-1 text-foreground font-medium">{p.symbol}</td>
                <td className="py-1 text-right text-dim">
                  {p.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                  {p.valueUsd > 0 ? ` · $${fmtUsd(p.valueUsd)}` : ''}
                </td>
                <td className="py-1 text-right text-emerald-400">{(p.apy * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {borrows.length > 0 && (
        <table className="w-full">
          <thead>
            <tr className="text-dim text-[10px]">
              <th className="text-left font-medium pb-1">Borrow</th>
              <th className="text-right font-medium pb-1">Amount</th>
              <th className="text-right font-medium pb-1">APY</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {borrows.map((p, i) => (
              <tr key={i} className="border-t border-border/50">
                <td className="py-1 text-foreground font-medium">{p.symbol}</td>
                <td className="py-1 text-right text-dim">${fmtUsd(p.valueUsd)}</td>
                <td className="py-1 text-right text-amber-400">{(p.apy * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.earnings && (
        <div className="flex gap-4 mt-2 pt-2 border-t border-border/50 font-mono text-[11px]">
          <div>
            <span className="text-dim block text-[10px]">Blended APY</span>
            <span className="text-emerald-400">{(data.earnings.currentApy * 100).toFixed(2)}%</span>
          </div>
          <div>
            <span className="text-dim block text-[10px]">Daily</span>
            <span className="text-foreground">${data.earnings.dailyEarning.toFixed(4)}</span>
          </div>
        </div>
      )}
    </CardShell>
  );
}

function YieldCard({ data }: { data: YieldPool[] }) {
  const pools = data.slice(0, 8);
  if (!pools.length) return null;

  return (
    <CardShell title="Top Yields">
      <table className="w-full">
        <thead>
          <tr className="text-dim text-[10px]">
            <th className="text-left font-medium pb-1">Pool</th>
            <th className="text-left font-medium pb-1">Protocol</th>
            <th className="text-right font-medium pb-1">APY</th>
            <th className="text-right font-medium pb-1">TVL</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {pools.map((p, i) => (
            <tr key={i} className="border-t border-border/50">
              <td className="py-1 text-foreground font-medium truncate max-w-[100px]">{p.pool}</td>
              <td className="py-1 text-dim">{p.protocol}</td>
              <td className="py-1 text-right text-emerald-400">{p.apy.toFixed(2)}%</td>
              <td className="py-1 text-right text-dim">${(p.tvl / 1e6).toFixed(1)}M</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardShell>
  );
}

const CARD_RENDERERS: Record<string, (result: unknown) => React.ReactNode | null> = {
  rates_info: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <RatesCard data={data as Record<string, RateEntry>} />;
  },
  balance_check: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <BalanceCard data={data as BalanceData} />;
  },
  savings_info: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <SavingsCard data={data as SavingsData} />;
  },
  defillama_yield_pools: (result) => {
    const data = extractData(result);
    if (!Array.isArray(data)) return null;
    return <YieldCard data={data as YieldPool[]} />;
  },
};

function extractData(result: unknown): unknown {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: unknown }).data;
  }
  return result;
}

export function ToolResultCard({ tool }: { tool: ToolExecution }) {
  if (tool.status !== 'done' || !tool.result || tool.isError) return null;

  const renderer = CARD_RENDERERS[tool.toolName];
  if (!renderer) return null;

  try {
    return <>{renderer(tool.result)}</>;
  } catch {
    return null;
  }
}
