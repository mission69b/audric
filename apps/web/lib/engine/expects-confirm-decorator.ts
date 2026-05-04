/**
 * SPEC 15 Phase 2 — `expects_confirm` SSE event decorator.
 *
 * Server-side function that inspects bundle-stash state and the assistant
 * turn that just streamed, and decides whether to emit an
 * `expects_confirm` SSE event telling the frontend "render Confirm/Cancel
 * chips on the most recent assistant message."
 *
 * Decision logic (all three must hold for v1):
 *   1. The just-finished assistant turn called `prepare_bundle`. We can't
 *      offer chips for a confirmation that has nothing to dispatch.
 *   2. A bundle proposal exists in Redis for this session — read via
 *      `readBundleProposal` (1 RTT, GET only). Consuming here would
 *      dispose the stash before the user can chip-click it.
 *   3. The assistant's final-text matches `PRIOR_PLAN_MARKER` from the
 *      existing `confirm-detection.ts`. Belt-and-suspenders against
 *      false-positive chip render on a turn that prepared the bundle but
 *      narrated something else (e.g. clarifying question).
 *
 * Phase 2 v1 deliberately scopes to bundle confirms (`variant: 'commit'`).
 * `acknowledge` (slippage warnings) and `choice` (multi-option questions)
 * are explicitly Phase 2.5+ and will require their own decorator branches.
 *
 * Cross-references:
 *   - `bundle-proposal-store.ts` — `readBundleProposal` is the existing
 *     read-without-DEL primitive Phase 2 reuses.
 *   - `confirm-detection.ts` — `PRIOR_PLAN_MARKER` regex (single source).
 *   - `sse-types.ts` — `ExpectsConfirmSseEvent` shape this returns.
 *   - `app/api/engine/chat/route.ts` — the lone caller (emits the SSE
 *     event before `turn_complete`).
 */

import { readBundleProposal } from './bundle-proposal-store';
import { PRIOR_PLAN_MARKER } from './confirm-detection';
import type { ExpectsConfirmSseEvent } from './sse-types';

export interface DecoratorInput {
  /** Session id for the current chat turn. */
  sessionId: string;
  /**
   * Did the just-finished assistant turn call the `prepare_bundle` tool?
   * The chat route knows this from inspecting the engine's tool_use
   * blocks emitted during the stream. False (or unknown) → return null
   * without even reading Redis (saves the RTT in the steady state).
   */
  preparedBundleThisTurn: boolean;
  /**
   * Concatenated text content of the just-finished assistant turn. The
   * caller extracts this from the engine's final assistant message
   * blocks. Empty/undefined → return null.
   */
  finalText: string | undefined;
}

/**
 * Returns an `ExpectsConfirmSseEvent` to emit on this turn, or null when
 * chips should not render.
 *
 * Idempotent — calling twice with the same input returns the same shape
 * (the underlying `readBundleProposal` is GET-only and doesn't mutate).
 *
 * Performance: at most 1 Redis RTT (~50–80ms on Upstash global) per
 * plan-bearing turn. Returns immediately without I/O when
 * `preparedBundleThisTurn` is false. Safe to call on every assistant
 * turn that COULD have prepared a bundle.
 */
export async function expectsConfirmDecorator(
  input: DecoratorInput,
): Promise<ExpectsConfirmSseEvent | null> {
  // Gate 1: only consider turns that called prepare_bundle. Cuts the
  // hot path to zero I/O on every other turn (read tools, narration,
  // chitchat, etc).
  if (!input.preparedBundleThisTurn) return null;

  // Gate 2: stash must exist (the prepare_bundle tool may have failed
  // its own validation, or the stash already TTL-expired between
  // emission and this check).
  const stash = await readBundleProposal(input.sessionId);
  if (!stash) return null;

  // Gate 3: the assistant text must actually frame a confirmation.
  // Reuses the EXISTING `PRIOR_PLAN_MARKER` from confirm-detection.ts
  // so this gate stays in lockstep with Phase 1's plan-context detection.
  if (!input.finalText || !PRIOR_PLAN_MARKER.test(input.finalText)) return null;

  // Quote-bearing bundles get a UI-side expiry (the chip greys out at
  // `expiresAt`). Other bundles never expire client-side; their stash
  // TTL still kicks in server-side, and chip-click after TTL → no_stash
  // → falls through to plan-context promotion (graceful degradation).
  const hasSwap = stash.steps.some((s) => s.toolName === 'swap_execute');
  const expiresAt = hasSwap ? stash.expiresAt : undefined;

  return {
    type: 'expects_confirm',
    variant: 'commit',
    stashId: stash.bundleId,
    expiresAt,
    stepCount: stash.steps.length,
  };
}
