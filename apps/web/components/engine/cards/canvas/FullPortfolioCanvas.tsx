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

interface MultiWalletData {
  aggregated: {
    netWorthUsd: number;
    walletUsd: number;
    savingsUsd: number;
    debtUsd: number;
    estimatedDailyYield: number;
  };
  wallets: Array<{
    address: string;
    label: string | null;
    isPrimary: boolean;
    netWorth: number;
    wallet: { totalUsd: number };
    positions: { savings: number; borrows: number; savingsRate: number; healthFactor: number | null };
  }>;
}

type WalletTab = 'all' | string;

export function FullPortfolioCanvas({ data, onAction }: Props) {
  const [panelData, setPanelData] = useState<PanelData>({ heatmap: null, spending: null, walletUsd: 0 });
  const [loading, setLoading] = useState(false);
  const [multiData, setMultiData] = useState<MultiWalletData | null>(null);
  const [activeTab, setActiveTab] = useState<WalletTab>('primary');

  const address = 'available' in data && data.available ? data.address : null;
  const hasMultiWallet = multiData && multiData.wallets.length > 1;

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
      fetch(`/api/analytics/portfolio-multi`, { headers: hdrs })
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null),
    ])
      .then(([heatmap, spending, walletUsd, multi]) => {
        setPanelData({ heatmap, spending, walletUsd: walletUsd as number });
        if (multi?.wallets?.length > 1) setMultiData(multi);
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

  const isAllTab = activeTab === 'all' && hasMultiWallet;
  const selectedWallet = hasMultiWallet && activeTab !== 'all' && activeTab !== 'primary'
    ? multiData.wallets.find((w) => w.address === activeTab)
    : null;

  const savings = isAllTab ? multiData!.aggregated.savingsUsd
    : selectedWallet ? selectedWallet.positions.savings
    : data.currentSavings ?? 0;
  const debt = isAllTab ? multiData!.aggregated.debtUsd
    : selectedWallet ? selectedWallet.positions.borrows
    : data.currentDebt ?? 0;
  const walletUsd = isAllTab ? multiData!.aggregated.walletUsd
    : selectedWallet ? selectedWallet.wallet.totalUsd
    : panelData.walletUsd;
  const netWorth = isAllTab ? multiData!.aggregated.netWorthUsd
    : selectedWallet ? selectedWallet.netWorth
    : walletUsd + savings - debt;
  const hf = isAllTab ? null
    : selectedWallet ? selectedWallet.positions.healthFactor
    : data.healthFactor;
  const apy = isAllTab ? 0
    : selectedWallet ? selectedWallet.positions.savingsRate
    : data.savingsRate ?? 0;

  return (
    <div className="space-y-4">
      {/* Multi-wallet tab bar */}
      {hasMultiWallet && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          <TabButton
            active={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
            label="All Wallets"
          />
          {multiData.wallets.map((w) => (
            <TabButton
              key={w.address}
              active={activeTab === (w.isPrimary ? 'primary' : w.address)}
              onClick={() => setActiveTab(w.isPrimary ? 'primary' : w.address)}
              label={w.label ?? `${w.address.slice(0, 6)}...`}
            />
          ))}
        </div>
      )}

      {/* Net worth header */}
      <div className="space-y-0.5">
        <span className="font-mono text-[10px] tracking-wider text-dim uppercase">
          {isAllTab ? 'Total Net Worth' : 'Net Worth'}
        </span>
        <div className="font-mono text-xl text-foreground font-medium">
          ${fmtUsd(netWorth)}
        </div>
      </div>

      {/* 4-panel grid */}
      <div className="grid grid-cols-2 gap-2">
        <PanelCard
          title="Savings"
          onClick={() => onAction?.('Show me the yield projector')}
        >
          <div className="font-mono text-sm text-foreground font-medium">${fmtUsd(savings)}</div>
          {apy > 0 && (
            <div className="font-mono text-[10px] text-success">{apy.toFixed(2)}% APY</div>
          )}
        </PanelCard>

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

      {/* Per-wallet breakdown when "All" tab is active */}
      {isAllTab && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          <span className="font-mono text-[9px] tracking-wider text-dim uppercase">Per Wallet</span>
          {multiData.wallets.map((w) => (
            <button
              key={w.address}
              onClick={() => setActiveTab(w.isPrimary ? 'primary' : w.address)}
              className="flex items-center justify-between w-full text-left font-mono text-xs py-1 hover:bg-surface rounded px-1 transition"
            >
              <span className="text-muted truncate">{w.label ?? `${w.address.slice(0, 6)}...${w.address.slice(-4)}`}</span>
              <span className="text-foreground">${fmtUsd(w.netWorth)}</span>
            </button>
          ))}
        </div>
      )}

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

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-md px-2.5 py-1 font-mono text-[10px] tracking-wider uppercase transition ${
        active
          ? 'bg-foreground/10 text-foreground'
          : 'text-dim hover:text-muted'
      }`}
    >
      {label}
    </button>
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
