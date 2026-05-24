/**
 * Unit tests for the heuristic intent classifier + tool selector.
 *
 * [SPEC_AI_SDK_HARDENING P3.1 — 2026-05-24]
 *
 * Strategy: one test per intent for the common phrasings + edge cases
 * (empty input, multi-intent, no-match fallback). The point is to
 * lock in the regex shapes so future expansions don't accidentally
 * drop coverage on phrasings the canonical chat surface uses.
 */

import { describe, expect, it } from "vitest";
import {
  ALWAYS_ON_TOOLS,
  classifyIntent,
  selectActiveTools,
} from "./intent-classifier";

describe("classifyIntent — single-intent matches", () => {
  it("classifies 'save 10 USDC' as save", () => {
    expect(classifyIntent("save 10 USDC")).toEqual({
      intents: ["save"],
      confidence: "high",
    });
  });

  it("classifies 'deposit USDC into savings' as save", () => {
    expect(classifyIntent("deposit USDC into savings")).toEqual({
      intents: ["save"],
      confidence: "high",
    });
  });

  it("classifies 'withdraw my USDC' as save", () => {
    expect(classifyIntent("withdraw my USDC")).toEqual({
      intents: ["save"],
      confidence: "high",
    });
  });

  it("classifies 'borrow 50 USDC' as borrow", () => {
    expect(classifyIntent("borrow 50 USDC")).toEqual({
      intents: ["borrow"],
      confidence: "high",
    });
  });

  it("classifies 'pay back my loan' as borrow (NOT send)", () => {
    expect(classifyIntent("pay back my loan")).toEqual({
      intents: ["borrow"],
      confidence: "high",
    });
  });

  it("classifies 'what is my health factor' as borrow", () => {
    expect(classifyIntent("what is my health factor")).toEqual({
      intents: ["borrow"],
      confidence: "high",
    });
  });

  it("classifies 'send 10 USDC to alice' as send", () => {
    expect(classifyIntent("send 10 USDC to alice")).toEqual({
      intents: ["send"],
      confidence: "high",
    });
  });

  it("classifies 'transfer 5 USDC' as send", () => {
    expect(classifyIntent("transfer 5 USDC")).toEqual({
      intents: ["send"],
      confidence: "high",
    });
  });

  it("classifies 'pay alice 10 USDC' as send (NOT borrow)", () => {
    expect(classifyIntent("pay alice 10 USDC")).toEqual({
      intents: ["send"],
      confidence: "high",
    });
  });

  it("classifies 'swap SUI for USDC' as swap", () => {
    expect(classifyIntent("swap SUI for USDC")).toEqual({
      intents: ["swap"],
      confidence: "high",
    });
  });

  it("classifies 'convert my SUI to USDC' as swap", () => {
    expect(classifyIntent("convert my SUI to USDC")).toEqual({
      intents: ["swap"],
      confidence: "high",
    });
  });

  it("classifies 'claim my rewards' as rewards", () => {
    expect(classifyIntent("claim my rewards")).toEqual({
      intents: ["rewards"],
      confidence: "high",
    });
  });

  it("classifies 'harvest and compound' as rewards", () => {
    expect(classifyIntent("harvest and compound")).toEqual({
      intents: ["rewards"],
      confidence: "high",
    });
  });

  it("classifies 'show my transaction history' as history", () => {
    expect(classifyIntent("show my transaction history")).toEqual({
      intents: ["history"],
      confidence: "high",
    });
  });

  it("classifies 'what did I spend this week' as history", () => {
    expect(classifyIntent("what did I spend this week")).toEqual({
      intents: ["history"],
      confidence: "high",
    });
  });

  it("classifies 'show my portfolio' as portfolio", () => {
    expect(classifyIntent("show my portfolio")).toEqual({
      intents: ["portfolio"],
      confidence: "high",
    });
  });

  it("classifies 'what is my net worth' as portfolio", () => {
    expect(classifyIntent("what is my net worth")).toEqual({
      intents: ["portfolio"],
      confidence: "high",
    });
  });

  it("classifies 'create a payment link for 50 USDC' as paymentLinks", () => {
    expect(classifyIntent("create a payment link for 50 USDC")).toEqual({
      intents: ["paymentLinks"],
      confidence: "high",
    });
  });

  it("classifies 'request 25 USDC from alice' as paymentLinks", () => {
    expect(classifyIntent("request 25 USDC from alice")).toEqual({
      intents: ["paymentLinks"],
      confidence: "high",
    });
  });

  it("classifies 'what is the current APY' as rates", () => {
    expect(classifyIntent("what is the current APY")).toEqual({
      intents: ["rates"],
      confidence: "high",
    });
  });
});

describe("classifyIntent — multi-intent matches", () => {
  it("matches both swap and save in 'swap SUI and save the USDC'", () => {
    const result = classifyIntent("swap SUI and save the USDC");
    expect(result.intents).toContain("swap");
    expect(result.intents).toContain("save");
    expect(result.confidence).toBe("medium");
  });

  it("matches both save and rates in 'what is the save APY'", () => {
    const result = classifyIntent("what is the save APY");
    expect(result.intents).toContain("save");
    expect(result.intents).toContain("rates");
    expect(result.confidence).toBe("medium");
  });

  it("matches both borrow and rates in 'compare borrow rates'", () => {
    const result = classifyIntent("compare borrow rates");
    expect(result.intents).toContain("borrow");
    expect(result.intents).toContain("rates");
    expect(result.confidence).toBe("medium");
  });

  it("matches save + swap + portfolio for 'rebalance my portfolio'", () => {
    // Workflow phrasings should activate the union of write tools that
    // could be involved. 'rebalance' touches save (might deposit) and
    // swap (might trade); 'portfolio' adds the portfolio_analysis read.
    const result = classifyIntent("rebalance my portfolio");
    expect(result.intents).toContain("save");
    expect(result.intents).toContain("swap");
    expect(result.intents).toContain("portfolio");
    expect(result.confidence).toBe("medium");
  });

  it("matches swap + portfolio for 'diversify my holdings'", () => {
    const result = classifyIntent("diversify my holdings");
    expect(result.intents).toContain("swap");
    expect(result.intents).toContain("portfolio");
  });
});

describe("classifyIntent — fallbacks", () => {
  it("returns general/low for empty input", () => {
    expect(classifyIntent("")).toEqual({
      intents: ["general"],
      confidence: "low",
    });
  });

  it("returns general/low for whitespace-only input", () => {
    expect(classifyIntent("   \n\t  ")).toEqual({
      intents: ["general"],
      confidence: "low",
    });
  });

  it("returns general/low for non-matching input", () => {
    expect(classifyIntent("how are you today")).toEqual({
      intents: ["general"],
      confidence: "low",
    });
  });

  it("returns general/low for 'tell me a joke'", () => {
    expect(classifyIntent("tell me a joke")).toEqual({
      intents: ["general"],
      confidence: "low",
    });
  });
});

describe("classifyIntent — case insensitivity + word boundaries", () => {
  it("matches uppercase 'SAVE 10 USDC'", () => {
    expect(classifyIntent("SAVE 10 USDC")).toEqual({
      intents: ["save"],
      confidence: "high",
    });
  });

  it("does NOT match 'behaviour' as borrow (substring guard)", () => {
    // "behaviour" contains "havi" not "borrow" — sanity check that
    // /\bborrow\b/ doesn't match partials.
    const result = classifyIntent("describe your behaviour around tool errors");
    expect(result.intents).toEqual(["general"]);
  });

  it("does NOT match 'lifesaver' as save (substring guard)", () => {
    const result = classifyIntent("you are a lifesaver");
    // 'saver' is not a save keyword but 'save' would match if boundary
    // was lax. With \bsave\b the match should NOT fire.
    expect(result.intents).toEqual(["general"]);
  });
});

describe("selectActiveTools", () => {
  it("includes ALWAYS_ON_TOOLS in every selection", () => {
    const tools = selectActiveTools({
      intents: ["save"],
      confidence: "high",
    });
    for (const t of ALWAYS_ON_TOOLS) {
      expect(tools).toContain(t);
    }
  });

  it("returns 7 tools for single save intent", () => {
    const tools = selectActiveTools({
      intents: ["save"],
      confidence: "high",
    });
    // save's set (6) + render_canvas (1) = 7
    expect(tools).toHaveLength(7);
    expect(tools).toContain("save_deposit");
    expect(tools).toContain("withdraw");
    expect(tools).toContain("balance_check");
    expect(tools).toContain("savings_info");
    expect(tools).toContain("rates_info");
    expect(tools).toContain("health_check");
    expect(tools).toContain("render_canvas");
  });

  it("dedupes the union for multi-intent (swap + save share balance_check)", () => {
    const tools = selectActiveTools({
      intents: ["swap", "save"],
      confidence: "medium",
    });
    // swap (4) + save (6) - shared(balance_check) + render_canvas (1)
    // = (4 + 6 - 1) + 1 = 10
    expect(tools).toHaveLength(10);
    // balance_check appears once
    const balanceCount = tools.filter((t) => t === "balance_check").length;
    expect(balanceCount).toBe(1);
  });

  it("returns hardened general fallback for empty input", () => {
    const tools = selectActiveTools(classifyIntent(""));
    // Post-hotfix general: 6 reads + 6 writes + render_canvas = 13
    expect(tools).toHaveLength(13);
    expect(tools).toContain("balance_check");
    expect(tools).toContain("portfolio_analysis");
  });

  it("includes write tools only for narrow intents (portfolio stays read-only)", () => {
    const portfolio = selectActiveTools({
      intents: ["portfolio"],
      confidence: "high",
    });
    expect(portfolio).not.toContain("save_deposit");
    expect(portfolio).not.toContain("send_transfer");
    expect(portfolio).not.toContain("swap_execute");
    expect(portfolio).not.toContain("borrow");
  });

  it("includes save_deposit + withdraw ONLY for save intent (NOT portfolio)", () => {
    const portfolio = selectActiveTools({
      intents: ["portfolio"],
      confidence: "high",
    });
    expect(portfolio).not.toContain("save_deposit");
    expect(portfolio).not.toContain("withdraw");

    const save = selectActiveTools({
      intents: ["save"],
      confidence: "high",
    });
    expect(save).toContain("save_deposit");
    expect(save).toContain("withdraw");
  });

  // -------------------------------------------------------------------------
  // Hardened general fallback (HOTFIX 2026-05-24)
  // -------------------------------------------------------------------------
  //
  // Pre-hotfix the general fallback was reads-only, which stripped
  // writes from activeTools on misclassified turns and caused the model
  // to hallucinate "I don't have save_deposit". Post-hotfix general
  // includes the 6 most common writes as a degrade-open floor.
  // -------------------------------------------------------------------------

  it("hardened general includes the 6 common writes for degrade-open safety", () => {
    const tools = selectActiveTools({
      intents: ["general"],
      confidence: "low",
    });
    expect(tools).toContain("save_deposit");
    expect(tools).toContain("withdraw");
    expect(tools).toContain("send_transfer");
    expect(tools).toContain("borrow");
    expect(tools).toContain("repay_debt");
    expect(tools).toContain("swap_execute");
  });

  it("hardened general DOES NOT include niche writes (claim/harvest_rewards)", () => {
    // The hardened set deliberately omits niche writes the LLM should
    // never select without a clear keyword cue. Those stay in their
    // respective intent subsets (rewards).
    const tools = selectActiveTools({
      intents: ["general"],
      confidence: "low",
    });
    expect(tools).not.toContain("claim_rewards");
    expect(tools).not.toContain("harvest_rewards");
  });

  it("hardened general still includes the read tools (additive change, not replacement)", () => {
    const tools = selectActiveTools({
      intents: ["general"],
      confidence: "low",
    });
    // The pre-hotfix reads stay — this was an ADDITION to general,
    // not a swap-in. The 6 reads are required for post-write refresh
    // observation even when the model misclassifies.
    expect(tools).toContain("balance_check");
    expect(tools).toContain("savings_info");
    expect(tools).toContain("health_check");
    expect(tools).toContain("transaction_history");
    expect(tools).toContain("portfolio_analysis");
    expect(tools).toContain("rates_info");
  });
});
