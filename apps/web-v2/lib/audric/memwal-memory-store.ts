/**
 * `MemWalMemoryStore` — audric's adapter from the engine's pluggable
 * `MemoryStore` interface (`packages/engine/src/memory/store.ts`) onto
 * the MemWal SDK (`@mysten-incubation/memwal@0.0.4+`).
 *
 * **What this is.** The production memory backend wired in v0.7d
 * Phase 1 (S.215, 2026-05-21). The engine's `InMemoryMemoryStore` is
 * the test-default mock (deterministic, no infra); this class is the
 * Mysten-operated relayer + Walrus + SEAL backend the engine targets
 * in production per `BENEFITS_SPEC_v07d.md`.
 *
 * **Contract mapping — engine ↔ MemWal SDK (Phase 0 spike findings):**
 *
 *   | Engine `MemoryStore`            | MemWal SDK                     |
 *   |---------------------------------|--------------------------------|
 *   | `remember(text, { namespace })` | `memwal.remember(text, ns?)`   |
 *   |   → `Promise<void>`             |   → fire-and-forget (returns   |
 *   |                                 |     202 Accepted with job_id   |
 *   |                                 |     IMMEDIATELY; embed + SEAL  |
 *   |                                 |     + Walrus + index continues |
 *   |                                 |     in background)             |
 *   | `recall(query, { topK, ns })`   | `memwal.recall(query, K?, ns?)`|
 *   |   → `MemoryRecord[]`            |   → `RecallResult{results[]}`  |
 *   |                                 |     where each result has      |
 *   |                                 |     `{ blob_id, text, distance}`|
 *   | `destroy()`                     | `memwal.destroy()` — wipes     |
 *   |                                 |   private/public keys from V8  |
 *   |                                 |   heap                         |
 *
 * **Latency expectations (per engine `MemoryStore` contract +
 * `memory-injection-architecture.mdc` performance contract):**
 *
 *   - `remember()`: returns immediately (background pipeline ~25-42s
 *     p95 server-side; the engine never waits for the terminal job
 *     state — fire-and-forget is the design point).
 *   - `recall()`: p95 470-675ms single (per engine `store.ts` L84 +
 *     `scripts/memwal-smoke.ts`). The engine caches recall results
 *     across steps within a single turn via `ToolContext.memoryCache`,
 *     so multi-step turns hit the network exactly once. Engine
 *     contract: ≤700ms single / ≤50ms cached.
 *
 * **Failure mode.** The engine wraps `recall()` calls in try/catch
 * (`v2/engine.ts` `buildPrepareStepHook`) and degrades to an empty
 * `<memory_recall>` block on throw. This adapter SHOULD throw on hard
 * failures (network, auth, signature rejection) so the engine sees a
 * clear signal — DO NOT silently return `[]` on error or the engine's
 * graceful-degradation logging never fires.
 *
 * **`forget()` NOT IMPLEMENTED in Phase 1.** MemWal SDK v0.0.4 has no
 * `forget` API (per smoke harness header comment in
 * `packages/engine/scripts/memwal-smoke.ts`). D-10 lock requires
 * user-controlled forget for the Settings Memory UI's "forget this"
 * button (Phase 3 / G4 acceptance) — Phase 3 design ships an audric-
 * side `ForgottenMemory` Prisma tombstone table + recall-time filter
 * (cleanest semantics; no MemWal SDK dependency). Until then, this
 * adapter does NOT expose `forget`.
 *
 * **Phase 1 scope (founder-locked 2026-05-21) — singleton or per-user?**
 * This adapter is constructed against the singleton `memwal` client
 * exported from `lib/memwal.ts` (one founder-owned MemWal account +
 * per-user namespace strings — `audric:user:<userId>`). Phase 1.5 /
 * Phase 2 swaps the construction site (`lib/memwal.ts` becomes a
 * per-user factory) without changing this adapter's shape. The
 * `defaultNamespace` constructor arg is how the audric route passes
 * per-user scoping today — it becomes a no-op (one namespace per
 * account) when per-user accounts ship.
 */
import type { MemWal } from "@mysten-incubation/memwal";
import type { MemoryRecord, MemoryStore } from "@t2000/engine";

export interface MemWalMemoryStoreOptions {
  /**
   * MemWal client instance (typically `lib/memwal.ts`'s exported
   * singleton). The adapter does not own the lifecycle — the singleton
   * is destroyed on server shutdown via whatever mechanism the host
   * uses for graceful teardown; per-request adapters call `destroy()`
   * on the adapter (which forwards to the underlying client).
   */
  client: MemWal;
  /**
   * Default namespace for `remember` + `recall` when the caller doesn't
   * specify one. Engine's `recall(query, { namespace? })` is optional;
   * MemWal's `recall(query, limit, namespace)` accepts undefined and
   * falls back to the MemWal client's configured default
   * (`MemWalConfig.namespace`, "default" if unset). This explicit
   * default at the adapter layer lets the audric route pass a per-user
   * namespace (`audric:user:<userId>`) without threading it through
   * every individual call site — matches the legacy `buildMemoryContext`
   * scope semantics from `apps/web-v2/lib/audric/moat-context.ts`.
   */
  defaultNamespace: string;
}

export class MemWalMemoryStore implements MemoryStore {
  private readonly client: MemWal;
  private readonly defaultNamespace: string;

  constructor(opts: MemWalMemoryStoreOptions) {
    this.client = opts.client;
    this.defaultNamespace = opts.defaultNamespace;
  }

  async remember(text: string, opts?: { namespace?: string }): Promise<void> {
    await this.client.remember(text, opts?.namespace ?? this.defaultNamespace);
  }

  async recall(
    query: string,
    opts?: { topK?: number; namespace?: string }
  ): Promise<MemoryRecord[]> {
    // [S.375 — 2026-06-07] MemWal 0.0.7: object-form `recall({ query, limit,
    // namespace })`. Positional `recall(query, limit, namespace)` is
    // `@deprecated` in 0.0.7 (slated for removal in a future major).
    const result = await this.client.recall({
      query,
      limit: opts?.topK ?? 5,
      namespace: opts?.namespace ?? this.defaultNamespace,
    });
    return result.results.map((r) => ({
      text: r.text,
      distance: r.distance,
      metadata: { blobId: r.blob_id },
    }));
  }

  destroy(): void {
    this.client.destroy();
  }
}
