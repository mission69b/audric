/**
 * Bundle proposal store (SPEC 14)
 *
 * Backs the `prepare_bundle` plan-time commitment by stashing typed
 * bundle steps in Redis with a TTL. The chat-route fast-path (SPEC 14
 * Phase 2) reads + atomically deletes from this store when the user
 * confirms a multi-write Payment Intent.
 *
 * Key shape: `bundle:proposal:{sessionId}` — one slot per session. A
 * second `prepare_bundle` call from the same session OVERWRITES the
 * prior proposal (locked decision Q3 in SPEC 14 v0.2).
 *
 * TTL: 60 seconds (locked decision Q2 in SPEC 14 v0.2 — calibrated to
 * ~2× the typical Cetus quote validity window).
 */

import { Redis } from '@upstash/redis';
import type { SerializedCetusRoute } from '@t2000/sdk';

const TTL_SEC = 60;
const KEY_PREFIX = 'bundle:proposal:';

/**
 * Single bundle step. Mirrors `WriteStep` from `@t2000/sdk` shape-wise
 * but kept loose at the schema layer so audric-host doesn't hard-pin
 * to a specific SDK version's discriminated-union types. The actual
 * downstream consumers (`composeTx`, the prepare route) re-validate
 * `toolName` + `input` shape at execute time.
 *
 * **`cetusRoute` (SPEC 22.4 / SPEC 20.2 final option B — 2026-05-10).**
 * For `swap_execute` steps, `prepare_bundle` calls `getSwapQuote` at
 * plan-commitment time and stashes the freshly-discovered Cetus route
 * here. The fast-path-bundle dispatcher synthesises a
 * `SwapQuoteReadEntry` from this and threads it through the engine
 * composer, so the bundle's `step.cetusRoute` carries a route whose
 * `discoveredAt` is `prepare_bundle` time (~few hundred ms before
 * confirm) instead of `swap_quote` time (~14s before confirm in the
 * v5 trace). Eliminates the 14s read→render window that previously
 * caused freshness-gate skips on the SPEC 20.2 fast-path.
 *
 * Optional because:
 *   1. Non-`swap_execute` steps don't have routes (`borrow`, `save_deposit`, …).
 *   2. If `getSwapQuote` itself fails at plan time (rare — Cetus 5xx),
 *      `prepare_bundle` ships the bundle without the route field and
 *      the existing fast-path history walk takes over (graceful degrade).
 *   3. Backward-compat: pre-22.4 stashes already in Redis won't have
 *      this field; the consumer treats absence identically to the
 *      legacy "no stash route" path.
 */
export interface BundleProposalStep {
  toolName: string;
  input: Record<string, unknown>;
  inputCoinFromStep?: number;
  cetusRoute?: SerializedCetusRoute;
}

export interface BundleProposal {
  bundleId: string;
  walletAddress: string;
  steps: BundleProposalStep[];
  expiresAt: number;
  reason?: string;
  validatedAt: number;
  summary: string;
}

function keyFor(sessionId: string): string {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('[bundle-proposal-store] sessionId is required');
  }
  return `${KEY_PREFIX}${sessionId}`;
}

/**
 * Persist a bundle proposal. Overwrites any existing proposal for the
 * same session (Q3 locked decision). Always sets a 60s TTL.
 */
export async function writeBundleProposal(
  sessionId: string,
  proposal: BundleProposal,
  redis: Redis = Redis.fromEnv(),
): Promise<void> {
  await redis.set(keyFor(sessionId), proposal, { ex: TTL_SEC });
}

/**
 * Fetch a bundle proposal without consuming it. Returns null if absent
 * or expired. Used by the chat-route fast-path to decide whether to
 * bypass the engine.
 */
export async function readBundleProposal(
  sessionId: string,
  redis: Redis = Redis.fromEnv(),
): Promise<BundleProposal | null> {
  const data = await redis.get<BundleProposal>(keyFor(sessionId));
  if (!data) return null;
  if (data.expiresAt <= Date.now()) {
    return null;
  }
  return data;
}

/**
 * Read AND delete a proposal in close succession. Used by the fast-
 * path to prevent double-execution if the user re-confirms (e.g.
 * presses "Yes" twice across two browser tabs).
 *
 * Implementation note: `@upstash/redis@1.37` does not expose the
 * `GETDEL` primitive. We do GET → DEL (two RTTs, ~50–80ms each on
 * Upstash global). Acceptable for the SPEC 14 contract because:
 *   1. The proposal carries a unique `bundleId` — any race is
 *      observable in the resulting `audric.bundle.fast_path_dispatched`
 *      telemetry (two events with the same bundleId == race).
 *   2. The downstream `pending_action_bundle` SSE event can only
 *      execute once on-chain (Sui digest uniqueness), so even a
 *      racey double-read can't cause double-execution.
 *
 * If the upstream SDK gains `getdel` later, swap to it (one-line
 * change, no caller-visible behavior shift).
 */
export async function consumeBundleProposal(
  sessionId: string,
  redis: Redis = Redis.fromEnv(),
): Promise<BundleProposal | null> {
  const key = keyFor(sessionId);
  const data = await redis.get<BundleProposal>(key);
  if (!data) return null;
  await redis.del(key);
  if (data.expiresAt <= Date.now()) {
    return null;
  }
  return data;
}

/**
 * Delete a proposal explicitly. Used when a session is reset or when
 * the user takes a non-confirm action that invalidates the prior plan
 * (e.g. asks for a fresh quote with different params).
 */
export async function deleteBundleProposal(
  sessionId: string,
  redis: Redis = Redis.fromEnv(),
): Promise<void> {
  await redis.del(keyFor(sessionId));
}
