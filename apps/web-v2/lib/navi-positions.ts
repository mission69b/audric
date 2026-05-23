// ---------------------------------------------------------------------------
// navi-positions.ts — INTERNAL helper for the canonical `lib/portfolio.ts`.
//
// [S.281 / PIPELINE-AUDIT-PHASE-2 S2 — 2026-05-23] Renamed from
// `portfolio-data.ts`. The old name was the cognitive trap the on-chain
// pipeline audit flagged — it sounded like a parallel portfolio fetcher
// next to `portfolio.ts` when in fact the file is single-purpose: pull
// NAVI lending state from the SDK protocol registry, aggregate
// supplies/borrows, and return `PositionSummary`. The rename makes that
// self-evident from the filename.
//
// History: this file used to expose three public fetchers
// (`fetchWalletBalances`, `fetchPortfolio`, `fetchPositions`) directly
// to API routes, hooks, the engine, and the daily cron. That fan-out
// is the single-source-of-truth violation removed in April 2026 (see
// `.cursor/rules/single-source-of-truth.mdc`). All wallet + portfolio
// reads MUST now go through `lib/portfolio.ts`'s `getPortfolio()` /
// `getWalletSnapshot()`.
//
// Only `fetchPositions` survives, and ONLY because it's an
// implementation detail of `getPortfolio()`. New callers MUST NOT
// import `fetchPositions` directly; import `getPortfolio` from
// `@/lib/portfolio` instead. Enforced today by convention + code
// review (no automated Biome rule — adding one is a worthwhile but
// non-blocking follow-up).
// ---------------------------------------------------------------------------

import { getRegistry } from "@/lib/protocol-registry";

export interface SupplyEntry {
  amount: number;
  amountUsd: number;
  apy: number;
  asset: string;
  protocol: string;
  protocolId: string;
}

export interface BorrowEntry {
  amount: number;
  amountUsd: number;
  apy: number;
  asset: string;
  protocol: string;
  protocolId: string;
}

export interface PositionSummary {
  borrows: number;
  borrowsDetail: BorrowEntry[];
  healthFactor: number | null;
  maxBorrow: number;
  pendingRewards: number;
  savings: number;
  savingsRate: number;
  supplies: SupplyEntry[];
}

/**
 * Fetches lending positions from the protocol registry. Throws on registry
 * failure — `getPortfolio` catches and degrades to empty positions.
 *
 * INTERNAL — only `lib/portfolio.ts` should import this. Engine, API
 * routes, hooks, and crons MUST go through `getPortfolio`.
 */
export async function fetchPositions(
  address: string
): Promise<PositionSummary> {
  const registry = getRegistry();
  const lendingAdapters = registry.listLending();

  const [allPositions, healthResults, rewardResults] = await Promise.all([
    registry.allPositions(address),
    Promise.allSettled(lendingAdapters.map((a) => a.getHealth(address))),
    Promise.allSettled(
      lendingAdapters
        .filter((a) => !!a.getPendingRewards)
        // biome-ignore lint/style/noNonNullAssertion: filter above guarantees getPendingRewards exists
        .map((a) => a.getPendingRewards!(address))
    ),
  ]);

  let savings = 0;
  let borrows = 0;
  let weightedRateSum = 0;

  const supplies: SupplyEntry[] = [];
  const borrowList: BorrowEntry[] = [];

  for (const pos of allPositions) {
    for (const s of pos.positions.supplies) {
      const usd = s.amountUsd ?? s.amount;
      savings += usd;
      weightedRateSum += usd * s.apy;
      supplies.push({
        asset: s.asset,
        amount: s.amount,
        amountUsd: usd,
        apy: s.apy,
        protocol: pos.protocol,
        protocolId: pos.protocolId,
      });
    }
    for (const b of pos.positions.borrows) {
      const usd = b.amountUsd ?? b.amount;
      borrows += usd;
      borrowList.push({
        asset: b.asset,
        amount: b.amount,
        amountUsd: usd,
        apy: b.apy,
        protocol: pos.protocol,
        protocolId: pos.protocolId,
      });
    }
  }

  const savingsRate = savings > 0 ? weightedRateSum / savings : 0;

  type HealthResult = Awaited<
    ReturnType<(typeof lendingAdapters)[0]["getHealth"]>
  >;
  const validHealths = healthResults
    .filter(
      (h): h is PromiseFulfilledResult<HealthResult> => h.status === "fulfilled"
    )
    .map((h) => h.value);

  const finiteHFs = validHealths.filter(
    (h) =>
      h.healthFactor !== Number.POSITIVE_INFINITY &&
      Number.isFinite(h.healthFactor)
  );
  const healthFactor =
    finiteHFs.length > 0
      ? Math.min(...finiteHFs.map((h) => h.healthFactor))
      : null;
  // [CHIP_REVIEW_2 F-7 / P0 fix 2026-05-07] Apply MIN_HEALTH_FACTOR=1.5 safety
  // divisor here so EVERY consumer (chip-flow `capForFlow('borrow')`, balance
  // hook, HealthCard "Max Borrow" detail row, engine `health_check` tool's
  // hosted maxBorrow) reports the same SAFE max. Prior to this fix, adapter
  // `getHealth().maxBorrow` returned `supplied × 0.75 − borrowed` — the raw
  // on-chain maximum that lands HF at exactly 1.0 (liquidation knife-edge).
  // The chip-flow's "Borrow Max" preset used that raw value, letting users
  // tap-borrow into liquidation territory while bypassing the engine's
  // 1.5-HF guard (chip writes go through /api/transactions/prepare which
  // calls `addBorrowToTx` directly, NOT `t2000.borrow` → `maxBorrowAmount`).
  // Symmetric with the SDK's authoritative `maxBorrowAmount` formula at
  // `packages/sdk/src/protocols/navi.ts:599`. See `single-source-of-truth.mdc`.
  const MIN_HEALTH_FACTOR = 1.5;
  const maxBorrow =
    validHealths.reduce((sum, h) => sum + (h.maxBorrow ?? 0), 0) /
    MIN_HEALTH_FACTOR;

  type RewardResult = Awaited<
    ReturnType<NonNullable<(typeof lendingAdapters)[0]["getPendingRewards"]>>
  >;
  const pendingRewards = rewardResults
    .filter(
      (r): r is PromiseFulfilledResult<RewardResult> => r.status === "fulfilled"
    )
    .flatMap((r) => r.value)
    .reduce((sum, r) => sum + (r.estimatedValueUsd ?? 0), 0);

  return {
    savings,
    borrows,
    savingsRate,
    healthFactor,
    maxBorrow,
    pendingRewards,
    supplies,
    borrowsDetail: borrowList,
  };
}
