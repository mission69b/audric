'use client';

import { useState, useEffect } from 'react';
import { fmtUsd } from '../primitives';

interface FullPortfolioData {
  available: true;
  address: string;
  currentSavings?: number;
  currentDebt?: number;
  healthFactor?: number | null;
  savingsRate?: number;
}

interface Props {
  data: FullPortfolioData | { available: false; message?: string };
  onAction?: (text: string) => void;
}

interface PanelData {
  heatmap: { totalEvents: number; activeDays: number } | null;
  spending: { totalSpent: number; requestCount: number; serviceCount: number } | null;
  walletUsd: number;
}

export function FullPortfolioCanvas({ data, onAction }: Props) {
  const [panelData, setPanelData] = useState<PanelData>({ heatmap: null, spending: null, walletUsd: 0 });
  const [loading, setLoading] = useState(false);

  const address = 'available' in data && data.available ? data.address : null;

  useEffect(() => {
    if (!address) return;
    setLoading(true);

    const hdrs = { 'x-sui-address': address };
    Promise.all([
      fetch(`/api/analytics/activity-heatmap?days=30`, { headers: hdrs })
        .then((r) => r.json())
        .then((d) => d.summary ?? null)
        .catch(() => null),
      fetch(`/api/analytics/spending?period=month`, { headers: hdrs })
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/balances?address=${address}`)
        .then((r) => r.json())
        .then((d) => {
          const usdc = typeof d.USDC === 'number' ? d.USDC : 0;
          const sui = typeof d.SUI === 'number' ? d.SUI : 0;
          return usdc + sui;
        })
        .catch(() => 0),
    ])
      .then(([heatmap, spending, walletUsd]) => {
        setPanelData({ heatmap, spending, walletUsd: walletUsd as number });
      })
      .finally(() => setLoading(false));
  }, [address]);

  if (!('available' in data) || !data.available) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center">
        <span className="text-3xl">📋</span>
        <p className="text-sm text-foreground font-medium">Full Portfolio</p>
        <p className="text-xs text-muted max-w-xs leading-relaxed">
          {'message' in data && data.message ? data.message : 'Full portfolio overview is not yet available.'}
        </p>
      </div>
    );
  }

  const savings = data.currentSavings ?? 0;
  const debt = data.currentDebt ?? 0;
  const walletUsd = panelData.walletUsd;
  const netWorth = walletUsd + savings - debt;
  const hf = data.healthFactor;
  const apy = data.savingsRate ?? 0;

  return (
    <div className="space-y-4">
      {/* Net worth header */}
      <div className="space-y-0.5">
        <span className="font-mono text-[10px] tracking-wider text-dim uppercase">Net Worth</span>
        <div className="font-mono text-xl text-foreground font-medium">
          ${fmtUsd(netWorth)}
        </div>
      </div>

      {/* 4-panel grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Panel 1: Savings + Yield */}
        <PanelCard
          title="Savings"
          onClick={() => onAction?.('Show me the yield projector')}
        >
          <div className="font-mono text-sm text-foreground font-medium">${fmtUsd(savings)}</div>
          {apy > 0 && (
            <div className="font-mono text-[10px] text-success">{apy.toFixed(2)}% APY</div>
          )}
        </PanelCard>

        {/* Panel 2: Health Factor */}
        <PanelCard
          title="Health"
          onClick={() => onAction?.('Open the health factor simulator')}
        >
          {debt > 0 ? (
            <>
              <div className={`font-mono text-sm font-medium ${hfColor(hf)}`}>
                {hf != null ? hf.toFixed(2) : '∞'}
              </div>
              <div className="font-mono text-[10px] text-dim">
                ${fmtUsd(debt)} debt
              </div>
            </>
          ) : (
            <>
              <div className="font-mono text-sm text-success font-medium">No debt</div>
              <div className="font-mono text-[10px] text-dim">Safe</div>
            </>
          )}
        </PanelCard>

        {/* Panel 3: Activity */}
        <PanelCard
          title="Activity (30d)"
          onClick={() => onAction?.('Show my activity heatmap')}
        >
          {loading ? (
            <div className="font-mono text-xs text-dim animate-pulse">...</div>
          ) : panelData.heatmap ? (
            <>
              <div className="font-mono text-sm text-foreground font-medium">{panelData.heatmap.totalEvents}</div>
              <div className="font-mono text-[10px] text-dim">{panelData.heatmap.activeDays} active days</div>
            </>
          ) : (
            <div className="font-mono text-xs text-dim">No data</div>
          )}
        </PanelCard>

        {/* Panel 4: Spending */}
        <PanelCard
          title="Spending"
          onClick={() => onAction?.('Show my spending breakdown')}
        >
          {loading ? (
            <div className="font-mono text-xs text-dim animate-pulse">...</div>
          ) : panelData.spending && panelData.spending.totalSpent > 0 ? (
            <>
              <div className="font-mono text-sm text-foreground font-medium">${fmtUsd(panelData.spending.totalSpent)}</div>
              <div className="font-mono text-[10px] text-dim">{panelData.spending.requestCount} requests</div>
            </>
          ) : (
            <div className="font-mono text-xs text-dim">$0.00</div>
          )}
        </PanelCard>
      </div>

      {/* Quick breakdown */}
      <div className="space-y-1 font-mono text-xs">
          <div className="flex justify-between">
            <span className="text-dim">Wallet</span>
            <span className="text-foreground">${fmtUsd(walletUsd)}</span>
          </div>
        <div className="flex justify-between">
          <span className="text-dim">Savings</span>
          <span className="text-success">${fmtUsd(savings)}</span>
        </div>
        {debt > 0 && (
          <div className="flex justify-between">
            <span className="text-dim">Debt</span>
            <span className="text-error">-${fmtUsd(debt)}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {onAction && (
        <div className="flex gap-2">
          <button
            onClick={() => onAction('Show my portfolio timeline')}
            className="flex-1 rounded-md border border-border py-1.5 font-mono text-[10px] tracking-wider uppercase text-muted hover:text-foreground hover:border-foreground/30 transition"
          >
            Timeline →
          </button>
          <button
            onClick={() => onAction('Give me a full financial report')}
            className="flex-1 rounded-md bg-foreground py-1.5 font-mono text-[10px] tracking-wider text-background uppercase hover:opacity-90 transition"
          >
            Full report →
          </button>
        </div>
      )}
    </div>
  );
}

function PanelCard({ title, children, onClick }: { title: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-border bg-background p-3 text-left space-y-1 hover:border-foreground/20 transition group"
    >
      <span className="font-mono text-[9px] tracking-wider text-dim uppercase group-hover:text-muted transition">
        {title} →
      </span>
      {children}
    </button>
  );
}

function hfColor(hf: number | null | undefined): string {
  if (hf == null) return 'text-success';
  if (hf < 1.2) return 'text-error';
  if (hf < 1.5) return 'text-warning';
  if (hf < 2.0) return 'text-foreground';
  return 'text-success';
}
