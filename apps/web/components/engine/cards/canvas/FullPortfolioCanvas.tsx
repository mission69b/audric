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

interface CanonicalPortfolio {
  netWorthUsd: number;
  walletValueUsd: number;
  /**
   * [Bug — 2026-04-28] Total USD across non-NAVI DeFi positions
   * (Bluefin, Suilend, Cetus, Aftermath, Volo, Walrus, etc). Mirrors
   * the "DeFi" line in `balance_check`. Pre-fix this canvas had no
   * notion of DeFi at all — a wallet with $7,520 in Bluefin+Suilend
   * silently rendered net worth as `wallet + savings - debt` instead
   * of the canonical `wallet + savings + defi - debt`, dropping the
   * DeFi line entirely from the breakdown panel.
   */
  defiValueUsd: number;
  /**
   * [Bug — 2026-04-28] Source of the DeFi read. `blockvision` = all 9
   * protocols responded fresh, `partial` = some failed (under-counts),
   * `degraded` = no API key or every protocol failed (under-counts).
   * Surfaces so we can render a "DeFi —" placeholder with caveat copy
   * when degraded, matching the BalanceCard convention. Pre-fix this
   * route stripped the field, so even a healthy DeFi value never made
   * it to the canvas (route layer ate the data the SSOT produced).
   */
  defiSource: 'blockvision' | 'partial' | 'degraded';
  positions: {
    savings: number;
    borrows: number;
    savingsRate: number;
    healthFactor: number | null;
  };
}

interface PanelData {
  heatmap: { totalEvents: number; activeDays: number } | null;
  spending: { totalSpent: number; requestCount: number; serviceCount: number } | null;
  /**
   * [Bug — 2026-04-27] Canonical portfolio snapshot for the rendered
   * address. Populated by `/api/portfolio?address=...`, which is backed
   * by the same `fetchPortfolio()` call the daily snapshot cron and the
   * portfolio-history fallback use. Pre-fix this canvas stitched
   * together `/api/balances` + engine-seeded position data, which
   * produced wrong numbers for watched addresses (savings hardcoded to
   * 0) and mis-summed wallet value (USDC + raw SUI tokens, no USDsui).
   * `null` while in-flight or on RPC failure → fall back to the
   * engine-seeded data so the card is never blank.
   */
  portfolio: CanonicalPortfolio | null;
}

interface MultiWalletData {
  aggregated: {
    netWorthUsd: number;
    walletUsd: number;
    savingsUsd: number;
    debtUsd: number;
    estimatedDailyYield: number;
  };
  // Each wallet is the canonical {@link Portfolio} shape from
  // `/api/analytics/portfolio-multi`, with two derived fields the
  // route adds on top: `netWorth` (alias of `netWorthUsd`) and
  // `label` / `isPrimary` (linked-wallet metadata).
  wallets: Array<{
    address: string;
    label: string | null;
    isPrimary: boolean;
    netWorth: number;
    netWorthUsd: number;
    walletValueUsd: number;
    positions: { savings: number; borrows: number; savingsRate: number; healthFactor: number | null };
  }>;
}

type WalletTab = 'all' | string;

export function FullPortfolioCanvas({ data, onAction }: Props) {
  const [panelData, setPanelData] = useState<PanelData>({ heatmap: null, spending: null, portfolio: null });
  const [loading, setLoading] = useState(false);
  const [multiData, setMultiData] = useState<MultiWalletData | null>(null);
  const [activeTab, setActiveTab] = useState<WalletTab>('primary');

  const address = 'available' in data && data.available ? data.address : null;
  const hasMultiWallet = multiData && multiData.wallets.length > 1;

  useEffect(() => {
    if (!address) return;
    setLoading(true);

    const hdrs = { 'x-sui-address': address };
    // [Bug — 2026-04-27] Canonical wallet/savings/debt/net-worth comes
    // from `/api/portfolio?address=...` (single source of truth, backed
    // by fetchPortfolio()). Activity + spending are separate concerns
    // so they stay on their own routes. Pre-fix we summed `/api/balances`
    // USDC + raw SUI tokens (broken: SUI is in tokens, not USD) and
    // relied on engine-seeded `currentSavings` which is hardcoded to 0
    // for watched addresses.
    Promise.all([
      fetch(`/api/analytics/activity-heatmap?days=30`, { headers: hdrs })
        .then((r) => r.json())
        .then((d) => d.summary ?? null)
        .catch(() => null),
      fetch(`/api/analytics/spending?period=month`, { headers: hdrs })
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/portfolio?address=${address}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d): CanonicalPortfolio | null =>
          d && typeof d.netWorthUsd === 'number'
            ? {
                netWorthUsd: d.netWorthUsd,
                walletValueUsd: d.walletValueUsd ?? 0,
                // [Bug — 2026-04-28] The route surfaces these fields
                // via the v0.53.2 fix to /api/portfolio. Default to 0/
                // 'degraded' so an older route version (deploy lag,
                // Vercel cache) still degrades gracefully instead of
                // crashing the canvas.
                defiValueUsd: d.defiValueUsd ?? 0,
                defiSource: d.defiSource ?? 'degraded',
                positions: {
                  savings: d.positions?.savings ?? 0,
                  borrows: d.positions?.borrows ?? 0,
                  savingsRate: d.positions?.savingsRate ?? 0,
                  healthFactor: d.positions?.healthFactor ?? null,
                },
              }
            : null,
        )
        .catch(() => null),
      fetch(`/api/analytics/portfolio-multi`, { headers: hdrs })
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null),
    ])
      .then(([heatmap, spending, portfolio, multi]) => {
        setPanelData({ heatmap, spending, portfolio });
        if (multi?.wallets?.length > 1) setMultiData(multi);
      })
      .finally(() => setLoading(false));
  }, [address]);

  if (!('available' in data) || !data.available) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-2 text-center">
        <span className="text-3xl">📋</span>
        <p className="text-sm text-fg-primary font-medium">Full Portfolio</p>
        <p className="text-xs text-fg-secondary max-w-xs leading-relaxed">
          {'message' in data && data.message ? data.message : 'Full portfolio overview is not yet available.'}
        </p>
      </div>
    );
  }

  const isAllTab = activeTab === 'all' && hasMultiWallet;
  const selectedWallet = hasMultiWallet && activeTab !== 'all' && activeTab !== 'primary'
    ? multiData.wallets.find((w) => w.address === activeTab)
    : null;

  // [Bug — 2026-04-27] Resolution order for the single-wallet view:
  //   1) `panelData.portfolio` — live from /api/portfolio (canonical,
  //      always correct for both self and watched addresses).
  //   2) Engine-seeded `data.*` — fallback while the fetch is in flight
  //      or if it failed. Note: `data.currentSavings` is hardcoded to 0
  //      for watched addresses by the engine, so we ONLY trust it as
  //      a fallback, never as the primary value. The /api/portfolio
  //      result must win whenever it resolves.
  const livePortfolio = panelData.portfolio;
  const savings = isAllTab ? multiData!.aggregated.savingsUsd
    : selectedWallet ? selectedWallet.positions.savings
    : livePortfolio ? livePortfolio.positions.savings
    : data.currentSavings ?? 0;
  const debt = isAllTab ? multiData!.aggregated.debtUsd
    : selectedWallet ? selectedWallet.positions.borrows
    : livePortfolio ? livePortfolio.positions.borrows
    : data.currentDebt ?? 0;
  const walletUsd = isAllTab ? multiData!.aggregated.walletUsd
    : selectedWallet ? selectedWallet.walletValueUsd
    : livePortfolio ? livePortfolio.walletValueUsd
    : 0;
  // [Bug — 2026-04-28] DeFi value comes from the same /api/portfolio
  // SSOT response. We only show it for single-wallet views — the
  // multi-wallet "All" tab + linked-wallet route doesn't aggregate
  // DeFi yet (separate follow-up). When degraded, render a "—"
  // placeholder + caveat so users don't read $0 as truth.
  const defi = isAllTab ? 0
    : selectedWallet ? 0
    : livePortfolio ? livePortfolio.defiValueUsd
    : 0;
  const defiSource = isAllTab || selectedWallet
    ? 'degraded' as const
    : livePortfolio?.defiSource ?? 'degraded';
  const defiKnown = !isAllTab && !selectedWallet && livePortfolio?.defiSource === 'blockvision';
  const netWorth = isAllTab ? multiData!.aggregated.netWorthUsd
    : selectedWallet ? selectedWallet.netWorth
    : livePortfolio ? livePortfolio.netWorthUsd
    : walletUsd + savings + defi - debt;
  const hf = isAllTab ? null
    : selectedWallet ? selectedWallet.positions.healthFactor
    : livePortfolio ? livePortfolio.positions.healthFactor
    : data.healthFactor;
  const apy = isAllTab ? 0
    : selectedWallet ? selectedWallet.positions.savingsRate
    : livePortfolio ? livePortfolio.positions.savingsRate
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
        <span className="font-mono text-[10px] tracking-wider text-fg-muted uppercase">
          {isAllTab ? 'Total Net Worth' : 'Net Worth'}
        </span>
        <div className="font-mono text-xl text-fg-primary font-medium">
          ${fmtUsd(netWorth)}
        </div>
      </div>

      {/* 4-panel grid */}
      <div className="grid grid-cols-2 gap-2">
        <PanelCard
          title="Savings"
          onClick={() => onAction?.('Show me the yield projector')}
        >
          <div className="font-mono text-sm text-fg-primary font-medium">${fmtUsd(savings)}</div>
          {apy > 0 && (
            <div className="font-mono text-[10px] text-success-solid">{apy.toFixed(2)}% APY</div>
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
              <div className="font-mono text-[10px] text-fg-muted">
                ${fmtUsd(debt)} debt
              </div>
            </>
          ) : (
            <>
              <div className="font-mono text-sm text-success-solid font-medium">No debt</div>
              <div className="font-mono text-[10px] text-fg-muted">Safe</div>
            </>
          )}
        </PanelCard>

        <PanelCard
          title="Activity (30d)"
          onClick={() => onAction?.('Show my activity heatmap')}
        >
          {loading ? (
            <div className="font-mono text-xs text-fg-muted animate-pulse">...</div>
          ) : panelData.heatmap ? (
            <>
              <div className="font-mono text-sm text-fg-primary font-medium">{panelData.heatmap.totalEvents}</div>
              <div className="font-mono text-[10px] text-fg-muted">{panelData.heatmap.activeDays} active days</div>
            </>
          ) : (
            <div className="font-mono text-xs text-fg-muted">No data</div>
          )}
        </PanelCard>

        <PanelCard
          title="Spending"
          onClick={() => onAction?.('Show my spending breakdown')}
        >
          {loading ? (
            <div className="font-mono text-xs text-fg-muted animate-pulse">...</div>
          ) : panelData.spending && panelData.spending.totalSpent > 0 ? (
            <>
              <div className="font-mono text-sm text-fg-primary font-medium">${fmtUsd(panelData.spending.totalSpent)}</div>
              <div className="font-mono text-[10px] text-fg-muted">{panelData.spending.requestCount} requests</div>
            </>
          ) : (
            <div className="font-mono text-xs text-fg-muted">$0.00</div>
          )}
        </PanelCard>
      </div>

      {/* Quick breakdown */}
      <div className="space-y-1 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-fg-muted">Wallet</span>
          <span className="text-fg-primary">${fmtUsd(walletUsd)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-fg-muted">Savings</span>
          <span className="text-success-solid">${fmtUsd(savings)}</span>
        </div>
        {/*
          [Bug — 2026-04-28] DeFi row. Three states:
            1) `defiKnown` (source === 'blockvision') and value > 0 →
               show the number alongside Wallet/Savings, contributing
               to net worth above. This is the path the user expected
               to see for an external wallet with $7,520 in
               Bluefin+Suilend that was silently absent pre-fix.
            2) `defiKnown` and value === 0 → omit the row to avoid
               clutter for wallets that genuinely have no DeFi.
            3) `!defiKnown` (partial/degraded) → render "—" with a
               muted caveat so the user knows DeFi was unreachable
               and that the net-worth figure under-counts. Mirrors
               the BalanceCard convention from the `balance_check`
               canvas template.
        */}
        {defiKnown && defi > 0 && (
          <div className="flex justify-between">
            <span className="text-fg-muted">DeFi</span>
            <span className="text-fg-primary">${fmtUsd(defi)}</span>
          </div>
        )}
        {!defiKnown && !isAllTab && !selectedWallet && (
          <div className="flex justify-between">
            <span className="text-fg-muted">DeFi</span>
            <span className="text-fg-muted">—</span>
          </div>
        )}
        {debt > 0 && (
          <div className="flex justify-between">
            <span className="text-fg-muted">Debt</span>
            <span className="text-error-solid">-${fmtUsd(debt)}</span>
          </div>
        )}
        {!defiKnown && !isAllTab && !selectedWallet && (
          <div className="pt-1 text-[10px] text-fg-muted leading-snug">
            {defiSource === 'partial'
              ? 'DeFi partially unreachable — net worth may under-count.'
              : 'DeFi unreachable — net worth may under-count.'}
          </div>
        )}
      </div>

      {/* Per-wallet breakdown when "All" tab is active */}
      {isAllTab && (
        <div className="space-y-1.5 pt-2 border-t border-border-subtle">
          <span className="font-mono text-[9px] tracking-wider text-fg-muted uppercase">Per Wallet</span>
          {multiData.wallets.map((w) => (
            <button
              key={w.address}
              onClick={() => setActiveTab(w.isPrimary ? 'primary' : w.address)}
              className="flex items-center justify-between w-full text-left font-mono text-xs py-1 hover:bg-surface-card rounded px-1 transition"
            >
              <span className="text-fg-secondary truncate">{w.label ?? `${w.address.slice(0, 6)}...${w.address.slice(-4)}`}</span>
              <span className="text-fg-primary">${fmtUsd(w.netWorth)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Actions */}
      {onAction && (
        <div className="flex gap-2">
          <button
            onClick={() => onAction('Show my portfolio timeline')}
            className="flex-1 rounded-md border border-border-subtle py-1.5 font-mono text-[10px] tracking-wider uppercase text-fg-secondary hover:text-fg-primary hover:border-fg-primary/30 transition"
          >
            Timeline →
          </button>
          <button
            onClick={() => onAction('Give me a full financial report')}
            className="flex-1 rounded-md bg-fg-primary py-1.5 font-mono text-[10px] tracking-wider text-fg-inverse uppercase hover:opacity-90 transition"
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
          ? 'bg-fg-primary/10 text-fg-primary'
          : 'text-fg-muted hover:text-fg-secondary'
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
      className="rounded-lg border border-border-subtle bg-surface-page p-3 text-left space-y-1 hover:border-fg-primary/20 transition group"
    >
      <span className="font-mono text-[9px] tracking-wider text-fg-muted uppercase group-hover:text-fg-secondary transition">
        {title} →
      </span>
      {children}
    </button>
  );
}

function hfColor(hf: number | null | undefined): string {
  if (hf == null) return 'text-success-solid';
  if (hf < 1.2) return 'text-error-solid';
  if (hf < 1.5) return 'text-warning-solid';
  if (hf < 2.0) return 'text-fg-primary';
  return 'text-success-solid';
}
