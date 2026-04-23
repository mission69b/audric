import { getDecimalsForCoinType, resolveSymbol } from './token-registry';

export interface BalanceChange {
  coinType: string;
  amount: string;
  owner?: unknown;
}

/**
 * Parse actual amount from Sui balance changes.
 * Used after transaction execution to extract real on-chain amounts.
 *
 * Matches by both:
 *   1. The last `::` segment of the coin type (uppercased), and
 *   2. The registry-resolved symbol (uppercased) — needed for tokens whose
 *      on-chain coin type differs from their display symbol (e.g. vSUI is
 *      `...::cert::CERT`).
 */
export function parseActualAmount(
  changes: BalanceChange[] | undefined,
  assetHint: string | undefined,
  direction: 'positive' | 'negative',
): number | null {
  if (!changes?.length) return null;
  const hint = (assetHint ?? 'USDC').toUpperCase();
  const matches = changes.filter((c) => {
    const lastSegment = c.coinType.split('::').pop()?.toUpperCase() ?? '';
    const registrySymbol = resolveSymbol(c.coinType).toUpperCase();
    const amtOk = direction === 'positive' ? Number(c.amount) > 0 : Number(c.amount) < 0;
    const symMatch =
      lastSegment === hint ||
      lastSegment.includes(hint) ||
      registrySymbol === hint ||
      registrySymbol.includes(hint);
    return amtOk && symMatch;
  });
  if (!matches.length) return null;
  // Pick the largest absolute amount — avoids selecting overlay fee entries
  // (e.g. 0.1% fee to treasury) instead of the actual user amount.
  const best = matches.reduce((a, b) =>
    Math.abs(Number(a.amount)) >= Math.abs(Number(b.amount)) ? a : b,
  );
  const dec = getDecimalsForCoinType(best.coinType);
  return Math.abs(Number(BigInt(best.amount))) / 10 ** dec;
}

/**
 * Build swap display data from balance changes and input params.
 */
export function buildSwapDisplayData(
  changes: BalanceChange[] | undefined,
  fromSymbol: string,
  toSymbol: string,
  inputAmount: number,
): {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number | null;
  received: number | null;
} {
  const resolvedFrom = resolveSymbol(fromSymbol);
  const resolvedTo = resolveSymbol(toSymbol);
  const soldAmt = parseActualAmount(changes, fromSymbol, 'negative') ?? inputAmount;
  const receivedAmt = parseActualAmount(changes, toSymbol, 'positive');

  return {
    fromToken: resolvedFrom,
    toToken: resolvedTo,
    fromAmount: soldAmt,
    toAmount: receivedAmt,
    received: receivedAmt,
  };
}
