'use client';

import { AddressBadge, CardShell, fmtUsd } from './primitives';
import { AssetAmountBlock, APYBlock } from './shared';

// ───────────────────────────────────────────────────────────────────────────
// BalanceCardV2 — `balance_check` tool renderer (design-baseline shape).
//
// Ported from `apps/web/components/engine/cards/BalanceCardV2.tsx` by
// Phase 5a.3 (renderer migration sweep, 2026-05-19). Verbatim except
// import paths.
//
// V1/V2 absorption note (founder lock 2026-05-19, see S.178): this card
// owns the `variant?: 'default' | 'post-write'` API; the `post-write`
// branch is deferred to Phase 5c when the `<PostWriteRefreshSurface>`
// timeline view + `motion/NumberTicker` land alongside it. Until then,
// `variant === 'post-write'` falls through to the V2 default layout —
// the prop is accepted for API forward-compatibility, never invoked in
// web-v2's wiring today.
// ───────────────────────────────────────────────────────────────────────────

interface Holding {
  symbol: string;
  balance: number;
  usdValue: number;
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
  address?: string;
  isSelfQuery?: boolean;
  suinsName?: string | null;
}

interface BalanceCardV2Props {
  data: BalanceCardV2Data;
  /**
   * Default APY in basis points for the USDC NAVI pool (~462 bps / 4.62%).
   */
  defaultUsdcApyBps?: number;
  /**
   * Default APY in basis points for the USDsui NAVI pool (~520 bps / 5.20%).
   */
  defaultUsdsuiApyBps?: number;
  /**
   * Reserved for Phase 5c when PostWriteRefreshSurface lands. No-op today.
   */
  variant?: 'default' | 'post-write';
}

const SECTION_LABEL =
  'text-[9px] font-mono uppercase tracking-[0.14em] text-fg-muted';

function pickHoldings(data: BalanceCardV2Data): Holding[] {
  if (!data.holdings || data.holdings.length === 0) return [];
  return data.holdings
    .filter((h) => h.usdValue >= 0.01)
    .sort((a, b) => b.usdValue - a.usdValue)
    .slice(0, 6);
}

export function BalanceCardV2({
  data,
  defaultUsdcApyBps = 462,
  defaultUsdsuiApyBps = 520,
}: BalanceCardV2Props) {
  const holdings = pickHoldings(data);

  const holdingsSumUsd = holdings.reduce((sum, h) => sum + h.usdValue, 0);
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

  const hasSavings = savingsUsd > 0;
  const showUsdcApyHint = !hasSavings && (data.saveableUsdc ?? 0) > 0;
  const showUsdsuiApyHint = !hasSavings && (data.saveableUsdsui ?? 0) > 0;
  const showAnyApyHint = showUsdcApyHint || showUsdsuiApyHint;

  return (
    <CardShell title="Wallet & savings" badge={badge}>
      <div className="space-y-4">
        {/* WALLET SECTION */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className={SECTION_LABEL}>Wallet</span>
            <span className="text-fg-primary text-xs font-mono tabular-nums">
              ${fmtUsd(walletUsd)}
            </span>
          </div>
          {holdings.length > 0 ? (
            <div className="space-y-1.5">
              {holdings.map((h) => (
                <AssetAmountBlock
                  key={h.symbol}
                  asset={h.symbol}
                  amount={h.balance}
                  usdValue={h.usdValue}
                />
              ))}
            </div>
          ) : (
            <div className="text-fg-muted text-xs italic">No holdings</div>
          )}
        </div>

        {/* SAVINGS SECTION */}
        {(hasSavings || showAnyApyHint) && (
          <div className="pt-3 border-t border-border-subtle">
            <div className="flex items-baseline justify-between mb-2">
              <span className={SECTION_LABEL}>NAVI savings</span>
              {hasSavings && (
                <span className="text-fg-primary text-xs font-mono tabular-nums">
                  ${fmtUsd(savingsUsd)}
                </span>
              )}
            </div>
            {hasSavings && (
              <AssetAmountBlock
                asset="USDC"
                amount={savingsUsd}
                usdValue={savingsUsd}
                label="Total deposited"
              />
            )}
            {showAnyApyHint && (
              <div className="space-y-1 pt-2">
                {showUsdcApyHint && (
                  <div className="flex items-baseline justify-between">
                    <span className="text-fg-muted text-[10px] font-mono uppercase tracking-wider">
                      Saveable
                    </span>
                    <APYBlock asset="USDC" apyBps={defaultUsdcApyBps} />
                  </div>
                )}
                {showUsdsuiApyHint && (
                  <div className="flex items-baseline justify-between">
                    <span className="text-fg-muted text-[10px] font-mono uppercase tracking-wider">
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
        {debtUsd > 0 && (
          <div className="pt-3 border-t border-border-subtle flex items-baseline justify-between">
            <span className={SECTION_LABEL}>Debt</span>
            <span className="text-warning-solid text-xs font-mono tabular-nums">
              ${fmtUsd(debtUsd)}
            </span>
          </div>
        )}

        {/* FOOTER CHIP — total */}
        <div className="pt-3 border-t border-border-subtle flex items-baseline justify-between">
          <span className={SECTION_LABEL}>Total</span>
          <span className="text-fg-primary text-sm font-mono font-medium tabular-nums">
            ${fmtUsd(totalUsd)}
          </span>
        </div>
      </div>
    </CardShell>
  );
}
