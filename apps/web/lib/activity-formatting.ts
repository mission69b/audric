// Pure formatting + classification helpers for the activity feed.
// Extracted from `/api/activity/route.ts` so unit tests can exercise
// them without mocking Prisma + the canonical fetchers.
//
// Stays decoupled from the route by accepting plain inputs:
//   - `detectBundle(legs, moveCallTargets)` — pure, no I/O
//   - `buildTitle(type, legs, opCount, counterparty)` — pure
//   - `bundleSubtitle(legs, type)` — pure
//   - `formatTokenAmount(n, decimals)` — pure
//   - `formatUsd(n)` — pure
//   - `STABLE_SYMBOLS` — constant set of USD-pegged Sui stables

import { KNOWN_TARGETS } from '@t2000/sdk';
import type { ActivityLeg } from '@/lib/activity-types';

/**
 * USD-pegged stables on Sui. Token amount and USD value are
 * interchangeable for these (price ≈ 1.00). Used to skip price
 * fetching and to suppress the "today" caveat on USD overlays.
 *
 * Stay synced with `STABLE_ASSETS` in `@t2000/sdk` constants. The SDK
 * only marks USDC as a "saveable" stable but USDsui / USDT / USDe are
 * also USD-pegged for display purposes.
 */
export const STABLE_SYMBOLS = new Set(['USDC', 'USDsui', 'USDT', 'USDe']);

export function truncAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

/**
 * Format a token quantity for inline display. Decimals scale with
 * magnitude so that 4.4431 SUI shows 4 places, 0.00064 GOLD shows
 * its on-chain precision, and 987.60 MANIFEST trims trailing zeros.
 */
export function formatTokenAmount(amount: number, decimals: number): string {
  const dp = amount >= 1 ? 4 : amount >= 0.01 ? 6 : Math.min(decimals, 9);
  return amount.toFixed(dp).replace(/\.?0+$/, '');
}

/** Format a USD figure; collapses sub-cent amounts to `<$0.01`. */
export function formatUsd(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(3)}`;
  return `<$0.01`;
}

/**
 * Detect a multi-op bundle PTB. Returns `{ isBundle: true, opCount }`
 * when the tx is cross-protocol (e.g. swap+save) or multi-currency
 * (>2 distinct user balance legs). `opCount` is a best-effort
 * estimate — exact per-step granularity isn't recoverable from
 * balance changes alone since Sui collapses by coin type.
 *
 * Single-currency bundles (e.g. two swaps that round-trip USDC) can
 * miss the multi-currency check; the cross-protocol check still
 * catches them when the legs touch different protocols.
 */
export function detectBundle(
  legs: ActivityLeg[],
  moveCallTargets: string[],
): { isBundle: boolean; opCount: number } {
  const distinctActions = new Set<string>();
  for (const target of moveCallTargets) {
    for (const [pattern, label] of KNOWN_TARGETS) {
      if (pattern.test(target)) {
        if (label === 'swap' || label === 'lending' || label === 'send') {
          distinctActions.add(label);
        }
        break;
      }
    }
  }
  const crossProtocol = distinctActions.size > 1;
  const multiCurrency = legs.length > 2;

  if (crossProtocol || multiCurrency) {
    const opCount = Math.max(distinctActions.size, multiCurrency ? legs.length : 0);
    return { isBundle: true, opCount };
  }
  return { isBundle: false, opCount: 0 };
}

/**
 * Build the human-readable title for a chain row. Critical
 * invariant: NEVER prefix a non-stable token amount with `$`. Pre-
 * rebuild this method did `$${amount.toFixed(2)} ${asset}` for
 * everything, producing "Swapped $987.60 MANIFEST" for a 1 USDC →
 * 987.60 MANIFEST swap (the user actually paid $1, not $987).
 */
export function buildTitle(
  type: string,
  legs: ActivityLeg[],
  bundleOpCount: number | undefined,
  counterparty: string | undefined,
): string {
  if (type === 'bundle') {
    return bundleOpCount && bundleOpCount > 0
      ? `Bundle (${bundleOpCount} ops)`
      : 'Bundle';
  }
  if (type === 'swap') {
    const out = legs.find((l) => l.direction === 'out');
    const into = legs.find((l) => l.direction === 'in');
    if (out && into) {
      return `Swapped ${formatTokenAmount(out.amount, out.decimals)} ${out.asset} for ${formatTokenAmount(into.amount, into.decimals)} ${into.asset}`;
    }
    if (out) return `Swapped ${formatTokenAmount(out.amount, out.decimals)} ${out.asset}`;
    if (into) return `Swap settled into ${formatTokenAmount(into.amount, into.decimals)} ${into.asset}`;
    return 'Swap';
  }
  const principal = legs[0];
  if (!principal) {
    return type === 'contract' ? 'Contract call' : 'Transaction';
  }
  const amtTok = `${formatTokenAmount(principal.amount, principal.decimals)} ${principal.asset}`;
  switch (type) {
    case 'send':
      return counterparty ? `Sent ${amtTok} to ${truncAddr(counterparty)}` : `Sent ${amtTok}`;
    case 'receive':
      return counterparty
        ? `Received ${amtTok} from ${truncAddr(counterparty)}`
        : `Received ${amtTok}`;
    case 'lending':
      if (principal.direction === 'out') return `Saved ${amtTok} into NAVI`;
      if (principal.direction === 'in') return `Withdrew ${amtTok} from NAVI`;
      return `DeFi interaction · ${amtTok}`;
    case 'pay':
      return `Paid ${amtTok} for service`;
    case 'contract':
      return `Contract call · ${amtTok}`;
    default:
      return `Transaction · ${amtTok}`;
  }
}

/**
 * Subtitle line under the title — net USD spent (outflows) or
 * received (inflow-only rows). Stables drop the "today" caveat
 * since they aren't price-volatile.
 */
export function bundleSubtitle(legs: ActivityLeg[], type: string): string | undefined {
  if (legs.length === 0) return undefined;
  const allStable = legs.every((l) => l.isStable);
  const outs = legs.filter((l) => l.direction === 'out');
  if (outs.length > 0) {
    const totalOutUsd = outs.reduce((sum, l) => sum + (l.usdValue ?? 0), 0);
    if (totalOutUsd > 0) {
      const usdStr = formatUsd(totalOutUsd);
      // Single-leg lending out (save) — the title already shows the
      // amount + protocol; subtitle would be redundant.
      if (type === 'lending' && legs.length === 1) return undefined;
      return allStable ? usdStr : `${usdStr} today`;
    }
  }
  const ins = legs.filter((l) => l.direction === 'in');
  const totalInUsd = ins.reduce((sum, l) => sum + (l.usdValue ?? 0), 0);
  if (totalInUsd > 0) {
    const usdStr = formatUsd(totalInUsd);
    return allStable ? usdStr : `${usdStr} today`;
  }
  return undefined;
}
