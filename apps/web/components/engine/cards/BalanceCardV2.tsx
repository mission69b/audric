'use client';

import { AddressBadge, CardShell, fmtUsd } from './primitives';
import { AssetAmountBlock, APYBlock } from './shared';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 37 v0.7a Phase 2 Day 10-11 — BalanceCardV2 (TOOL_UX_DESIGN baseline)
//
// Per TOOL_UX_DESIGN_v07a.md (locked 2026-05-15):
//   Pattern: generative-UI
//   componentKey: `BalanceCard`
//   Shared components: `AssetAmountBlock` × N (one per held token),
//                      `APYBlock` × N (one per NAVI savings deposit pool)
//
// Layout:
//   ┌─────────────────────────────────────────────┐
//   │ Wallet & savings        [watched? badge]    │ (CardShell header)
//   ├─────────────────────────────────────────────┤
//   │ ◇ WALLET                                    │
//   │ ─ AssetAmountBlock per held token, sorted   │
//   │   by USD value desc (max 6 visible)         │
//   ├─────────────────────────────────────────────┤
//   │ ◇ NAVI SAVINGS                              │
//   │ ─ AssetAmountBlock per stable deposit       │
//   │ ─ APYBlock per pool (USDC + USDsui)         │
//   ├─────────────────────────────────────────────┤
//   │ Total · $X (wallet) + $Y (savings) = $Z     │ (footer chip)
//   └─────────────────────────────────────────────┘
//
// Why parallel to BalanceCard.tsx (not a replacement): the existing card
// ships the post-write variant (consumed by PostWriteRefreshSurface),
// watched-address badge, and NumberTicker animation that the V2 layout
// intentionally drops in favor of the design-baseline shape. Side-by-side
// flag-gated rollout (NEXT_PUBLIC_BALANCE_CARD_V2) lets the founder
// review both before the Day 27-28 cutover lands.
//
// What V2 does NOT cover yet (deferred to follow-up if/when needed):
//   - post-write variant — PostWriteRefreshSurface keeps consuming v1
//   - NumberTicker count-up animation — design baseline reads as static
//     primitives; revisit if the founder wants ticker on V2 too
//   - DeFi (non-NAVI) row — design baseline lists wallet + NAVI savings
//     separately; "other DeFi" is a third section consumers can add later
//   - debt — only renders when debt > 0; same simple chip as v1
//
// All data fields and types match the engine `balance_check` tool's
// existing output (no engine change required for V2). The single source
// of truth for the data shape is the BalanceData re-export below.
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
  /**
   * USDC balance available to deposit into NAVI (i.e. USDC the user holds
   * outside their savings deposit). Used to compute the saveable APY hint
   * in the savings section.
   */
  saveableUsdc?: number;
  /**
   * USDsui balance available to deposit into NAVI. Surfaces as a second
   * APYBlock when > 0.
   */
  saveableUsdsui?: number;
  address?: string;
  isSelfQuery?: boolean;
  suinsName?: string | null;
}

interface BalanceCardV2Props {
  data: BalanceCardV2Data;
  /**
   * Default APY in basis points for the USDC NAVI pool. Engine emits
   * the live rate on the `rates_info` tool, but `balance_check` does
   * not — this prop lets the calling renderer override the placeholder
   * if it has a fresher value (e.g. from a cached rates_info turn).
   * Defaults to 462 bps (~4.62%) per the long-running NAVI USDC pool.
   */
  defaultUsdcApyBps?: number;
  /**
   * Default APY in basis points for the USDsui NAVI pool. NAVI's USDsui
   * pool typically tracks higher than USDC (~5-7% vs ~4-5%); 520 bps is
   * the long-running ballpark. Same override semantics as USDC.
   */
  defaultUsdsuiApyBps?: number;
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
  const walletUsd = data.available ?? 0;
  const savingsUsd = data.savings ?? 0;
  const debtUsd = data.debt ?? 0;
  const totalUsd =
    data.total ?? walletUsd + savingsUsd + (data.defi ?? 0) - debtUsd;

  const isWatched = data.isSelfQuery === false && !!data.address;
  const badge = isWatched ? (
    <AddressBadge address={data.address!} suinsName={data.suinsName} />
  ) : undefined;

  // The savings section needs to know whether the user has any deposits to
  // surface. We don't get the per-stable split from balance_check today —
  // engine returns a single `savings: number` aggregate. So we render the
  // section only when savings > 0, with a single "Total deposited" row +
  // an APYBlock for each pool the user could top up into (saveableUsdc / 
  // saveableUsdsui). Per-pool deposit breakdown is deferred until the
  // engine's savings_info tool can be threaded into balance_check (Day 24
  // portfolio_analysis migration is the natural place to add that).
  const hasSavings = savingsUsd > 0;
  const showUsdcApyHint =
    !hasSavings && (data.saveableUsdc ?? 0) > 0;
  const showUsdsuiApyHint =
    !hasSavings && (data.saveableUsdsui ?? 0) > 0;
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
