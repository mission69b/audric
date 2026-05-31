/**
 * Regression test for the reasoning-before-text ordering invariant.
 *
 * Guards the [U2 — 2026-05-31] fix in `app/api/chat/route.ts`: the
 * assistant `text` UIMessage part must open LAZILY (first non-empty
 * `text-delta` / `error`), never eagerly at `start-step`. Eager opening
 * pushed the empty `text` part ahead of the model's `reasoning-*` chunks
 * in `parts[]`, so the <Reasoning> accordion rendered BELOW the answer
 * ("thinking accordion comes last"). Lazy opening keeps reasoning first.
 *
 * If a future edit re-introduces eager `text-start` (or drops the empty-
 * delta guard), the ordering test below flips red.
 */

import { describe, expect, it } from "vitest";
import {
  type StreamFramingChunk,
  shouldEmitTextStart,
} from "./stream-text-framing";

describe("shouldEmitTextStart — lazy text-part open decision", () => {
  it("does NOT open on a reasoning-start chunk", () => {
    expect(shouldEmitTextStart({ type: "reasoning-start" }, false)).toBe(false);
  });

  it("does NOT open on a reasoning-delta chunk", () => {
    expect(
      shouldEmitTextStart({ type: "reasoning-delta", text: "hmm" }, false)
    ).toBe(false);
  });

  it("does NOT open on a tool-call chunk", () => {
    expect(shouldEmitTextStart({ type: "tool-call" }, false)).toBe(false);
  });

  it("does NOT open on lifecycle chunks (start / start-step / finish)", () => {
    expect(shouldEmitTextStart({ type: "start" }, false)).toBe(false);
    expect(shouldEmitTextStart({ type: "start-step" }, false)).toBe(false);
    expect(shouldEmitTextStart({ type: "finish-step" }, false)).toBe(false);
    expect(shouldEmitTextStart({ type: "finish" }, false)).toBe(false);
  });

  it("does NOT open on an empty text-delta (mirrors translateChunk skip)", () => {
    expect(shouldEmitTextStart({ type: "text-delta", text: "" }, false)).toBe(
      false
    );
  });

  it("does NOT open when `text` is missing or non-string", () => {
    expect(shouldEmitTextStart({ type: "text-delta" }, false)).toBe(false);
    expect(shouldEmitTextStart({ type: "text-delta", text: 42 }, false)).toBe(
      false
    );
  });

  it("opens on the first non-empty text-delta", () => {
    expect(
      shouldEmitTextStart({ type: "text-delta", text: "Here" }, false)
    ).toBe(true);
  });

  it("opens on an error chunk (so the error renders as prose)", () => {
    expect(shouldEmitTextStart({ type: "error" }, false)).toBe(true);
  });

  it("NEVER re-opens once already started (idempotent across deltas)", () => {
    expect(
      shouldEmitTextStart({ type: "text-delta", text: "more" }, true)
    ).toBe(false);
    expect(shouldEmitTextStart({ type: "error" }, true)).toBe(false);
  });
});

describe("ordering invariant — reasoning part precedes text part", () => {
  /**
   * Replays a representative Anthropic stream (thinking → tool → prose)
   * through the exact framing logic the route uses, recording the index
   * at which the `text-start` frame would be written relative to where
   * reasoning frames land. Asserts text opens strictly AFTER reasoning.
   */
  function indexOfTextStart(chunks: StreamFramingChunk[]): number {
    let started = false;
    for (let i = 0; i < chunks.length; i++) {
      if (shouldEmitTextStart(chunks[i], started)) {
        started = true;
        return i;
      }
    }
    return -1;
  }

  it("opens text only after all leading reasoning chunks", () => {
    const stream: StreamFramingChunk[] = [
      { type: "start-step" },
      { type: "reasoning-start" },
      { type: "reasoning-delta", text: "Let me check the rates…" },
      { type: "reasoning-end" },
      { type: "tool-call" },
      { type: "tool-result" },
      { type: "text-delta", text: "Your best move is…" },
      { type: "text-delta", text: " save into USDsui." },
      { type: "finish" },
    ];

    const lastReasoningIdx = stream.reduce(
      (acc, c, i) => (c.type.startsWith("reasoning") ? i : acc),
      -1
    );
    const textStartIdx = indexOfTextStart(stream);

    expect(textStartIdx).toBeGreaterThan(lastReasoningIdx);
    // And it lands on the first real prose delta, not the tool chunks.
    expect(stream[textStartIdx]).toEqual({
      type: "text-delta",
      text: "Your best move is…",
    });
  });

  it("never opens text for a tool-only / reasoning-only turn", () => {
    const stream: StreamFramingChunk[] = [
      { type: "start-step" },
      { type: "reasoning-start" },
      { type: "reasoning-delta", text: "thinking" },
      { type: "reasoning-end" },
      { type: "tool-call" },
      { type: "tool-result" },
      { type: "finish" },
    ];
    expect(indexOfTextStart(stream)).toBe(-1);
  });
});
