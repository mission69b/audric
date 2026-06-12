/**
 * Unit tests for the heuristic intent classifier + tool selector.
 *
 * [SPEC_AI_SDK_HARDENING P3.1 — 2026-05-24]
 * [SPEC_AUDRIC_DEFI_REMOVAL §2e — 2026-06-10] Intent collapse: the 9
 * finance intents fell to send · services · general + the transitional
 * `exit` intent covering the §2d 7-day grace window. Delete the `exit`
 * blocks (and the intent) at the post-window cut.
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

  it("classifies 'pay alice 10 USDC' as send (NOT exit)", () => {
    expect(classifyIntent("pay alice 10 USDC")).toEqual({
      intents: ["send"],
      confidence: "high",
    });
  });

  it("classifies 'withdraw my USDC' as exit (grace window)", () => {
    expect(classifyIntent("withdraw my USDC")).toEqual({
      intents: ["exit"],
      confidence: "high",
    });
  });

  it("classifies 'pay back my loan' as exit (NOT send)", () => {
    expect(classifyIntent("pay back my loan")).toEqual({
      intents: ["exit"],
      confidence: "high",
    });
  });

  it("classifies 'swap SUI for USDC' as exit", () => {
    expect(classifyIntent("swap SUI for USDC")).toEqual({
      intents: ["exit"],
      confidence: "high",
    });
  });

  it("classifies 'convert my SUI to USDC' as exit", () => {
    expect(classifyIntent("convert my SUI to USDC")).toEqual({
      intents: ["exit"],
      confidence: "high",
    });
  });

  it("classifies 'consolidate everything to USDC' as exit", () => {
    expect(classifyIntent("consolidate everything to USDC")).toEqual({
      intents: ["exit"],
      confidence: "high",
    });
  });
});

describe("classifyIntent — services (Channel A / MPP)", () => {
  it.each([
    "generate an image of a cat",
    "make me a logo",
    "transcribe this audio",
    "text-to-speech for this paragraph",
    "use elevenlabs to narrate this",
    "call a paid api for me",
  ])("routes %j to the services intent", (q) => {
    expect(classifyIntent(q).intents).toContain("services");
  });

  it("services intent surfaces both mpp_services and mpp_call together", () => {
    const tools = selectActiveTools({
      intents: ["services"],
      confidence: "high",
    });
    expect(tools).toContain("mpp_services");
    expect(tools).toContain("mpp_call");
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
  it("matches uppercase 'WITHDRAW MY USDC'", () => {
    expect(classifyIntent("WITHDRAW MY USDC")).toEqual({
      intents: ["exit"],
      confidence: "high",
    });
  });

  it("does NOT match 'lifesaver' as exit (substring guard)", () => {
    // 'savings' is an exit keyword but \bsavings?\b must not fire on
    // partial words.
    const result = classifyIntent("you are a lifesaver");
    expect(result.intents).toEqual(["general"]);
  });
});

describe("selectActiveTools", () => {
  it("includes ALWAYS_ON_TOOLS in every selection", () => {
    const tools = selectActiveTools({
      intents: ["send"],
      confidence: "high",
    });
    for (const t of ALWAYS_ON_TOOLS) {
      expect(tools).toContain(t);
    }
  });

  it("does NOT include render_canvas anywhere (canvas subsystem deleted)", () => {
    expect(ALWAYS_ON_TOOLS).not.toContain("render_canvas");
    const tools = selectActiveTools(classifyIntent(""));
    expect(tools).not.toContain("render_canvas");
  });

  it("returns the send set for a send intent", () => {
    const tools = selectActiveTools({
      intents: ["send"],
      confidence: "high",
    });
    expect(tools).toContain("balance_check");
    expect(tools).toContain("resolve_suins");
    expect(tools).toContain("transaction_history");
    expect(tools).toContain("send_transfer");
    expect(tools).not.toContain("withdraw");
    expect(tools).not.toContain("mpp_call");
  });

  it("returns the exit set for a grace-window exit intent", () => {
    const tools = selectActiveTools({
      intents: ["exit"],
      confidence: "high",
    });
    expect(tools).toContain("balance_check");
    expect(tools).toContain("withdraw");
    expect(tools).toContain("repay_debt");
    expect(tools).toContain("swap_quote");
    expect(tools).toContain("swap_execute");
    expect(tools).not.toContain("send_transfer");
  });

  it("dedupes the union for multi-intent (send + exit share balance_check)", () => {
    const tools = selectActiveTools({
      intents: ["send", "exit"],
      confidence: "medium",
    });
    const balanceCount = tools.filter((t) => t === "balance_check").length;
    expect(balanceCount).toBe(1);
  });

  it("general fallback is degrade-open: surviving writes + MPP + grace-window tools", () => {
    const tools = selectActiveTools(classifyIntent(""));
    // Reads
    expect(tools).toContain("balance_check");
    expect(tools).toContain("transaction_history");
    expect(tools).toContain("resolve_suins");
    // Writes (degrade-open)
    expect(tools).toContain("send_transfer");
    expect(tools).toContain("mpp_services");
    expect(tools).toContain("mpp_call");
    // §2d grace window (cut post-window)
    expect(tools).toContain("withdraw");
    expect(tools).toContain("repay_debt");
    expect(tools).toContain("swap_quote");
    expect(tools).toContain("swap_execute");
  });

  it("general fallback does NOT include deleted DeFi tools", () => {
    const tools = selectActiveTools(classifyIntent(""));
    for (const dead of [
      "save_deposit",
      "borrow",
      "claim_rewards",
      "harvest_rewards",
      "savings_info",
      "health_check",
      "rates_info",
      "portfolio_analysis",
      "token_prices",
      "pending_rewards",
      "yield_summary",
      "activity_summary",
      "spending_analytics",
      "explain_tx",
      "create_payment_link",
      "list_payment_links",
      "cancel_payment_link",
    ]) {
      expect(tools).not.toContain(dead);
    }
  });

  it("exposes resolve_suins for a bare SuiNS name-resolution query (F6)", () => {
    // Pre-F6 "resolve suins.sui" matched no intent → general fallback,
    // which omitted resolve_suins → the agent claimed the tool didn't
    // exist. Now SuiNS cues route to `send` (which carries it) AND it's
    // in the general fallback as a safety net.
    for (const q of [
      "resolve suins.sui",
      "what's the address for alice.sui",
      "resolve this suins name",
    ]) {
      const tools = selectActiveTools(classifyIntent(q));
      expect(tools).toContain("resolve_suins");
    }
  });
});
