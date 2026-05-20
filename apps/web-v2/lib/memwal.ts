/**
 * MemWal SDK client — shared MemWal handle for web-v2.
 *
 * **What MemWal is.** Mysten's vector-memory backend: client sends text,
 * server (in a TEE) handles embedding + SEAL encrypt + Walrus upload +
 * onchain index. The SDK signs requests with an Ed25519 delegate key
 * tied to a MemWalAccount object on Sui. Recall returns top-K similar
 * records (cosine distance). v0.7d Phase 1 wires this as the source of
 * truth for the engine's 5-layer F-4 system-prompt assembly layer 3
 * (`<memory_recall>`) — replacing apps/web's legacy daily-Claude-cron
 * `UserMemory` pipeline (deleted in Phase 6).
 *
 * **Why nullable singleton.** Mirrors `lib/upstash.ts` exactly:
 * MEMWAL_PRIVATE_KEY + MEMWAL_ACCOUNT_ID are optional in
 * `lib/env.ts` so Vercel deploys boot cleanly even before the founder
 * provisions a MemWal account. Consumers (the chat route's Day 1b
 * wire-up; the future `/settings/memory` page in Phase 3) detect the
 * null and degrade gracefully — engine takes the no-memory code path,
 * settings UI shows the deferral signpost.
 *
 * **Phase 1 scope vs Phase 1.5 + Phase 2 (founder-locked 2026-05-21).**
 * This module ships as a SINGLETON — one MemWal client constructed
 * from one founder-owned delegate key + account id. The
 * `MemWalMemoryStore` adapter (`lib/audric/memwal-memory-store.ts`)
 * passes per-user namespace strings (`audric:user:<userId>`) to scope
 * recall + remember calls inside that one account. This is the Phase 1
 * smoke posture — sufficient to validate G2 + G3 acceptance gates
 * without account-provisioning infra.
 *
 * Phase 1.5 / Phase 2 promotes this to a PER-USER FACTORY: each audric
 * user gets their own MemWalAccount on Sui (auto-provisioned at sign-up
 * via `createAccount()` + `addDelegateKey()` from the MemWal SDK) and
 * their own delegate key. True crypto-isolation between users; matches
 * Mysten's `MystenLabs/MemWal/apps/chatbot` reference integration. The
 * transition is invisible to callers — the factory just returns a
 * per-request MemWal instance instead of the shared singleton, and the
 * adapter's namespace becomes `default` (per-account isolation instead
 * of per-namespace).
 *
 * **Boot timing.** Constructed eagerly at module load so misconfig
 * (malformed hex key, missing accountId despite key being set, network
 * unreachable at `relayer.memwal.ai`) surfaces during boot, not on
 * first chat turn.
 *
 * First consumer: `lib/audric/memwal-memory-store.ts` (the
 * `MemWalMemoryStore` adapter — Phase 1 Day 1a).
 */
import { MemWal } from "@mysten-incubation/memwal";

import { env } from "@/lib/env";

/**
 * Defensive sentinel namespace passed to the singleton at construction
 * time. The MemWal SDK defaults to `"default"` when `namespace` is unset
 * in `MemWalConfig` — any code path that ever calls `recall()` /
 * `remember()` WITHOUT passing a per-user namespace would silently
 * write to / read from `"default"`, cross-pollinating every user.
 *
 * Setting a clearly-wrong sentinel ("UNSCOPED" in all caps) means:
 *   - If the sentinel ever appears in a MemWal recall result OR a
 *     server-side log, it's an obvious "missing namespace bug" alarm.
 *     `default` would look intentional; `audric:UNSCOPED` does not.
 *   - It will NEVER collide with a real per-user namespace
 *     (`audric:user:0x<hex>` — lowercase, deterministic shape).
 *
 * Production paths (the `MemWalMemoryStore` adapter in
 * `lib/audric/memwal-memory-store.ts`) always pass `defaultNamespace:
 * audric:user:<walletAddress>` at construction → adapter calls
 * always pass that namespace per-call → sentinel is never touched.
 *
 * Defense in depth: if a future caller forgets the namespace, the
 * sentinel catches it instead of writing under `"default"`. Cost: 0 LoC
 * at call sites; one constant declaration here.
 */
const MEMWAL_SENTINEL_NAMESPACE = "audric:UNSCOPED";

export const memwal =
  env.MEMWAL_PRIVATE_KEY && env.MEMWAL_ACCOUNT_ID
    ? MemWal.create({
        key: env.MEMWAL_PRIVATE_KEY,
        accountId: env.MEMWAL_ACCOUNT_ID,
        serverUrl: env.MEMWAL_SERVER_URL,
        namespace: MEMWAL_SENTINEL_NAMESPACE,
      })
    : null;

/**
 * Test-only escape hatch: when the smoke harness needs a fresh client
 * inside the same Node process (e.g., re-running the smoke from a
 * Vitest test), the singleton above would persist across calls. Not
 * exported for consumer use — production paths read `memwal` above.
 *
 * Tests can override the sentinel namespace explicitly when they need
 * to assert a specific scoping behavior (the smoke harness in
 * `packages/engine/scripts/memwal-smoke.ts` does this).
 */
export function _testCreateMemWalClient(opts: {
  privateKey: string;
  accountId: string;
  serverUrl?: string;
  namespace?: string;
}): MemWal {
  return MemWal.create({
    key: opts.privateKey,
    accountId: opts.accountId,
    serverUrl: opts.serverUrl,
    namespace: opts.namespace ?? MEMWAL_SENTINEL_NAMESPACE,
  });
}
