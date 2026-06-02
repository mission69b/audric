/**
 * # Bundle status helpers
 *
 * Extracted from `audric-chat-client.tsx` 2026-05-24 (SPEC_AI_SDK_HARDENING
 * P5.1) so `isBundleSpent` can be unit-tested in isolation. The client
 * file now re-exports the type + function from here.
 *
 * **Why bundle status is a separate concern.** A multi-write bundle
 * (e.g. `harvest_rewards` swap-N-then-deposit) emits ONE
 * `data-audric-bundle` marker carrying `steps[]`. After the user taps
 * Approve on the `BundlePermissionCard`, AI SDK fans out per-step
 * `addToolApprovalResponse` + `addToolOutput` calls — each step's
 * `tool-*` UIPart transitions from `approval-requested` →
 * `output-available` independently.
 *
 * The render branch in `audric-chat-client.tsx` reads `isBundleSpent`
 * twice per bundle marker per turn:
 *
 * 1. To populate `bundleClaimedIds` (the set of tool-call ids that the
 *    bundle card "claims" — those parts skip individual rendering).
 * 2. To decide whether to render the BundlePermissionCard itself
 *    (spent → render nothing → let the individual receipts fall
 *    through; not-spent → render the card).
 *
 * Cold-reload correctness depends on this. Without it, refreshing a
 * chat with a completed bundle would re-show the permission card
 * because `BundlePermissionCard.resolved` is local `useState` that
 * resets on every fresh mount. See the Smoke 2026-05-22 bundle-refresh
 * fix in the render branch for context.
 */

import type { ToolUIPart, UIMessage } from "ai";

/**
 * `data-audric-bundle` marker payload — the chat route emits one per
 * multi-write atomic Payment Intent. The shape MUST mirror
 * `AudricBundleMarker` exported from the chat route (same project,
 * same module graph) — re-declared here so client files don't import
 * server modules. Drift caught at typecheck time via the type bridge
 * in `parseAudricBundleMarker`.
 */
export interface AudricBundleMarkerData {
  steps: Array<{
    toolCallId: string;
    approvalId: string;
    toolName: string;
    input: Record<string, unknown>;
    description: string;
    modifiableFields: Array<{
      name: string;
      kind: string;
      asset?: string;
    }>;
    /**
     * [SPEC_AI_SDK_HARDENING P7.2 — 2026-05-25] Chain-mode coin handoff
     * index. When set, the consumer step funds itself from step
     * `inputCoinFromStep`'s output coin instead of pre-fetching from
     * the wallet. Forward-only reference (`< stepIndex`). Set by the
     * engine's `composeBundleFromToolResults` for whitelisted adjacent
     * pairs whose assets align. Mirrors `AudricBundleMarker` in
     * `app/api/chat/route.ts`.
     */
    inputCoinFromStep?: number;
    /**
     * [SPEC_AI_SDK_HARDENING P7.3 — 2026-05-25] Serialized Cetus route
     * captured at same-turn `swap_quote` time. Engine stamps this on
     * matching `swap_execute` steps; the prepare-route deserializes
     * and threads into `composeTx`'s `SwapExecuteInput.precomputedRoute`
     * to skip the ~150-200ms `findSwapRoute()` discovery latency.
     *
     * Kept as `unknown` on the wire so client modules don't need to
     * import the SDK's `SerializedCetusRoute` type. The prepare-route
     * does the structural check + deserialize.
     */
    cetusRoute?: unknown;
  }>;
}

/**
 * A bundle is "spent" when every constituent tool-* part is past
 * `approval-requested` (i.e. the user already approved or denied).
 * Returns:
 *   - `true` — all constituent steps matched AND none are
 *     `approval-requested` → bundle card should NOT re-show.
 *   - `false` — at least one step is still `approval-requested` OR
 *     zero steps matched (stale marker → let the malformed-marker
 *     fallback handle rendering).
 */
/**
 * The shared on-chain digest of a SETTLED bundle, or `undefined` when no
 * constituent step reached `output-available` with a digest (i.e. the
 * bundle is still pending, or it failed/was denied — every step is
 * `output-error`). Every successful step carries the SAME digest (one
 * atomic PTB), so the first hit wins. Drives the render switch: a
 * settled bundle folds into one `BundleReceiptCard`; a failed/denied
 * bundle does NOT fold, letting each step render its own error state.
 */
export function findBundleDigest(
  marker: AudricBundleMarkerData,
  parts: readonly UIMessage["parts"][number][]
): string | undefined {
  const stepIds = new Set(marker.steps.map((s) => s.toolCallId));
  for (const p of parts) {
    if (!p.type.startsWith("tool-")) {
      continue;
    }
    const toolPart = p as ToolUIPart;
    if (
      toolPart.state !== "output-available" ||
      !stepIds.has(toolPart.toolCallId)
    ) {
      continue;
    }
    const output = toolPart.output as { digest?: unknown } | undefined;
    if (typeof output?.digest === "string") {
      return output.digest;
    }
  }
  return;
}

export function isBundleSpent(
  marker: AudricBundleMarkerData,
  parts: readonly UIMessage["parts"][number][]
): boolean {
  const stepIds = new Set(marker.steps.map((s) => s.toolCallId));
  let foundAny = false;
  for (const p of parts) {
    if (!p.type.startsWith("tool-")) {
      continue;
    }
    const toolPart = p as ToolUIPart;
    if (!stepIds.has(toolPart.toolCallId)) {
      continue;
    }
    foundAny = true;
    if (toolPart.state === "approval-requested") {
      return false;
    }
  }
  return foundAny;
}
