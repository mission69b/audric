/**
 * Unit tests for `composePrepareSteps`.
 *
 * [SPEC_AI_SDK_HARDENING P3.1 — 2026-05-24]
 *
 * Covers: undefined filtering, single-fn passthrough, parallel
 * execution, field merge (system + activeTools coexist), and the
 * later-fn-wins precedence for same-field overrides.
 */

import { describe, expect, it, vi } from "vitest";
import { composePrepareSteps } from "./compose-prepare-steps";

describe("composePrepareSteps", () => {
  it("returns undefined when every input is undefined", () => {
    const result = composePrepareSteps(undefined, undefined);
    expect(result).toBeUndefined();
  });

  it("returns the lone fn untouched when only one is defined", () => {
    const fn = vi.fn(() => Promise.resolve({ system: "hello" }));
    const composed = composePrepareSteps(undefined, fn, undefined);
    expect(composed).toBe(fn);
  });

  it("merges system + activeTools from two callbacks", async () => {
    const fnA = vi.fn(() => Promise.resolve({ system: "system-from-A" }));
    const fnB = vi.fn(() =>
      Promise.resolve({ activeTools: ["tool_x", "tool_y"] })
    );
    const composed = composePrepareSteps(fnA, fnB);
    expect(composed).toBeDefined();
    if (!composed) {
      throw new Error("composed should be defined");
    }
    const result = await composed({ stepNumber: 0, messages: [] });
    expect(result).toEqual({
      system: "system-from-A",
      activeTools: ["tool_x", "tool_y"],
    });
  });

  it("runs callbacks in parallel via Promise.all", async () => {
    const order: number[] = [];
    const fnA = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(1);
      return { system: "A" };
    });
    const fnB = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(2);
      return { activeTools: ["t"] };
    });
    const composed = composePrepareSteps(fnA, fnB);
    await composed?.({ stepNumber: 0, messages: [] });
    // fnB finishes first (5ms < 20ms) — proves parallel execution.
    expect(order).toEqual([2, 1]);
  });

  it("later callback wins on same-field conflict", async () => {
    const fnA = vi.fn(() => Promise.resolve({ system: "from-A" }));
    const fnB = vi.fn(() => Promise.resolve({ system: "from-B" }));
    const composed = composePrepareSteps(fnA, fnB);
    const result = await composed?.({ stepNumber: 0, messages: [] });
    expect(result?.system).toBe("from-B");
  });

  it("forwards stepNumber + messages to each inner callback", async () => {
    const fnA = vi.fn(() => Promise.resolve({}));
    const fnB = vi.fn(() => Promise.resolve({}));
    const composed = composePrepareSteps(fnA, fnB);
    const args = {
      stepNumber: 7,
      messages: [{ role: "user" as const, content: "hi" }],
    };
    await composed?.(args);
    expect(fnA).toHaveBeenCalledWith(args);
    expect(fnB).toHaveBeenCalledWith(args);
  });

  it("handles sync callbacks (non-Promise return)", async () => {
    const fnA = vi.fn(() => ({ system: "sync-a" }));
    const fnB = vi.fn(() => ({ activeTools: ["t"] }));
    const composed = composePrepareSteps(fnA, fnB);
    const result = await composed?.({ stepNumber: 0, messages: [] });
    expect(result).toEqual({
      system: "sync-a",
      activeTools: ["t"],
    });
  });
});
