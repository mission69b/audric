/**
 * [S.278 / SPEC 272 Lever 1] Test the bounded-batch runner used by the
 * two daily fan-out crons.
 *
 * Scope:
 *   - Order preservation (results indexed identically to input)
 *   - Batch sizing (N=10 default, custom values clamped >= 1)
 *   - Intra-batch delay applied between batches, NOT after the last one
 *   - Per-batch telemetry callback fires once per batch
 *   - Process throws → rejected slot, NEVER aborts subsequent batches
 *   - Empty input → no-op
 *
 * Does NOT exercise the actual cron bodies — those are integration-
 * tested in production (live cron logs). This test is the unit-level
 * confidence that the helper itself is correct.
 */

import { describe, expect, it, vi } from "vitest";
import { runInBatches } from "./batch-runner";

describe("runInBatches — SPEC 272 Lever 1", () => {
  it("returns empty result for empty input without sleeping", async () => {
    const t0 = Date.now();
    const out = await runInBatches({
      items: [],
      process: async () => "x",
      intraBatchDelayMs: 1000,
    });
    expect(out.results).toEqual([]);
    expect(out.totalBatches).toBe(0);
    expect(Date.now() - t0).toBeLessThan(50);
  });

  it("preserves input order across multiple batches", async () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const out = await runInBatches({
      items,
      process: async (n) => n * 2,
      batchSize: 10,
      intraBatchDelayMs: 0,
    });
    expect(out.totalBatches).toBe(3);
    expect(out.results).toHaveLength(25);
    for (let i = 0; i < 25; i++) {
      const r = out.results[i];
      expect(r.status).toBe("fulfilled");
      if (r.status === "fulfilled") {
        expect(r.value).toBe(i * 2);
      }
    }
  });

  it("clamps batchSize and intraBatchDelayMs to safe minimums", async () => {
    const items = [1, 2, 3];
    const out = await runInBatches({
      items,
      process: async (n) => n,
      batchSize: 0,
      intraBatchDelayMs: -100,
    });
    // batchSize clamped to 1 → 3 batches
    expect(out.totalBatches).toBe(3);
    expect(
      out.results.map((r) => (r.status === "fulfilled" ? r.value : null))
    ).toEqual([1, 2, 3]);
  });

  it("uses N=10 / M=500 as defaults", async () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    const onBatchComplete = vi.fn();
    const t0 = Date.now();
    const out = await runInBatches({
      items,
      process: async (n) => n,
      onBatchComplete,
    });
    const elapsed = Date.now() - t0;
    // 12 items / 10 per batch = 2 batches, 1 intra-batch delay of 500ms
    expect(out.totalBatches).toBe(2);
    expect(onBatchComplete).toHaveBeenCalledTimes(2);
    expect(onBatchComplete.mock.calls[0][0].batchSize).toBe(10);
    expect(onBatchComplete.mock.calls[1][0].batchSize).toBe(2);
    // Loose lower bound — the 500ms intra-batch delay should be paid once.
    expect(elapsed).toBeGreaterThanOrEqual(450);
  }, 10_000);

  it("applies intra-batch delay between batches but NOT after the last", async () => {
    const items = Array.from({ length: 3 }, (_, i) => i);
    const t0 = Date.now();
    await runInBatches({
      items,
      process: async (n) => n,
      batchSize: 1, // 3 batches → 2 intra-batch delays expected
      intraBatchDelayMs: 100,
    });
    const elapsed = Date.now() - t0;
    // 2 delays × 100ms = 200ms minimum. If we delayed after the last
    // batch too, we'd see 300ms+.
    expect(elapsed).toBeGreaterThanOrEqual(180);
    expect(elapsed).toBeLessThan(280);
  });

  it("invokes onBatchComplete once per batch with size + duration", async () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const onBatchComplete = vi.fn();
    await runInBatches({
      items,
      process: async (n) => {
        await new Promise((r) => setTimeout(r, 10));
        return n;
      },
      batchSize: 10,
      intraBatchDelayMs: 0,
      onBatchComplete,
    });
    expect(onBatchComplete).toHaveBeenCalledTimes(3);
    expect(onBatchComplete.mock.calls[0][0]).toMatchObject({
      batchIndex: 0,
      batchSize: 10,
    });
    expect(onBatchComplete.mock.calls[1][0]).toMatchObject({
      batchIndex: 1,
      batchSize: 10,
    });
    expect(onBatchComplete.mock.calls[2][0]).toMatchObject({
      batchIndex: 2,
      batchSize: 5,
    });
    // Each batch with ~10ms per-item parallel work should land >= 10ms.
    for (const call of onBatchComplete.mock.calls) {
      expect(call[0].durationMs).toBeGreaterThanOrEqual(8);
    }
  });

  it("captures process errors as rejected slots and continues across batches", async () => {
    const items = [1, 2, 3, 4, 5];
    const out = await runInBatches({
      items,
      process: async (n) => {
        await Promise.resolve();
        if (n === 3) {
          throw new Error(`boom at ${n}`);
        }
        return n * 10;
      },
      batchSize: 2,
      intraBatchDelayMs: 0,
    });
    expect(out.totalBatches).toBe(3);
    expect(out.results[0]).toEqual({ status: "fulfilled", value: 10 });
    expect(out.results[1]).toEqual({ status: "fulfilled", value: 20 });
    expect(out.results[2].status).toBe("rejected");
    if (out.results[2].status === "rejected") {
      expect((out.results[2].reason as Error).message).toBe("boom at 3");
    }
    expect(out.results[3]).toEqual({ status: "fulfilled", value: 40 });
    expect(out.results[4]).toEqual({ status: "fulfilled", value: 50 });
  });

  it("runs items WITHIN a batch in parallel (not serially)", async () => {
    const items = Array.from({ length: 5 }, (_, i) => i);
    const t0 = Date.now();
    await runInBatches({
      items,
      process: async () => {
        await new Promise((r) => setTimeout(r, 50));
      },
      batchSize: 5,
      intraBatchDelayMs: 0,
    });
    const elapsed = Date.now() - t0;
    // 5 items at 50ms each, parallel → ~50ms. Serial would be 250ms.
    expect(elapsed).toBeLessThan(150);
  });

  it("batching cuts wall time vs sequential for slow-fetch fixture (proves the lever 1 thesis)", async () => {
    // 30 items × 50ms each.
    // Sequential: 30 × 50 = 1500ms.
    // Batched 10/0ms delay: 3 batches × ~50ms = ~150ms.
    const items = Array.from({ length: 30 }, (_, i) => i);
    const slow = async (n: number) => {
      await new Promise((r) => setTimeout(r, 50));
      return n;
    };

    const tSeq = Date.now();
    for (const item of items) {
      await slow(item);
    }
    const seqMs = Date.now() - tSeq;

    const tBatch = Date.now();
    await runInBatches({
      items,
      process: slow,
      batchSize: 10,
      intraBatchDelayMs: 0,
    });
    const batchMs = Date.now() - tBatch;

    // Batched should be at least 5× faster.
    expect(batchMs * 5).toBeLessThan(seqMs);
  }, 10_000);
});
