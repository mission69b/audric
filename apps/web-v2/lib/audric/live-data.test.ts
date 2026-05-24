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
 *    with the post-approval `<financial_context>` block on the
 *    follow-up turn.
 *  - `computeMetadataEnrichment` is the dispatcher — wrong tool-name
 *    routing means save_deposit cards lose their HF row.
 */

import { describe, expect, it } from "vitest";
import {
  type AudricLiveData,
  computeMetadataEnrichment,
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
};

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
