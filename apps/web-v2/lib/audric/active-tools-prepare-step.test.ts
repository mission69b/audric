/**
 * Unit tests for the active-tools prepareStep factory.
 *
 * [SPEC_AI_SDK_HARDENING P3.1 — 2026-05-24]
 *
 * Covers: registration filter, alwaysInclude merge, empty-input
 * fallback, step-0-cache semantics, multi-step reuse, undefined return
 * when no tools registered.
 */

import type { ModelMessage } from "ai";
import { describe, expect, it, vi } from "vitest";
import { buildActiveToolsPrepareStep } from "./active-tools-prepare-step";

// All 26 engine tool names — matches READ_TOOLS + WRITE_TOOLS in
// `packages/engine/src/tools/index.ts` post-S.277. Tests pass these as
// the agent's `registeredToolNames` so the filter never drops anything
// unexpectedly.
const ALL_TOOLS: string[] = [
  // reads (18)
  "render_canvas",
  "balance_check",
  "savings_info",
  "health_check",
  "rates_info",
  "transaction_history",
  "swap_quote",
  "explain_tx",
  "portfolio_analysis",
  "token_prices",
  "list_payment_links",
  "cancel_payment_link",
  "create_payment_link",
  "spending_analytics",
  "yield_summary",
  "activity_summary",
  "resolve_suins",
  "pending_rewards",
  // writes (8)
  "save_deposit",
  "withdraw",
  "send_transfer",
  "borrow",
  "repay_debt",
  "claim_rewards",
  "harvest_rewards",
  "swap_execute",
];

function userMessage(text: string): ModelMessage {
  return { role: "user", content: text };
}

describe("buildActiveToolsPrepareStep", () => {
  it("returns undefined when no tools registered", () => {
    const fn = buildActiveToolsPrepareStep({ registeredToolNames: [] });
    expect(fn).toBeUndefined();
  });

  it("returns 7 tools for 'save 10 USDC' input on step 0", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    expect(fn).toBeDefined();
    const result = await fn?.({
      stepNumber: 0,
      messages: [userMessage("save 10 USDC")],
    });
    expect(result?.activeTools).toBeDefined();
    expect(result?.activeTools).toHaveLength(7);
    expect(result?.activeTools).toContain("save_deposit");
    expect(result?.activeTools).toContain("withdraw");
    expect(result?.activeTools).toContain("render_canvas");
  });

  it("filters out tool names not in registeredToolNames", async () => {
    // Register only a tiny subset — intent's tool list will be filtered.
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ["save_deposit", "render_canvas"],
    });
    const result = await fn?.({
      stepNumber: 0,
      messages: [userMessage("save 10 USDC")],
    });
    expect(result?.activeTools).toEqual(
      expect.arrayContaining(["save_deposit", "render_canvas"])
    );
    expect(result?.activeTools).not.toContain("balance_check");
    expect(result?.activeTools).not.toContain("savings_info");
  });

  it("includes alwaysInclude tools regardless of intent", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: [...ALL_TOOLS, "perplexity_search"],
      alwaysInclude: ["perplexity_search"],
    });
    const result = await fn?.({
      stepNumber: 0,
      messages: [userMessage("save 10 USDC")],
    });
    expect(result?.activeTools).toContain("perplexity_search");
    expect(result?.activeTools).toContain("save_deposit");
  });

  it("filters alwaysInclude tools that aren't registered", async () => {
    // alwaysInclude says perplexity_search, but it's not in registeredToolNames.
    // The filter should drop it.
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
      alwaysInclude: ["perplexity_search"],
    });
    const result = await fn?.({
      stepNumber: 0,
      messages: [userMessage("save 10 USDC")],
    });
    expect(result?.activeTools).not.toContain("perplexity_search");
  });

  it("falls back to general for empty-input resume turn (step 0)", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    // Empty user message (tool-result-only resume turn shape; we test
    // with an empty user content since ModelMessage forces a role)
    const result = await fn?.({
      stepNumber: 0,
      messages: [{ role: "user", content: "" }],
    });
    expect(result?.activeTools).toBeDefined();
    // general fallback (6 tools) + render_canvas = 7
    expect(result?.activeTools).toContain("balance_check");
    expect(result?.activeTools).toContain("portfolio_analysis");
    expect(result?.activeTools).toContain("render_canvas");
  });

  it("caches step 0's classification for step 1+", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    const r0 = await fn?.({
      stepNumber: 0,
      messages: [userMessage("save 10 USDC")],
    });
    const r1 = await fn?.({
      stepNumber: 1,
      messages: [userMessage("save 10 USDC")],
    });
    const r2 = await fn?.({
      stepNumber: 2,
      messages: [userMessage("save 10 USDC")],
    });
    expect(r0?.activeTools).toEqual(r1?.activeTools);
    expect(r1?.activeTools).toEqual(r2?.activeTools);
  });

  it("step 1+ does NOT re-classify even if messages change (cache persistence)", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    const r0 = await fn?.({
      stepNumber: 0,
      messages: [userMessage("save 10 USDC")],
    });
    // Step 1 with totally different messages — intent shouldn't change
    // because we cached step 0's result.
    const r1 = await fn?.({
      stepNumber: 1,
      messages: [userMessage("borrow 50 USDC")],
    });
    expect(r1?.activeTools).toEqual(r0?.activeTools);
    expect(r1?.activeTools).toContain("save_deposit");
    expect(r1?.activeTools).not.toContain("borrow");
  });

  it("extracts text from array-shaped user content", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    const result = await fn?.({
      stepNumber: 0,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "save 10 USDC" }],
        },
      ],
    });
    expect(result?.activeTools).toContain("save_deposit");
  });

  it("joins multiple text parts in user content", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    const result = await fn?.({
      stepNumber: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "save 10 USDC" },
            { type: "text", text: "and check my borrow rate" },
          ],
        },
      ],
    });
    // Multi-intent: save + borrow + rates (the word "rate" matches rates intent)
    expect(result?.activeTools).toContain("save_deposit");
    expect(result?.activeTools).toContain("borrow");
    expect(result?.activeTools).toContain("rates_info");
  });

  it("walks backwards to find the latest user message", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    const result = await fn?.({
      stepNumber: 0,
      messages: [
        userMessage("how are you"),
        { role: "assistant", content: "i'm well" },
        userMessage("borrow 50 USDC"),
        { role: "assistant", content: "ok let me check" },
      ],
    });
    // Latest user is "borrow 50 USDC", not the older "how are you".
    expect(result?.activeTools).toContain("borrow");
    expect(result?.activeTools).toContain("repay_debt");
  });

  it("handles HITL resume turn (tool role messages don't break classification)", async () => {
    // Replicates the actual ModelMessage shape produced by
    // `convertToModelMessages` on a resume turn:
    //   1. user: "save 10 USDC" (original text prompt)
    //   2. assistant: [tool-call(save_deposit, ...)]
    //   3. tool:      [tool-result(...)]
    // AI SDK puts tool-results in `role: 'tool'` (not `role: 'user'`),
    // so the extractLatestUserMessage loop walks past it and finds the
    // ORIGINAL "save 10 USDC" prompt. Result: same intent + same tool
    // subset as the original turn.
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    const messages: ModelMessage[] = [
      userMessage("save 10 USDC"),
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "abc",
            toolName: "save_deposit",
            input: { amount: 10 },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "abc",
            toolName: "save_deposit",
            output: { type: "json", value: { ok: true } },
          },
        ],
      },
    ];
    const result = await fn?.({ stepNumber: 0, messages });
    expect(result?.activeTools).toContain("save_deposit");
    expect(result?.activeTools).toContain("savings_info");
    expect(result?.activeTools).toContain("withdraw");
  });

  it("emits structured log line on every step", async () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {
      // silence — only the spy assertions matter
    });
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    await fn?.({
      stepNumber: 0,
      messages: [userMessage("save 10 USDC")],
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[web-v2 active-tools-prepare-step] step=0")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("intents=save")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("confidence=high")
    );
    logSpy.mockRestore();
  });
});
