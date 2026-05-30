"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { usePortfolio } from "@/hooks/use-portfolio";
import { fmtUsd } from "../primitives";
import {
  AllocBar,
  CanvasButton,
  CanvasFooterMeta,
  CanvasMetric,
  CanvasMetricGrid,
  CanvasShell,
} from "./canvas-shell";

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
  defiValueUsd: number;
  defiSource: "blockvision" | "partial" | "partial-stale" | "degraded";
  defiPricedAt?: number;
  positions: {
    savings: number;
    borrows: number;
    savingsRate: number;
    healthFactor: number | null;
  };
}

interface PanelData {
  heatmap: { totalEvents: number; activeDays: number } | null;
  spending: {
    totalSpent: number;
    requestCount: number;
    serviceCount: number;
  } | null;
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
    netWorthUsd: number;
    walletValueUsd: number;
    positions: {
      savings: number;
      borrows: number;
      savingsRate: number;
      healthFactor: number | null;
    };
  }>;
}

type WalletTab = "all" | string;

export function FullPortfolioCanvas({ data, onAction }: Props) {
  const [panelData, setPanelData] = useState<PanelData>({
    heatmap: null,
    spending: null,
  });
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  // [S.264 — 2026-05-23] `setMultiData` deleted alongside the dead
  // `/api/analytics/portfolio-multi` fetch — that route was archived
  // with apps/web in S.253 and the LinkedWallet table it queried was
  // dropped in S.254, so the response will always be null. We keep the
  // multi-wallet UI scaffolding (~30 references, conditional renders
  // gated on `hasMultiWallet`) inert rather than ripping it out, since
  // the canvas may host genuine multi-wallet data again post-Audric
  // Passport (linked Sui-native wallet flows, not the retired model).
  const [multiData] = useState<MultiWalletData | null>(null);
  const [activeTab, setActiveTab] = useState<WalletTab>("primary");

  const address =
    data && typeof data === "object" && "available" in data && data.available
      ? data.address
      : null;
  const hasMultiWallet = !!multiData && multiData.wallets.length > 1;

  // [S.282 — 2026-05-23] Portfolio fetch moved off the local Promise.all
  // onto the canonical `usePortfolio` SWR cache (keyed on
  // `portfolio:${address}`). Same cache entry as BalanceHero +
  // WatchAddressCanvas — opening this canvas for an address that's
  // already been fetched in this session renders instantly. The heatmap
  // and spending fetches stay local (separate concerns, separate
  // endpoints, separate audit follow-ups).
  const { data: portfolioPayload } = usePortfolio(address);
  const livePortfolio = useMemo<CanonicalPortfolio | null>(() => {
    if (!portfolioPayload || typeof portfolioPayload.netWorthUsd !== "number") {
      return null;
    }
    return {
      netWorthUsd: portfolioPayload.netWorthUsd,
      walletValueUsd: portfolioPayload.walletValueUsd ?? 0,
      defiValueUsd: portfolioPayload.defiValueUsd ?? 0,
      defiSource:
        (portfolioPayload.defiSource as CanonicalPortfolio["defiSource"]) ??
        "degraded",
      defiPricedAt:
        typeof portfolioPayload.defiPricedAt === "number"
          ? portfolioPayload.defiPricedAt
          : undefined,
      positions: {
        savings: portfolioPayload.positions?.savings ?? 0,
        borrows: portfolioPayload.positions?.borrows ?? 0,
        savingsRate: portfolioPayload.positions?.savingsRate ?? 0,
        healthFactor: portfolioPayload.positions?.healthFactor ?? null,
      },
    };
  }, [portfolioPayload]);

  useEffect(() => {
    if (!address) {
      return;
    }
    setAnalyticsLoading(true);
    Promise.all([
      authFetch(`/api/analytics/activity-heatmap?days=30&address=${address}`)
        .then((r) => r.json())
        .then((d) => d.summary ?? null)
        .catch(() => null),
      authFetch(`/api/analytics/spending?period=month&address=${address}`)
        .then((r) => r.json())
        .catch(() => null),
      // [S.264 — 2026-05-23] `/api/analytics/portfolio-multi` removed.
      // The route was archived with apps/web in S.253 and the
      // LinkedWallet table it queried was dropped in S.254 — there's
      // no data source to revive. Multi-wallet UI scaffolding stays
      // inert (gated on `hasMultiWallet` which is now permanently
      // false) until linked-wallet support returns post-Audric
      // Passport.
    ])
      .then(([heatmap, spending]) => {
        setPanelData({ heatmap, spending });
      })
      .finally(() => setAnalyticsLoading(false));
  }, [address]);

  if (
    !data ||
    typeof data !== "object" ||
    !("available" in data) ||
    !data.available
  ) {
    return (
      <div className="flex flex-col items-center justify-center space-y-2 py-10 text-center">
        <span className="text-3xl">📋</span>
        <p className="font-medium text-foreground text-sm">Full Portfolio</p>
        <p className="max-w-xs text-muted-foreground text-xs leading-relaxed">
          {data &&
          typeof data === "object" &&
          "message" in data &&
          data.message
            ? data.message
            : "Full portfolio overview is not yet available."}
        </p>
      </div>
    );
  }

  const isAllTab = activeTab === "all" && hasMultiWallet && multiData !== null;
  const selectedWallet =
    hasMultiWallet &&
    activeTab !== "all" &&
    activeTab !== "primary" &&
    multiData
      ? (multiData.wallets.find((w) => w.address === activeTab) ?? null)
      : null;

  const savings =
    isAllTab && multiData
      ? multiData.aggregated.savingsUsd
      : selectedWallet
        ? selectedWallet.positions.savings
        : livePortfolio
          ? livePortfolio.positions.savings
          : (data.currentSavings ?? 0);
  const debt =
    isAllTab && multiData
      ? multiData.aggregated.debtUsd
      : selectedWallet
        ? selectedWallet.positions.borrows
        : livePortfolio
          ? livePortfolio.positions.borrows
          : (data.currentDebt ?? 0);
  const walletUsd =
    isAllTab && multiData
      ? multiData.aggregated.walletUsd
      : selectedWallet
        ? selectedWallet.walletValueUsd
        : livePortfolio
          ? livePortfolio.walletValueUsd
          : 0;
  const defi =
    isAllTab || selectedWallet
      ? 0
      : livePortfolio
        ? livePortfolio.defiValueUsd
        : 0;
  const defiSource:
    | "blockvision"
    | "partial"
    | "partial-stale"
    | "degraded" =
    isAllTab || selectedWallet
      ? "degraded"
      : (livePortfolio?.defiSource ?? "degraded");
  const defiPricedAt =
    !(isAllTab || selectedWallet) ? livePortfolio?.defiPricedAt : undefined;
  const defiPositive =
    livePortfolio?.defiValueUsd != null && livePortfolio.defiValueUsd > 0;
  const defiKnown =
    !isAllTab &&
    !selectedWallet &&
    (livePortfolio?.defiSource === "blockvision" ||
      livePortfolio?.defiSource === "partial-stale" ||
      (livePortfolio?.defiSource === "partial" && defiPositive));
  const defiIsStale = defiSource === "partial-stale";
  const defiIsPartial = defiSource === "partial" && defiPositive;
  const netWorth =
    isAllTab && multiData
      ? multiData.aggregated.netWorthUsd
      : selectedWallet
        ? selectedWallet.netWorth
        : livePortfolio
          ? livePortfolio.netWorthUsd
          : walletUsd + savings + defi - debt;
  const hf = isAllTab
    ? null
    : selectedWallet
      ? selectedWallet.positions.healthFactor
      : livePortfolio
        ? livePortfolio.positions.healthFactor
        : data.healthFactor;
  const apy = isAllTab
    ? 0
    : selectedWallet
      ? selectedWallet.positions.savingsRate
      : livePortfolio
        ? livePortfolio.positions.savingsRate
        : (data.savingsRate ?? 0);

  const positiveTotal = walletUsd + savings + (defiKnown ? defi : 0);
  const pctOf = (v: number) =>
    positiveTotal > 0 ? (v / positiveTotal) * 100 : 0;
  const allocLabel = (v: number) =>
    `$${fmtUsd(v)} · ${Math.round(pctOf(v))}%`;

  const healthTone: "default" | "up" | "down" =
    debt <= 0 ? "up" : hf != null && hf < 1.5 ? "down" : "default";

  return (
    <CanvasShell
      eyebrow={isAllTab ? "Portfolio · all" : "Portfolio"}
      footer={
        onAction ? (
          <>
            <CanvasFooterMeta>
              {apy > 0 ? `Avg APY ${(apy * 100).toFixed(2)}%` : "Net worth + allocation"}
            </CanvasFooterMeta>
            <CanvasButton
              onClick={() => onAction("Show my portfolio timeline")}
              variant="secondary"
            >
              Timeline →
            </CanvasButton>
            <CanvasButton
              onClick={() => onAction("Give me a full financial report")}
              variant="primary"
            >
              Full report →
            </CanvasButton>
          </>
        ) : undefined
      }
      live
      name={`$${fmtUsd(netWorth)}`}
    >
      {hasMultiWallet && multiData && (
        <div className="-mt-1 mb-4 flex gap-1 overflow-x-auto pb-1">
          <TabButton
            active={activeTab === "all"}
            label="All Wallets"
            onClick={() => setActiveTab("all")}
          />
          {multiData.wallets.map((w) => (
            <TabButton
              active={activeTab === (w.isPrimary ? "primary" : w.address)}
              key={w.address}
              label={w.label ?? `${w.address.slice(0, 6)}...`}
              onClick={() => setActiveTab(w.isPrimary ? "primary" : w.address)}
            />
          ))}
        </div>
      )}

      <CanvasMetricGrid cols={4}>
        <CanvasMetric label="Savings" value={`$${fmtUsd(savings)}`} />
        <CanvasMetric
          label="Health"
          tone={healthTone}
          value={debt > 0 ? (hf != null ? hf.toFixed(2) : "∞") : "None"}
        />
        <CanvasMetric
          label="Activity 30d"
          value={
            analyticsLoading ? "…" : (panelData.heatmap?.totalEvents ?? 0)
          }
        />
        <CanvasMetric
          label="API spend"
          value={
            analyticsLoading
              ? "…"
              : `$${fmtUsd(panelData.spending?.totalSpent ?? 0)}`
          }
        />
      </CanvasMetricGrid>

      <div className="mt-[22px] flex flex-col gap-2.5">
        <AllocBar
          name="Wallet"
          pct={pctOf(walletUsd)}
          tier={1}
          valueLabel={allocLabel(walletUsd)}
        />
        <AllocBar
          name="Savings"
          pct={pctOf(savings)}
          tier={2}
          valueLabel={allocLabel(savings)}
        />
        {defiKnown && defi > 0 && (
          <AllocBar
            name="DeFi"
            pct={pctOf(defi)}
            tier={3}
            valueLabel={
              defiIsStale && defiPricedAt
                ? `$${fmtUsd(defi)} · ${Math.max(0, Math.round((Date.now() - defiPricedAt) / 60_000))}m`
                : defiIsPartial
                  ? `$${fmtUsd(defi)} · partial`
                  : allocLabel(defi)
            }
          />
        )}
      </div>

      {(debt > 0 ||
        (!(isAllTab || selectedWallet) &&
          (defiIsStale || defiIsPartial || !defiKnown))) && (
        <div className="mt-4 flex flex-col gap-1 border-border border-t pt-3 font-mono text-[11px]">
          {debt > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Debt</span>
              <span className="text-destructive">-${fmtUsd(debt)}</span>
            </div>
          )}
          {!(isAllTab || selectedWallet) && defiIsStale && defiPricedAt && (
            <div className="text-warning leading-snug">
              DeFi cached{" "}
              {Math.max(0, Math.round((Date.now() - defiPricedAt) / 60_000))}m
              ago — live fetch failed, showing last known value.
            </div>
          )}
          {!(isAllTab || selectedWallet) && defiIsPartial && (
            <div className="text-muted-foreground leading-snug">
              DeFi partial — at least one protocol failed; figure is a lower
              bound.
            </div>
          )}
          {!defiKnown && !(isAllTab || selectedWallet) && (
            <div className="text-muted-foreground leading-snug">
              DeFi unreachable — net worth may under-count.
            </div>
          )}
        </div>
      )}

      {isAllTab && multiData && (
        <div className="mt-4 flex flex-col gap-1.5 border-border border-t pt-3">
          <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
            Per Wallet
          </span>
          {multiData.wallets.map((w) => (
            <button
              className="flex w-full items-center justify-between rounded px-1 py-1 text-left font-mono text-xs transition hover:bg-accent"
              key={w.address}
              onClick={() => setActiveTab(w.isPrimary ? "primary" : w.address)}
              type="button"
            >
              <span className="truncate text-muted-foreground">
                {w.label ?? `${w.address.slice(0, 6)}...${w.address.slice(-4)}`}
              </span>
              <span className="text-foreground">${fmtUsd(w.netWorth)}</span>
            </button>
          ))}
        </div>
      )}
    </CanvasShell>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      className={`shrink-0 rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition ${
        active
          ? "bg-foreground/10 text-foreground"
          : "text-muted-foreground hover:text-muted-foreground"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
