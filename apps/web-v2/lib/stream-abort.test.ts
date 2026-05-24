/**
 * Unit tests for `lib/stream-abort.ts` — SPEC_AUDRIC_STREAM_RESUME
 * Phase 3.
 *
 * Tests the same-instance fast path: register handler → publish abort
 * → handler fires. Doesn't exercise live Redis pub/sub (that's the
 * cross-instance test path; covered by the local fire short-circuit
 * in `publishAbort` so we get integration coverage of the
 * Map-based dispatch table without standing up a Redis container).
 *
 * Module-scoped state across tests is reset via the `__resetForTests`
 * helper exported from the module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ORIGINAL_REDIS = process.env.REDIS_URL;

async function loadFreshModule() {
  vi.resetModules();
  return await import("./stream-abort");
}

describe("lib/stream-abort", () => {
  beforeEach(() => {
    // Run tests WITHOUT REDIS_URL — exercises the local-only path,
    // which is what we want to unit-test. (Cross-instance pub/sub
    // requires a live Redis; covered by manual smoke + prod soak.)
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    if (ORIGINAL_REDIS === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = ORIGINAL_REDIS;
    }
  });

  it("registers a handler and fires it on publishAbort (same-instance fast path)", async () => {
    const mod = await loadFreshModule();
    const handler = vi.fn();
    const cleanup = await mod.subscribeToAbort("stream-1", handler);

    expect(handler).not.toHaveBeenCalled();
    const receivers = await mod.publishAbort("stream-1");

    expect(handler).toHaveBeenCalledTimes(1);
    // No Redis → publish returns the local-fire count (1).
    expect(receivers).toBe(1);

    cleanup();
  });

  it("ignores aborts for unknown stream ids", async () => {
    const mod = await loadFreshModule();
    const handler = vi.fn();
    const cleanup = await mod.subscribeToAbort("stream-1", handler);

    const receivers = await mod.publishAbort("unknown-stream");

    expect(handler).not.toHaveBeenCalled();
    // No Redis and no local handler → publish returns 0.
    expect(receivers).toBe(0);

    cleanup();
  });

  it("cleanup() removes the handler so subsequent aborts do not fire", async () => {
    const mod = await loadFreshModule();
    const handler = vi.fn();
    const cleanup = await mod.subscribeToAbort("stream-1", handler);

    cleanup();

    const receivers = await mod.publishAbort("stream-1");

    expect(handler).not.toHaveBeenCalled();
    expect(receivers).toBe(0);
  });

  it("isolates handlers across multiple stream ids", async () => {
    const mod = await loadFreshModule();
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    const cleanupA = await mod.subscribeToAbort("stream-a", handlerA);
    const cleanupB = await mod.subscribeToAbort("stream-b", handlerB);

    await mod.publishAbort("stream-a");

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).not.toHaveBeenCalled();

    await mod.publishAbort("stream-b");

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);

    cleanupA();
    cleanupB();
  });

  it("swallows handler exceptions without affecting other state", async () => {
    const mod = await loadFreshModule();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const throwingHandler = vi.fn(() => {
      throw new Error("simulated handler failure");
    });
    const cleanup = await mod.subscribeToAbort("stream-1", throwingHandler);

    // Publish must NOT throw even though the handler does.
    await expect(mod.publishAbort("stream-1")).resolves.toBe(1);

    expect(throwingHandler).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalled();

    cleanup();
    consoleErrorSpy.mockRestore();
  });

  it("late publishAbort after cleanup is a safe no-op", async () => {
    const mod = await loadFreshModule();
    const handler = vi.fn();
    const cleanup = await mod.subscribeToAbort("stream-1", handler);
    cleanup();

    // Multiple late publishes — no error, no handler fire.
    await mod.publishAbort("stream-1");
    await mod.publishAbort("stream-1");
    await mod.publishAbort("stream-1");

    expect(handler).not.toHaveBeenCalled();
  });

  it("publishAbort is idempotent — second call does not re-fire handler", async () => {
    // Guards the delete-before-fire invariant in `publishAbort` that
    // prevents the same-instance Redis-fanout double-fire (the bug
    // that landed in the Phase 3 self-audit). After the first publish
    // fires the handler, the entry is removed from the dispatch table
    // → any further publishes (including the Redis fanout looping back
    // into pSubscribe) are no-ops.
    const mod = await loadFreshModule();
    const handler = vi.fn();
    const cleanup = await mod.subscribeToAbort("stream-1", handler);

    const first = await mod.publishAbort("stream-1");
    const second = await mod.publishAbort("stream-1");
    const third = await mod.publishAbort("stream-1");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(first).toBe(1);
    expect(second).toBe(0);
    expect(third).toBe(0);

    cleanup();
  });
});
