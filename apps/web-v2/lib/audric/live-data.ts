/**
 * # Per-turn live-data snapshot for PermissionCard preview enrichment
 *
 * SPEC_AI_SDK_HARDENING P5.6 — surface engine-side HF/APY data on the
 * pre-confirm card so the user can see (a) what their health factor is
 * now, (b) where it lands after the write, and (c) the live borrow APY
 * for borrow/repay tools.
 *
 * ## Why this lives in the host (not the engine)
 *
 * `apps/web-v2/app/api/chat/route.ts` uses `Experimental_Agent` from
 * the AI SDK directly — not the engine's `runStream` — so the engine's
 * `enrichPendingActionWithLiveData()` helper (which stamps these
 * fields on `PendingAction`) is structurally unreachable from this
 * code path. We replicate the relevant subset host-side, sourcing
 * from the canonical `getPortfolio()` fetcher (per
 * `single-source-of-truth.mdc`).
 *
 * ## What's captured
 *
 *  - `healthFactor` — `positions.healthFactor` (already in
 *    PositionSummary; `null` means ∞ / no debt).
 *  - `supplied` / `borrowed` — total savings + borrows in USD.
 *  - `liquidationThreshold` — back-derived from
 *    `(maxBorrow × MIN_HF_DIVISOR + borrowed) / supplied`. The audric
 *    `fetchPositions` adapter computes
 *    `maxBorrow = (supplied × LT − borrowed) / 1.5`, so inverting
 *    gives `LT = (1.5 × maxBorrow + borrowed) / supplied`. The
 *    `+ borrowed` term is load-bearing: when the user already has
 *    debt, dropping it produces an LT that's `borrowed/supplied`
 *    too low, making projected HF read worse than reality. Skipped
 *    when `supplied === 0` (no LT to derive).
 *  - `borrowApyByAsset` — per-asset borrow APY in basis points
 *    sourced from `positions.borrowsDetail`. **Only populated for
 *    assets the user currently borrows.** Fresh "borrow USDC for the
 *    first time" cards fall back to the existing "Variable rate"
 *    disclaimer — a fetch-rates host helper would close that gap but
 *    is deferred to a follow-up (would either duplicate engine code
 *    or require an engine export).
 *
 * ## Why `liquidationThreshold` is back-derived (not fetched)
 *
 * NAVI's per-position liquidation threshold IS in the adapter's
 * `getHealth(address)` payload, but `fetchPositions` doesn't surface
 * it on `PositionSummary` today. Back-deriving from `maxBorrow` avoids
 * a host-side fetch refactor for a SPEC item explicitly scoped as
 * "~1d host-side adapter work; no engine changes". The derivation is
 * accurate when there's existing supply (the only case where HF
 * projection is meaningful) and falls back to `undefined` when there
 * isn't — which lets the projection skip + the card degrade to "HF
 * current" only, same as pre-P5.6.
 */

import { getPortfolio } from "@/lib/portfolio";

/**
 * Match `lib/navi-positions.ts` L150 — the safety divisor applied to
 * the raw on-chain `maxBorrow` so chip-flow + engine + this enrichment
 * all bottom out at HF >= 1.5 (not the on-chain knife-edge of 1.0).
 * Hardcoded here to avoid touching the navi-positions module just to
 * export a constant; if the divisor ever changes, grep both files.
 */
const MIN_HEALTH_FACTOR_DIVISOR = 1.5;

const HF_TOOLS = new Set(["borrow", "withdraw", "save_deposit", "repay_debt"]);

const BORROW_APY_TOOLS = new Set(["borrow", "repay_debt"]);

// [F3-APY — 2026-05-31] Tools whose preview body renders a save-pool
// supply APY ("Pool APY" / "Yield foregone"). For these we thread the
// live per-asset supply rate so a USDsui deposit shows the USDsui pool
// rate, not the hardcoded USDC fallback (`DEFAULT_USDSUI_APY_BPS`).
const SAVE_APY_TOOLS = new Set(["save_deposit", "withdraw"]);

export interface AudricLiveData {
  /** Asset symbol (uppercased) → live borrow APY in basis points. */
  borrowApyByAsset: Map<string, number>;
  /** Total borrowed USD across NAVI lending positions. */
  borrowed: number;
  /** Finite HF when there's real debt; `null` for ∞ (no debt). */
  healthFactor: number | null;
  /**
   * Effective liquidation threshold — back-derived from
   * `(maxBorrow × 1.5) / supplied`. `undefined` when `supplied === 0`
   * (HF projection isn't meaningful in that case).
   */
  liquidationThreshold: number | undefined;
  /** Total supplied USD across NAVI lending positions. */
  supplied: number;
  /**
   * Asset symbol (uppercased) → live NAVI SUPPLY APY in basis points,
   * sourced from `positions.supplies[].apy`. NAVI supply APY is the
   * same pool rate for everyone, so the user's own supplied position
   * IS the live pool rate. **Only populated for assets the user
   * currently supplies** — a first-ever deposit of an unheld stable
   * falls back to the `DEFAULT_*_APY_BPS` constant in the preview body
   * (same degrade-open contract as `borrowApyByAsset`).
   */
  supplyApyByAsset: Map<string, number>;
}

/**
 * Back-derive the supply-weighted liquidation threshold from the
 * audric `fetchPositions` adapter's reported `maxBorrow`.
 *
 * The audric adapter computes (lib/navi-positions.ts L151-153):
 *
 *   maxBorrow_returned = (Σ_i s_i × LT_i − Σ_i b_i) / 1.5
 *
 * Solving for the supply-weighted LT:
 *
 *   weighted_LT = (1.5 × maxBorrow_returned + Σ_i b_i) / Σ_i s_i
 *
 * The `+ borrowed` term is **load-bearing**. Without it, an
 * already-borrowing user sees a derived LT that is `borrowed /
 * supplied` LOWER than reality, and projected HF reads proportionally
 * worse — making safe writes look like near-liquidation in the
 * PermissionCard preview.
 *
 * Returns `undefined` when `supplied === 0` (no collateral → no LT
 * to derive → HF projection isn't meaningful).
 *
 * Exported for unit testing — `buildAudricLiveData` is the only
 * runtime caller.
 */
export function deriveLiquidationThreshold(input: {
  /** From `pos.maxBorrow` — already divided by 1.5 by the adapter. */
  maxBorrow: number;
  /** From `pos.savings` — total supplied USD across NAVI positions. */
  supplied: number;
  /** From `pos.borrows` — total borrowed USD across NAVI positions. */
  borrowed: number;
}): number | undefined {
  if (!(input.supplied > 0)) {
    return;
  }
  return (
    (input.maxBorrow * MIN_HEALTH_FACTOR_DIVISOR + input.borrowed) /
    input.supplied
  );
}

/**
 * Build the per-turn live-data snapshot. Reads from the canonical
 * `getPortfolio(walletAddress)` cache — guaranteed warm because
 * `route.ts` `prewarmPortfolio()` fires before this is called.
 *
 * Returns `undefined` on any fetcher failure — callers degrade by
 * skipping HF/APY enrichment entirely. The PermissionCard preview
 * bodies handle absent fields exactly like pre-P5.6 (no HF row,
 * "Variable rate" disclaimer for borrow).
 */
export async function buildAudricLiveData(
  walletAddress: string
): Promise<AudricLiveData | undefined> {
  try {
    const p = await getPortfolio(walletAddress);
    const pos = p.positions;

    const liquidationThreshold = deriveLiquidationThreshold({
      maxBorrow: pos.maxBorrow,
      supplied: pos.savings,
      borrowed: pos.borrows,
    });

    const borrowApyByAsset = new Map<string, number>();
    for (const b of pos.borrowsDetail) {
      if (Number.isFinite(b.apy) && b.apy > 0) {
        borrowApyByAsset.set(b.asset.toUpperCase(), Math.round(b.apy * 10_000));
      }
    }

    // [F3-APY] Per-asset live supply APY from the user's own NAVI
    // positions — the supply rate is pool-wide, so this is the live
    // pool rate for any asset the user already supplies.
    const supplyApyByAsset = new Map<string, number>();
    for (const s of pos.supplies) {
      if (Number.isFinite(s.apy) && s.apy > 0) {
        supplyApyByAsset.set(s.asset.toUpperCase(), Math.round(s.apy * 10_000));
      }
    }

    return {
      healthFactor: pos.healthFactor,
      supplied: pos.savings,
      borrowed: pos.borrows,
      liquidationThreshold,
      borrowApyByAsset,
      supplyApyByAsset,
    };
  } catch (err) {
    console.warn(
      "[audric-chat] live-data fetch failed (degrading to no HF/APY):",
      err instanceof Error ? err.message : String(err)
    );
    return;
  }
}

/**
 * Project the new HF after a write action lands.
 *
 * Mirrors the engine's `projectHF()` 1:1 — both supported save/borrow
 * assets (USDC + USDsui) are stables so treating `amount` as USD 1:1
 * is accurate to ±$0.01.
 *
 *   HF = (supplied × liquidationThreshold) / borrowed
 *
 * Returns `null` when projected position has no debt (∞), a finite
 * number when there's debt, or `undefined` when projection isn't
 * computable (missing LT or non-positive amount).
 */
export function projectHF(
  toolName: string,
  amount: number,
  supplied: number,
  borrowed: number,
  liquidationThreshold: number | undefined
): number | null | undefined {
  if (!(amount > 0)) {
    return;
  }
  if (liquidationThreshold === undefined || !(liquidationThreshold > 0)) {
    return;
  }

  let newSupplied = supplied;
  let newBorrowed = borrowed;
  switch (toolName) {
    case "borrow":
      newBorrowed = borrowed + amount;
      break;
    case "repay_debt":
      newBorrowed = Math.max(0, borrowed - amount);
      break;
    case "withdraw":
      newSupplied = Math.max(0, supplied - amount);
      break;
    case "save_deposit":
      newSupplied = supplied + amount;
      break;
    default:
      return;
  }

  // Match the engine's DEBT_DUST_USD treatment — sub-dust debt counts
  // as "no debt" for the projection so the card reads "→ ∞" instead of
  // some misleading 0.0001-USD-residual HF.
  const DEBT_DUST_USD = 0.01;
  if (newBorrowed <= DEBT_DUST_USD) {
    return null;
  }
  return (newSupplied * liquidationThreshold) / newBorrowed;
}

/**
 * Compute the HF/APY enrichment fields for a given tool + input. Pure
 * function — driven by `liveData` (the per-turn snapshot) and the
 * tool's input. Returns the three optional fields with `undefined`
 * branches for "no data" so consumers can spread the result.
 */
export function computeMetadataEnrichment(
  toolName: string,
  input: unknown,
  liveData: AudricLiveData | undefined
): {
  borrowApyBps?: number;
  currentHF?: number | null;
  projectedHF?: number | null;
  ratesOverride?: { usdcApyBps?: number; usdsuiApyBps?: number };
} {
  if (!liveData) {
    return {};
  }

  const obj = (input ?? {}) as Record<string, unknown>;
  const result: {
    borrowApyBps?: number;
    currentHF?: number | null;
    projectedHF?: number | null;
    ratesOverride?: { usdcApyBps?: number; usdsuiApyBps?: number };
  } = {};

  if (HF_TOOLS.has(toolName)) {
    // currentHF is always available from the snapshot (null = ∞).
    result.currentHF = liveData.healthFactor;

    // projectedHF requires a valid amount + liquidationThreshold.
    const amount = coerceAmount(obj.amount);
    if (amount > 0) {
      const projected = projectHF(
        toolName,
        amount,
        liveData.supplied,
        liveData.borrowed,
        liveData.liquidationThreshold
      );
      if (projected !== undefined) {
        result.projectedHF = projected;
      }
    }
  }

  if (BORROW_APY_TOOLS.has(toolName)) {
    const asset =
      typeof obj.asset === "string" && obj.asset.length > 0
        ? obj.asset
        : "USDC";
    const apy = liveData.borrowApyByAsset.get(asset.toUpperCase());
    if (apy !== undefined) {
      result.borrowApyBps = apy;
    }
  }

  // [F3-APY] Thread the live save-pool supply rate(s) so the preview
  // body renders the actual pool APY for the deposited/withdrawn asset
  // (e.g. USDsui's ~8.6% instead of the hardcoded USDC fallback). Only
  // the keys we have live data for are set; the body's
  // `resolveApyBpsForAsset` falls back to the DEFAULT_*_APY_BPS
  // constant for any unset key (degrade-open).
  if (SAVE_APY_TOOLS.has(toolName)) {
    const usdcApyBps = liveData.supplyApyByAsset.get("USDC");
    const usdsuiApyBps = liveData.supplyApyByAsset.get("USDSUI");
    const override: { usdcApyBps?: number; usdsuiApyBps?: number } = {};
    if (usdcApyBps !== undefined) {
      override.usdcApyBps = usdcApyBps;
    }
    if (usdsuiApyBps !== undefined) {
      override.usdsuiApyBps = usdsuiApyBps;
    }
    if (usdcApyBps !== undefined || usdsuiApyBps !== undefined) {
      result.ratesOverride = override;
    }
  }

  return result;
}

/**
 * Defensive amount coercion — mirrors the engine's `coerceAmount`.
 * The LLM occasionally emits numeric fields as strings; without this,
 * the strict `typeof === 'number'` check silently drops the
 * projection to `null`.
 */
function coerceAmount(raw: unknown): number {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
}
