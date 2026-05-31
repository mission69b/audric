'use client';

import { useState } from 'react';
import { AddressBadge, CardShell, fmtUsd } from './primitives';
import { APYBlock, AssetRow } from './shared';

// ───────────────────────────────────────────────────────────────────────────
// BalanceCardV2 — `balance_check` tool renderer.
//
// [R6.4 / A3 — 2026-05-30] Rebuilt to the phase2 wallet-card spec
// (`t2000-AFI/audric/phase2-wallet-card.html`): a sectioned card —
// Wallet (AssetRows + a collapsible dust expander for sub-$1 tokens),
// NAVI savings (live dot + APY callout), and a Debt section that only
// appears when debt > 0 (and picks up amber). Total/Net lands in the
// dashed footer. Read-only per the phase2 read-card contract — no
// mutating action buttons (those live on the canvas). Data shape +
// derivations preserved from the prior `apps/web` port.
//
// The `variant?: 'default' | 'post-write'` prop is accepted for API
// forward-compatibility; the post-write surface is deferred. Until then
// it is a no-op.
// ───────────────────────────────────────────────────────────────────────────

const DUST_FLOOR_USD = 0.01;
const DUST_CEILING_USD = 1;

interface Holding {
  symbol: string;
  balance: number;
  usdValue: number;
}

// [#5 — per-asset savings/debt] One NAVI position row (USDC vs USDsui).
// Surfaced by `balance_check` (@t2000/engine ≥ 4.1.0). Optional so older
// engine payloads (and the SDK-agent fallback path) degrade gracefully to
// the aggregate-USD USDC row.
interface PositionAsset {
  symbol: string;
  amount: number;
  valueUsd: number;
}

export interface BalanceCardV2Data {
  available?: number;
  savings?: number;
  debt?: number;
  total?: number;
  defi?: number;
  defiByProtocol?: Record<string, number>;
  defiSource?: 'blockvision' | 'partial' | 'partial-stale' | 'degraded';
  defiPricedAt?: number;
  holdings?: Holding[];
  saveableUsdc?: number;
  saveableUsdsui?: number;
  savingsAssets?: PositionAsset[];
  debtAssets?: PositionAsset[];
  address?: string;
  isSelfQuery?: boolean;
  suinsName?: string | null;
}

interface BalanceCardV2Props {
  data: BalanceCardV2Data;
  /** Default APY (bps) for the USDC NAVI pool (~462 bps / 4.62%). */
  defaultUsdcApyBps?: number;
  /** Default APY (bps) for the USDsui NAVI pool (~520 bps / 5.20%). */
  defaultUsdsuiApyBps?: number;
  /** Reserved for the post-write refresh surface. No-op today. */
  variant?: 'default' | 'post-write';
}

const SECTION_TAG =
  'inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground';
const SECTION_SUB =
  'font-mono text-[10.5px] tracking-[0.04em] text-muted-foreground';

function SectionHeader({
  label,
  sub,
  live,
  tone,
}: {
  label: string;
  sub?: string;
  live?: boolean;
  tone?: 'default' | 'warning';
}) {
  const isWarn = tone === 'warning';
  return (
    <div className="mb-1 flex items-center justify-between">
      <span className={`${SECTION_TAG} ${isWarn ? 'text-warning' : ''}`}>
        <span
          className={
            isWarn
              ? 'h-1 w-1 rounded-full bg-warning'
              : live
                ? 'h-1 w-1 rounded-full bg-signal'
                : 'h-1 w-1 rounded-full bg-muted-foreground'
          }
        />
        {label}
      </span>
      {sub && (
        <span className={`${SECTION_SUB} ${isWarn ? 'text-warning' : ''}`}>
          {sub}
        </span>
      )}
    </div>
  );
}

export function BalanceCardV2({
  data,
  defaultUsdcApyBps = 462,
  defaultUsdsuiApyBps = 520,
}: BalanceCardV2Props) {
  const [dustOpen, setDustOpen] = useState(false);

  const allHoldings = (data.holdings ?? [])
    .filter((h) => h.usdValue >= DUST_FLOOR_USD)
    .sort((a, b) => b.usdValue - a.usdValue);
  const mainHoldings = allHoldings.filter((h) => h.usdValue >= DUST_CEILING_USD);
  const dustHoldings = allHoldings.filter((h) => h.usdValue < DUST_CEILING_USD);
  const dustSum = dustHoldings.reduce((sum, h) => sum + h.usdValue, 0);

  const holdingsSumUsd = allHoldings.reduce((sum, h) => sum + h.usdValue, 0);
  const walletUsd =
    data.available != null && data.available > 0
      ? data.available
      : holdingsSumUsd;

  const savingsUsd = data.savings ?? 0;
  const debtUsd = data.debt ?? 0;
  const totalUsd =
    data.total ?? walletUsd + savingsUsd + (data.defi ?? 0) - debtUsd;

  const isWatched = data.isSelfQuery === false && !!data.address;
  const badge = isWatched ? (
    <AddressBadge address={data.address!} suinsName={data.suinsName} />
  ) : undefined;

  // [#5] Real per-asset rows when the engine provides them; otherwise the
  // render falls back to a single aggregate USDC row (older engine / SDK
  // fallback path that carries no per-asset breakdown).
  const savingsRows = data.savingsAssets ?? [];
  const debtRows = data.debtAssets ?? [];

  const hasSavings = savingsUsd > 0;
  const showUsdcApyHint = !hasSavings && (data.saveableUsdc ?? 0) > 0;
  const showUsdsuiApyHint = !hasSavings && (data.saveableUsdsui ?? 0) > 0;
  const showAnyApyHint = showUsdcApyHint || showUsdsuiApyHint;
  const hasDebt = debtUsd > 0;

  return (
    <CardShell
      title="Wallet & savings"
      badge={badge}
      footer={
        <>
          <span>{hasDebt ? 'Net' : 'Total'}</span>
          <span className="font-medium text-foreground text-sm">
            ${fmtUsd(totalUsd)}
          </span>
        </>
      }
    >
      <div className="space-y-4">
        {/* WALLET SECTION */}
        <div>
          <SectionHeader label="Wallet" sub={`$${fmtUsd(walletUsd)}`} />
          {mainHoldings.length > 0 ? (
            <div>
              {mainHoldings.map((h) => (
                <AssetRow
                  key={h.symbol}
                  symbol={h.symbol}
                  amount={h.balance.toLocaleString('en-US', {
                    maximumFractionDigits: 4,
                  })}
                  value={`$${fmtUsd(h.usdValue)}`}
                />
              ))}
              {dustOpen &&
                dustHoldings.map((h) => (
                  <AssetRow
                    dim
                    key={h.symbol}
                    symbol={h.symbol}
                    amount={h.balance.toLocaleString('en-US', {
                      maximumFractionDigits: 4,
                    })}
                    value={`$${fmtUsd(h.usdValue)}`}
                  />
                ))}
            </div>
          ) : (
            <div className="text-muted-foreground text-xs italic">
              No holdings
            </div>
          )}

          {/* DUST EXPANDER — toggles open/closed (collapsible both ways) */}
          {dustHoldings.length > 0 && (
            <button
              aria-expanded={dustOpen}
              className="mt-2 flex w-full items-center justify-between rounded-md border border-border border-dashed bg-muted px-3 py-2 transition-colors hover:border-[var(--border-strong)]"
              onClick={() => setDustOpen((open) => !open)}
              type="button"
            >
              <span className="font-mono text-[11px] text-muted-foreground tracking-[0.04em]">
                {dustOpen
                  ? "− show less"
                  : `+ ${dustHoldings.length} more · dust under $1`}
              </span>
              <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
                ${fmtUsd(dustSum)}
              </span>
            </button>
          )}
        </div>

        {/* SAVINGS SECTION */}
        {(hasSavings || showAnyApyHint) && (
          <div className="border-border border-t pt-3">
            <SectionHeader
              label="NAVI savings"
              live
              sub={hasSavings ? `$${fmtUsd(savingsUsd)}` : undefined}
            />
            {hasSavings &&
              (savingsRows.length > 0 ? (
                savingsRows.map((a) => (
                  <AssetRow
                    amount={a.amount.toLocaleString('en-US', {
                      maximumFractionDigits: 4,
                    })}
                    key={a.symbol}
                    sub="deposited"
                    symbol={a.symbol}
                    value={`$${fmtUsd(a.valueUsd)}`}
                  />
                ))
              ) : (
                <AssetRow
                  amount={fmtUsd(savingsUsd)}
                  sub="deposited"
                  symbol="USDC"
                  value={`$${fmtUsd(savingsUsd)}`}
                />
              ))}
            {showAnyApyHint && (
              <div className="space-y-1 pt-2">
                {showUsdcApyHint && (
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      Saveable
                    </span>
                    <APYBlock asset="USDC" apyBps={defaultUsdcApyBps} />
                  </div>
                )}
                {showUsdsuiApyHint && (
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      Saveable
                    </span>
                    <APYBlock asset="USDsui" apyBps={defaultUsdsuiApyBps} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* DEBT — only when present */}
        {hasDebt && (
          <div className="border-border border-t pt-3">
            <SectionHeader
              label="NAVI debt"
              sub={`−$${fmtUsd(debtUsd)}`}
              tone="warning"
            />
            {debtRows.length > 0 ? (
              debtRows.map((a) => (
                <AssetRow
                  amount={a.amount.toLocaleString('en-US', {
                    maximumFractionDigits: 4,
                  })}
                  key={a.symbol}
                  sub="borrowed"
                  symbol={a.symbol}
                  tone="warning"
                  value={`−$${fmtUsd(a.valueUsd)}`}
                />
              ))
            ) : (
              <AssetRow
                amount={fmtUsd(debtUsd)}
                sub="borrowed"
                symbol="USDC"
                tone="warning"
                value={`−$${fmtUsd(debtUsd)}`}
              />
            )}
          </div>
        )}
      </div>
    </CardShell>
  );
}
