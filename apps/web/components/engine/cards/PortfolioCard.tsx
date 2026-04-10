'use client';

import { CardShell, fmtUsd } from './primitives';

interface PortfolioData {
  totalValue: number;
  walletValue: number;
  savingsValue: number;
  debtValue: number;
  healthFactor: number | null;
  allocations: { symbol: string; amount: number; usdValue: number; percentage: number }[];
  stablePercentage: number;
  insights: { type: string; message: string }[];
}

export function PortfolioCard({ data }: { data: PortfolioData }) {
  return (
    <CardShell title="Portfolio Analysis">
      <div className="flex gap-4 mb-2 font-mono">
        <div>
          <span className="text-dim text-[10px] block">Total</span>
          <span className="text-foreground font-medium">${fmtUsd(data.totalValue)}</span>
        </div>
        <div>
          <span className="text-dim text-[10px] block">Wallet</span>
          <span className="text-foreground">${fmtUsd(data.walletValue)}</span>
        </div>
        {data.savingsValue > 0 && (
          <div>
            <span className="text-dim text-[10px] block">Savings</span>
            <span className="text-emerald-400">${fmtUsd(data.savingsValue)}</span>
          </div>
        )}
        {data.debtValue > 0 && (
          <div>
            <span className="text-dim text-[10px] block">Debt</span>
            <span className="text-amber-400">${fmtUsd(data.debtValue)}</span>
          </div>
        )}
      </div>
      {data.allocations.length > 0 && (
        <div className="space-y-1 mb-2">
          {data.allocations.slice(0, 6).map((a) => (
            <div key={a.symbol} className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-foreground w-12">{a.symbol}</span>
              <div className="flex-1 bg-border/30 rounded-full h-1.5 overflow-hidden">
                <div className="bg-foreground/60 h-full rounded-full" style={{ width: `${Math.min(a.percentage, 100)}%` }} />
              </div>
              <span className="text-dim w-10 text-right">{a.percentage.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
      {data.insights.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-border/50 text-[11px]">
          {data.insights.map((i, idx) => (
            <div key={idx} className={i.type === 'warning' ? 'text-amber-400' : 'text-dim'}>
              {i.type === 'warning' ? '⚠ ' : '→ '}{i.message}
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}
