/**
 * Unit tests for the active-tools prepareStep factory.
 *
 * [SPEC_AI_SDK_HARDENING P3.1 — 2026-05-24]
 * [SPEC_AUDRIC_DEFI_REMOVAL §2e — 2026-06-10] Rewritten for the
 * post-collapse intent set (`send` / `services` / transitional `exit`
 * / `general`). The 9 finance intents and their tools are gone.
 *
 * Covers: registration filter, alwaysInclude merge, empty-input
 * fallback, step-0-cache semantics, multi-step reuse, undefined return
 * when no tools registered, low-confidence conversational carryover.
 */

import type { ModelMessage } from "ai";
import { describe, expect, it, vi } from "vitest";
import { buildActiveToolsPrepareStep } from "./active-tools-prepare-step";

// Audric's registered tool set — engine READ_TOOL_NAMES + WRITE_TOOL_NAMES
// minus the payment-link trio (deferred to Store; filtered at the chat
// route). Matches `packages/engine/src/tools/index.ts` post window-start
// cut. Tests pass these as the agent's `registeredToolNames` so the
// filter never drops anything unexpectedly.
const ALL_TOOLS: string[] = [
  // reads (5)
  "balance_check",
  "transaction_history",
  "swap_quote",
  "resolve_suins",
  "mpp_services",
  // writes (5)
  "withdraw",
  "send_transfer",
  "repay_debt",
  "swap_execute",
  "mpp_call",
];

function userMessage(text: string): ModelMessage {
  return { role: "user", content: text };
}

describe("buildActiveToolsPrepareStep", () => {
  it("returns undefined when no tools registered", () => {
    const fn = buildActiveToolsPrepareStep({ registeredToolNames: [] });
    expect(fn).toBeUndefined();
  });

  it("returns the send subset for 'send 5 USDC to @alice' on step 0", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    expect(fn).toBeDefined();
    const result = await fn?.({
      stepNumber: 0,
      messages: [userMessage("send 5 USDC to @alice")],
    });
    expect(result?.activeTools).toBeDefined();
    expect(result?.activeTools).toHaveLength(4);
    expect(result?.activeTools).toContain("send_transfer");
    expect(result?.activeTools).toContain("resolve_suins");
    expect(result?.activeTools).toContain("balance_check");
    expect(result?.activeTools).not.toContain("mpp_call");
  });

  it("filters out tool names not in registeredToolNames", async () => {
    // Register only a tiny subset — intent's tool list will be filtered.
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ["send_transfer", "resolve_suins"],
    });
    const result = await fn?.({
      stepNumber: 0,
      messages: [userMessage("send 5 USDC to @alice")],
    });
    expect(result?.activeTools).toEqual(
      expect.arrayContaining(["send_transfer", "resolve_suins"])
    );
    expect(result?.activeTools).not.toContain("balance_check");
    expect(result?.activeTools).not.toContain("transaction_history");
  });

  it("includes alwaysInclude tools regardless of intent", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: [...ALL_TOOLS, "perplexity_search"],
      alwaysInclude: ["perplexity_search"],
    });
    const result = await fn?.({
      stepNumber: 0,
      messages: [userMessage("send 5 USDC to @alice")],
    });
    expect(result?.activeTools).toContain("perplexity_search");
    expect(result?.activeTools).toContain("send_transfer");
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
      messages: [userMessage("send 5 USDC to @alice")],
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
    // The degrade-open general fallback carries the reads + every
    // surviving write. Test stays on `toContain` only so future count
    // changes don't break this case unnecessarily.
    expect(result?.activeTools).toContain("balance_check");
    expect(result?.activeTools).toContain("send_transfer");
    expect(result?.activeTools).toContain("mpp_call");
  });

  it("caches step 0's classification for step 1+", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    const r0 = await fn?.({
      stepNumber: 0,
      messages: [userMessage("send 5 USDC to @alice")],
    });
    const r1 = await fn?.({
      stepNumber: 1,
      messages: [userMessage("send 5 USDC to @alice")],
    });
    const r2 = await fn?.({
      stepNumber: 2,
      messages: [userMessage("send 5 USDC to @alice")],
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
      messages: [userMessage("send 5 USDC to @alice")],
    });
    // Step 1 with totally different messages — intent shouldn't change
    // because we cached step 0's result.
    const r1 = await fn?.({
      stepNumber: 1,
      messages: [userMessage("withdraw my savings")],
    });
    expect(r1?.activeTools).toEqual(r0?.activeTools);
    expect(r1?.activeTools).toContain("send_transfer");
    expect(r1?.activeTools).not.toContain("withdraw");
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
          content: [{ type: "text", text: "send 5 USDC to @alice" }],
        },
      ],
    });
    expect(result?.activeTools).toContain("send_transfer");
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
            { type: "text", text: "withdraw my savings" },
            { type: "text", text: "and send 5 USDC to bob" },
          ],
        },
      ],
    });
    // Multi-intent: exit + send → union of both tool rows.
    expect(result?.activeTools).toContain("withdraw");
    expect(result?.activeTools).toContain("send_transfer");
    expect(result?.activeTools).toContain("resolve_suins");
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
        userMessage("repay my debt"),
        { role: "assistant", content: "ok let me check" },
      ],
    });
    // Latest user is "repay my debt", not the older "how are you".
    expect(result?.activeTools).toContain("repay_debt");
    expect(result?.activeTools).toContain("withdraw");
  });

  it("handles HITL resume turn (tool role messages don't break classification)", async () => {
    // Replicates the actual ModelMessage shape produced by
    // `convertToModelMessages` on a resume turn:
    //   1. user: "withdraw 10 USDC" (original text prompt)
    //   2. assistant: [tool-call(withdraw, ...)]
    //   3. tool:      [tool-result(...)]
    // AI SDK puts tool-results in `role: 'tool'` (not `role: 'user'`),
    // so the extractLatestUserMessage loop walks past it and finds the
    // ORIGINAL "withdraw 10 USDC" prompt. Result: same intent + same
    // tool subset as the original turn.
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    const messages: ModelMessage[] = [
      userMessage("withdraw 10 USDC"),
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "abc",
            toolName: "withdraw",
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
            toolName: "withdraw",
            output: { type: "json", value: { ok: true } },
          },
        ],
      },
    ];
    const result = await fn?.({ stepNumber: 0, messages });
    expect(result?.activeTools).toContain("withdraw");
    expect(result?.activeTools).toContain("balance_check");
    expect(result?.activeTools).toContain("repay_debt");
  });

  // -------------------------------------------------------------------------
  // Conversational carryover (HOTFIX 2026-05-24)
  // -------------------------------------------------------------------------
  //
  // When the current user message classifies as `low` confidence (no
  // keyword matches), the closure looks back ONE user-message earlier
  // and inherits THAT message's intent if it was high/medium confidence.
  // This handles common follow-up phrasings + typo'd continuations
  // that don't carry any send/exit/services keywords on their own.
  // -------------------------------------------------------------------------

  it("carryover: inherits previous turn's exit intent on low-confidence follow-up", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    // Turn 1 was an exit question, turn 2 is a bare continuation with
    // no exit keywords of its own.
    const result = await fn?.({
      stepNumber: 0,
      messages: [
        userMessage("withdraw my navi savings"),
        { role: "assistant", content: "you have 20.66 USDC deposited" },
        userMessage("yea lets pull all of it out"),
      ],
    });
    // Should inherit `exit` intent → withdraw must be active.
    expect(result?.activeTools).toContain("withdraw");
    expect(result?.activeTools).toContain("repay_debt");
    expect(result?.activeTools).toContain("balance_check");
  });

  it("carryover: inherits previous turn's services intent on bare confirmation", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    const result = await fn?.({
      stepNumber: 0,
      messages: [
        userMessage("generate an image of a sunset over sui"),
        { role: "assistant", content: "that'll cost $0.04 via fal.ai" },
        userMessage("yes do it"),
      ],
    });
    expect(result?.activeTools).toContain("mpp_services");
    expect(result?.activeTools).toContain("mpp_call");
  });

  it("carryover: does NOT inherit when previous turn was also low-confidence", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    // Both turns are low-confidence generic phrasings. Carryover should
    // NOT loop — fall through to the (degrade-open) general fallback.
    const result = await fn?.({
      stepNumber: 0,
      messages: [
        userMessage("hi there"),
        { role: "assistant", content: "hello!" },
        userMessage("ok thanks"),
      ],
    });
    // Degrade-open `general` fallback includes the surviving writes so
    // the LLM never hallucinates a missing write tool.
    expect(result?.activeTools).toContain("send_transfer");
    expect(result?.activeTools).toContain("mpp_call");
  });

  it("carryover: does NOT trigger when current turn ITSELF is high-confidence", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    // Current turn matches `send` → no carryover, just normal
    // classification. The previous turn's `exit` intent should NOT
    // pollute this turn's tool set.
    const result = await fn?.({
      stepNumber: 0,
      messages: [
        userMessage("withdraw my savings"),
        { role: "assistant", content: "ok" },
        userMessage("send 5 USDC to @bob"),
      ],
    });
    expect(result?.activeTools).toContain("send_transfer");
    expect(result?.activeTools).toContain("resolve_suins");
    // The send intent's tool set doesn't include `withdraw`, so if
    // carryover had over-inherited from `exit` we'd see it.
    expect(result?.activeTools).not.toContain("withdraw");
  });

  it("carryover: no previous user message → falls through to general fallback", async () => {
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    // First turn of a conversation — current message classifies as low
    // (no keywords) and there's no previous user message to inherit from.
    const result = await fn?.({
      stepNumber: 0,
      messages: [userMessage("hi audric")],
    });
    // Degrade-open general fallback. No hallucinated tool absence.
    expect(result?.activeTools).toContain("send_transfer");
    expect(result?.activeTools).toContain("balance_check");
  });

  it("carryover: emits outcome=carried-over in observability log", async () => {
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {
      // silence
    });
    const fn = buildActiveToolsPrepareStep({
      registeredToolNames: ALL_TOOLS,
    });
    await fn?.({
      stepNumber: 0,
      messages: [
        userMessage("send 5 USDC to @alice"),
        { role: "assistant", content: "ok" },
        userMessage("yea go ahead"),
      ],
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("outcome=carried-over")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("intents=send")
    );
    logSpy.mockRestore();
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
      messages: [userMessage("send 5 USDC to @alice")],
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[web-v2 active-tools-prepare-step] step=0")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("intents=send")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("confidence=high")
    );
    logSpy.mockRestore();
  });
});
