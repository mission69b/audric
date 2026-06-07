/**
 * Unit tests for `lib/audric/live-data.ts` — SPEC_AI_SDK_HARDENING
 * P5.6 (host-side HF/APY enrichment).
 *
 * Coverage focuses on the two pure functions (`projectHF`,
 * `computeMetadataEnrichment`) — the third export (`buildAudricLiveData`)
 * wraps `getPortfolio()` and is covered by the canonical portfolio
 * fetch path's own integration coverage. Replicating that mock here
 * would test the mock, not our code.
 *
 * Why these matter:
 *  - `projectHF` mirrors engine's `projectHF()` 1:1; drift between
 *    host + engine would lead to PermissionCard previews disagreeing
 *    with the post-approval balances the agent reads on the
 *    follow-up turn.
 *  - `computeMetadataEnrichment` is the dispatcher — wrong tool-name
 *    routing means save_deposit cards lose their HF row.
 */

import { describe, expect, it } from "vitest";
import {
  type AudricLiveData,
  computeMetadataEnrichment,
  deriveLiquidationThreshold,
  projectHF,
} from "./live-data";

const baseLiveData: AudricLiveData = {
  healthFactor: 2.0,
  supplied: 1000,
  borrowed: 300,
  // Back-derived from supplied + maxBorrow: when supplied=1000, max=400
  // → LT = (400 × 1.5) / 1000 = 0.6 — typical USDC LTV.
  liquidationThreshold: 0.6,
  borrowApyByAsset: new Map([
    ["USDC", 467],
    ["USDSUI", 612],
  ]),
  // [F3-APY] Live supply APY: USDC 4.62%, USDsui 8.66%.
  supplyApyByAsset: new Map([
    ["USDC", 462],
    ["USDSUI", 866],
  ]),
};

describe("deriveLiquidationThreshold (self-audit regression)", () => {
  // The audric adapter computes:
  //   maxBorrow_returned = (supplied × LT − borrowed) / 1.5
  // We back-derive:
  //   LT = (1.5 × maxBorrow + borrowed) / supplied
  //
  // The original P5.6 implementation DROPPED the `+ borrowed` term,
  // producing a derived LT that was `borrowed / supplied` too LOW.
  // This regression suite locks in the fix.

  it("no debt → matches the simpler form (sanity check)", () => {
    // supplied=$1000, borrowed=$0, real LT=0.75
    //   adapter maxBorrow = (1000 × 0.75 − 0) / 1.5 = 500
    //   derived LT = (1.5 × 500 + 0) / 1000 = 0.75 ✓
    expect(
      deriveLiquidationThreshold({
        maxBorrow: 500,
        supplied: 1000,
        borrowed: 0,
      })
    ).toBeCloseTo(0.75);
  });

  it("with debt → recovers real LT (the bug case)", () => {
    // supplied=$1000, borrowed=$300, real LT=0.75
    //   adapter maxBorrow = (1000 × 0.75 − 300) / 1.5 = 300
    //   PRE-FIX derived LT = (1.5 × 300) / 1000 = 0.45 ❌
    //   POST-FIX derived LT = (1.5 × 300 + 300) / 1000 = 0.75 ✓
    expect(
      deriveLiquidationThreshold({
        maxBorrow: 300,
        supplied: 1000,
        borrowed: 300,
      })
    ).toBeCloseTo(0.75);
  });

  it("partially borrowed → recovers real LT", () => {
    // supplied=$1000, borrowed=$500, real LT=0.80
    //   adapter maxBorrow = (1000 × 0.80 − 500) / 1.5 = 200
    //   derived LT = (1.5 × 200 + 500) / 1000 = 0.80 ✓
    expect(
      deriveLiquidationThreshold({
        maxBorrow: 200,
        supplied: 1000,
        borrowed: 500,
      })
    ).toBeCloseTo(0.8);
  });

  it("supplied === 0 → undefined (no LT to derive)", () => {
    expect(
      deriveLiquidationThreshold({ maxBorrow: 0, supplied: 0, borrowed: 0 })
    ).toBeUndefined();
  });

  it("composes cleanly with projectHF — full pipeline produces correct projection", () => {
    // Sanity check: end-to-end from adapter output → projected HF.
    // supplied=$1000, borrowed=$300, real LT=0.75, real current HF=2.5.
    // User wants to borrow $100.
    //   real projected HF = (1000 × 0.75) / 400 = 1.875
    //
    // PRE-FIX (buggy LT=0.45): projected HF = (1000 × 0.45) / 400 = 1.125
    //   → card would show 2.50 → 1.13 (looks scary, hits warning tier)
    // POST-FIX (correct LT=0.75): projected HF = 1.875
    //   → card shows 2.50 → 1.88 (correctly in safe tier)
    const adapterMaxBorrow = 300; // adapter's reported maxBorrow
    const lt = deriveLiquidationThreshold({
      maxBorrow: adapterMaxBorrow,
      supplied: 1000,
      borrowed: 300,
    });
    expect(lt).toBeDefined();
    const projected = projectHF("borrow", 100, 1000, 300, lt);
    expect(projected).toBeCloseTo(1.875);
  });
});

describe("projectHF", () => {
  it("borrow: increases borrowed → lowers HF", () => {
    // borrow 100 → newBorrowed = 400 → HF = (1000 × 0.6) / 400 = 1.5
    expect(projectHF("borrow", 100, 1000, 300, 0.6)).toBeCloseTo(1.5);
  });

  it("save_deposit: increases supplied → raises HF", () => {
    // deposit 500 → newSupplied = 1500 → HF = (1500 × 0.6) / 300 = 3.0
    expect(projectHF("save_deposit", 500, 1000, 300, 0.6)).toBeCloseTo(3.0);
  });

  it("repay_debt: shrinks borrowed → raises HF", () => {
    // repay 100 → newBorrowed = 200 → HF = (1000 × 0.6) / 200 = 3.0
    expect(projectHF("repay_debt", 100, 1000, 300, 0.6)).toBeCloseTo(3.0);
  });

  it("repay_debt that clears debt → returns null (∞)", () => {
    // repay 300 → newBorrowed = 0 → null sentinel
    expect(projectHF("repay_debt", 300, 1000, 300, 0.6)).toBeNull();
  });

  it("repay_debt that leaves sub-dust debt → returns null (∞)", () => {
    // repay 299.999 → newBorrowed = 0.001 (below 0.01 dust) → ∞
    expect(projectHF("repay_debt", 299.999, 1000, 300, 0.6)).toBeNull();
  });

  it("withdraw: shrinks supplied → lowers HF", () => {
    // withdraw 500 → newSupplied = 500 → HF = (500 × 0.6) / 300 = 1.0
    expect(projectHF("withdraw", 500, 1000, 300, 0.6)).toBeCloseTo(1.0);
  });

  it("returns undefined when liquidationThreshold is missing", () => {
    expect(projectHF("borrow", 100, 1000, 300, undefined)).toBeUndefined();
  });

  it("returns undefined when amount is zero or negative", () => {
    expect(projectHF("borrow", 0, 1000, 300, 0.6)).toBeUndefined();
    expect(projectHF("borrow", -10, 1000, 300, 0.6)).toBeUndefined();
  });

  it("returns undefined for unknown tool", () => {
    expect(projectHF("swap_execute", 100, 1000, 300, 0.6)).toBeUndefined();
  });
});

describe("computeMetadataEnrichment", () => {
  it("borrow populates currentHF + projectedHF + borrowApyBps", () => {
    const result = computeMetadataEnrichment(
      "borrow",
      { amount: 100, asset: "USDC" },
      baseLiveData
    );
    expect(result.currentHF).toBe(2.0);
    expect(result.projectedHF).toBeCloseTo(1.5);
    expect(result.borrowApyBps).toBe(467);
  });

  it("save_deposit populates HF fields but skips borrowApyBps", () => {
    const result = computeMetadataEnrichment(
      "save_deposit",
      { amount: 500, asset: "USDC" },
      baseLiveData
    );
    expect(result.currentHF).toBe(2.0);
    expect(result.projectedHF).toBeCloseTo(3.0);
    expect(result.borrowApyBps).toBeUndefined();
  });

  it("save_deposit threads live ratesOverride (both pool rates) (F3-APY)", () => {
    const result = computeMetadataEnrichment(
      "save_deposit",
      { amount: 10, asset: "USDsui" },
      baseLiveData
    );
    // The body picks usdsuiApyBps for a USDsui deposit (8.66%), but we
    // thread both so the card is correct regardless of asset.
    expect(result.ratesOverride).toEqual({
      usdcApyBps: 462,
      usdsuiApyBps: 866,
    });
  });

  it("withdraw threads live ratesOverride (yield foregone) (F3-APY)", () => {
    const result = computeMetadataEnrichment(
      "withdraw",
      { amount: 5, asset: "USDsui" },
      baseLiveData
    );
    expect(result.ratesOverride?.usdsuiApyBps).toBe(866);
  });

  it("ratesOverride omits assets with no live supply position (degrade-open)", () => {
    // User supplies only USDC → USDsui rate falls back to the body's
    // DEFAULT_USDSUI_APY_BPS constant (key absent from the override).
    const usdcOnly: AudricLiveData = {
      ...baseLiveData,
      supplyApyByAsset: new Map([["USDC", 462]]),
    };
    const result = computeMetadataEnrichment(
      "save_deposit",
      { amount: 10, asset: "USDsui" },
      usdcOnly
    );
    expect(result.ratesOverride).toEqual({ usdcApyBps: 462 });
    expect(result.ratesOverride?.usdsuiApyBps).toBeUndefined();
  });

  it("save_deposit with no live supply data → no ratesOverride", () => {
    const noSupply: AudricLiveData = {
      ...baseLiveData,
      supplyApyByAsset: new Map(),
    };
    const result = computeMetadataEnrichment(
      "save_deposit",
      { amount: 10, asset: "USDC" },
      noSupply
    );
    expect(result.ratesOverride).toBeUndefined();
  });

  it("borrow does NOT thread ratesOverride (save-only)", () => {
    const result = computeMetadataEnrichment(
      "borrow",
      { amount: 100, asset: "USDC" },
      baseLiveData
    );
    expect(result.ratesOverride).toBeUndefined();
  });

  it("repay_debt with USDsui asset uses USDsui APY", () => {
    const result = computeMetadataEnrichment(
      "repay_debt",
      { amount: 50, asset: "USDsui" },
      baseLiveData
    );
    expect(result.borrowApyBps).toBe(612);
  });

  it("borrow with no existing position for asset → no borrowApyBps", () => {
    // USDe isn't in the borrowApyByAsset map (user has no USDe debt) →
    // the row should fall back to "Variable rate" in the card.
    const result = computeMetadataEnrichment(
      "borrow",
      { amount: 100, asset: "USDe" },
      baseLiveData
    );
    expect(result.currentHF).toBe(2.0);
    expect(result.borrowApyBps).toBeUndefined();
  });

  it("swap_execute → empty enrichment (no HF, no APY)", () => {
    const result = computeMetadataEnrichment(
      "swap_execute",
      { amount: 100, from: "SUI", to: "USDC" },
      baseLiveData
    );
    expect(result).toEqual({});
  });

  it("send_transfer → empty enrichment", () => {
    const result = computeMetadataEnrichment(
      "send_transfer",
      { amount: 10, asset: "USDC", to: "0xabc" },
      baseLiveData
    );
    expect(result).toEqual({});
  });

  it("missing liveData → empty enrichment (graceful degradation)", () => {
    const result = computeMetadataEnrichment(
      "borrow",
      { amount: 100, asset: "USDC" },
      undefined
    );
    expect(result).toEqual({});
  });

  it("string-typed amount (LLM emission quirk) is coerced", () => {
    // Engine's coerceAmount handles this; we mirror it host-side so a
    // stringified `amount: "100"` still yields a projection.
    const result = computeMetadataEnrichment(
      "borrow",
      { amount: "100", asset: "USDC" },
      baseLiveData
    );
    expect(result.projectedHF).toBeCloseTo(1.5);
  });

  it("missing amount → projectedHF undefined but currentHF still set", () => {
    const result = computeMetadataEnrichment(
      "borrow",
      { asset: "USDC" },
      baseLiveData
    );
    expect(result.currentHF).toBe(2.0);
    expect(result.projectedHF).toBeUndefined();
  });

  it("borrow with no asset specified defaults to USDC", () => {
    const result = computeMetadataEnrichment(
      "borrow",
      { amount: 100 },
      baseLiveData
    );
    expect(result.borrowApyBps).toBe(467);
  });
});
