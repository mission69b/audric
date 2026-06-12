/**
 * Post-write refresh — host-side implementation for web-v2's
 * `Experimental_Agent` path.
 *
 * [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY C.1 / S.198 — 2026-05-20]
 *
 * --- WHY THIS FILE EXISTS ---
 *
 * `STATIC_SYSTEM_PROMPT` line 87 promises:
 *
 *   > The engine AUTOMATICALLY re-runs balance_check / savings_info /
 *   > health_check after every successful write — fresh tool results
 *   > appear in your context BEFORE you narrate.
 *
 * That promise is delivered by the engine's `AISDKEngine` via
 * `EngineConfig.postWriteRefresh` + the `onStepFinish` hook
 * (`packages/engine/src/v2/engine.ts` L17 + L652) which intercepts the
 * step boundary and injects pre-canned read tool_results.
 *
 * **Web-v2 does NOT use `AISDKEngine`.** Per BENEFITS_SPEC_v07c §D-15,
 * web-v2 uses `Experimental_Agent` directly so the host can compose
 * audric-specific middleware (guards, PII redaction, telemetry, etc.)
 * around AI SDK primitives. The legacy engine's postWriteRefresh
 * mechanism is NOT reachable on this path.
 *
 * Without this module the static system prompt is **lying** about the
 * refresh contract — the LLM narrates the post-write paragraph using
 * STALE pre-write balance numbers from earlier-in-turn tool reads,
 * re-opening the balance-hallucination class on the resume turn.
 *
 * --- IMPLEMENTATION ---
 *
 * Audric's confirm-tier writes execute CLIENT-side (sponsored-tx) and
 * land back via `addToolOutput` on the resume turn. So in web-v2 the
 * natural place to fire refresh reads is at the START of the resume
 * turn, BEFORE invoking `agent.stream(...)`:
 *
 *   1. `extractWritesNeedingRefresh(messages)` — walk the LAST
 *      assistant message's parts. For each tool part in state
 *      `output-available` whose `toolName` is a key in
 *      `POST_WRITE_REFRESH_MAP`, return its `{toolName}`.
 *      `output-error` parts are skipped — failed writes don't change
 *      on-chain state, so refreshing would just surface unchanged data
 *      (mirrors the engine's `success` check).
 *
 *   2. `dispatchPostWriteRefresh(...)` — for each refresh read in
 *      the union of `POST_WRITE_REFRESH_MAP[completedWrite]` (deduped
 *      across writes since a swap + save might both want
 *      `balance_check`), call `tool.call({}, toolContext)`. The empty
 *      input lets each tool default `address` to the wallet from
 *      `toolContext` — matches the engine's internal-injection shape.
 *
 *   3. Return `DispatchedReadPart[]` in the SAME shape as
 *      `dispatchIntentsToParts` so the chat route can merge results
 *      and reuse the existing step-0 wire-emission code path.
 *
 * The result: refresh reads ride the same `synthesizeAssistantToolMessage`
 * → `convertToModelMessages` path as intent-dispatched reads, which
 * means the LLM sees them as already-done history (Anthropic
 * `[tool_use, tool_result]` pair) and the client renders the cards
 * immediately. Identical wire shape, identical narration outcome to
 * the engine's internal mechanism.
 *
 * --- WHAT THIS DOES NOT DO (deferred) ---
 *
 * - Auto-execute writes (web-v2 doesn't do auto-tier writes today;
 *   when it does, A.5's `permissionConfig` + this module's same
 *   detection path fires for those too, no new code needed).
 * - Bundle resumes (multi-write Payment Intents). The bundle steps
 *   land as separate `output-available` parts on the resume turn —
 *   this module dedupes the refresh set across all of them and
 *   pre-fires once per refresh tool, which matches the engine's
 *   bundle-resume semantics.
 * - Tracking which tools have been refreshed THIS turn to avoid
 *   double-firing if the same write appears multiple times. Today
 *   AI SDK's resume turn assembly produces one `output-available`
 *   part per write — no double-fire risk.
 */

import type { InternalContext } from "@t2000/engine";
import type { Tool as AISDKTool, ToolSet } from "ai";
import {
  type DispatchedReadPart,
  makeAutoDispatchId,
} from "./dispatch-intents";

// ---------------------------------------------------------------------------
// POST_WRITE_REFRESH_MAP — ported byte-for-byte from
// `apps/web/lib/engine/engine-factory.ts` L100-129. When the engine's
// canonical copy updates, port the change here in the same diff so
// web-v2 doesn't drift. Until Phase 6 cutover retires apps/web both
// must produce identical refresh sets so the moat-revival smoke
// (same prompt → same post-write narration) compares cleanly.
//
// Read-only and internal writes (payment-link create — covers invoicing
// post-V07E_INVOICE_DEPRECATION) are intentionally excluded — they
// don't change balances until paid / sent, so refresh would just
// surface unchanged
// data.
// ---------------------------------------------------------------------------

// [SPEC_AUDRIC_DEFI_REMOVAL §2a — 2026-06-10] `savings_info` /
// `health_check` left the engine with the DeFi cut; `balance_check`
// reports wallet + NAVI savings + debt in one read, so it's the single
// refresh target for every surviving write. The grace-window writes
// (`withdraw` / `repay_debt` / `swap_execute`) leave this map at the
// §2d post-window cut.
export const POST_WRITE_REFRESH_MAP: Readonly<
  Record<string, readonly string[]>
> = {
  withdraw: ["balance_check"],
  repay_debt: ["balance_check"],
  send_transfer: ["balance_check"],
  swap_execute: ["balance_check"],
} as const;

// ---------------------------------------------------------------------------
// extractWritesNeedingRefresh — walk LAST assistant message for completed writes
// ---------------------------------------------------------------------------

type LooseToolPart = {
  approval?: {
    approved?: boolean;
    id?: string;
  };
  state?: string;
  type: string;
};

type LooseMessage = {
  parts?: unknown[];
  role: string;
};

/**
 * Scan the LAST assistant message's parts for write tools whose
 * client-side execution just succeeded. Returns `{toolName}` entries
 * keyed by the original WRITE tool (NOT the refresh-target read).
 *
 * Why "last assistant message" specifically: AI SDK's
 * `lastAssistantMessageIsCompleteWithToolCalls` predicate only fires
 * the resume turn when every tool part on the LAST assistant message
 * is in `output-available` or `output-error` state. So that one
 * message is the canonical source of all this-turn's HITL outcomes
 * (same convention as `extractResumeOutcomes` for cross-turn
 * TurnMetrics updates).
 *
 * **Confirmed-only filter:** we require `state === 'output-available'`
 * AND `approval.approved === true`. Denied writes (`approval.approved
 * === false`) and failed writes (`state === 'output-error'`) didn't
 * change on-chain state — refreshing would surface unchanged data and
 * burn a Prisma/BlockVision round-trip for no narration benefit.
 *
 * Read-only auto-tier writes (none today in web-v2; future state when
 * A.5's sub-threshold auto-execute lands) have NO `approval.id` set.
 * For those the LLM never paused, the tool just executed inline — we
 * still need to refresh after auto-tier writes, so this function
 * accepts both HITL-approved AND auto-executed write parts. Match
 * heuristic: the part's toolName is a key in `POST_WRITE_REFRESH_MAP`
 * AND state is `output-available`.
 *
 * Returns `[]` when no eligible writes are found (read-only turn,
 * text-only resume, all writes denied/failed).
 */
export function extractWritesNeedingRefresh(
  messages: unknown[]
): Array<{ toolName: string }> {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  let lastAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as LooseMessage | undefined;
    if (msg?.role === "assistant") {
      lastAssistantIndex = i;
      break;
    }
  }
  if (lastAssistantIndex === -1) {
    return [];
  }
  const lastAssistant = messages[lastAssistantIndex] as LooseMessage;
  if (!Array.isArray(lastAssistant.parts)) {
    return [];
  }

  const writes: Array<{ toolName: string }> = [];
  for (const rawPart of lastAssistant.parts) {
    const part = rawPart as LooseToolPart | undefined;
    if (!part || typeof part.type !== "string") {
      continue;
    }
    if (!part.type.startsWith("tool-")) {
      continue;
    }
    if (part.state !== "output-available") {
      continue;
    }
    const toolName = part.type.slice("tool-".length);
    if (!(toolName in POST_WRITE_REFRESH_MAP)) {
      continue;
    }
    // HITL parts (confirm-tier — today's web-v2): require user approved.
    // Auto-tier parts (future): no `approval` field on the part at all.
    // Either is eligible; only HITL-denied is rejected.
    if (part.approval && part.approval.approved !== true) {
      continue;
    }
    writes.push({ toolName });
  }
  return writes;
}

// ---------------------------------------------------------------------------
// dispatchPostWriteRefresh — execute the deduped refresh-read set
// ---------------------------------------------------------------------------

export interface DispatchPostWriteRefreshInput {
  /** The write tools detected by `extractWritesNeedingRefresh`. */
  completedWrites: Array<{ toolName: string }>;
  /**
   * Engine `InternalContext` envelope passed to each `tool.execute()`
   * via `experimental_context`. See `dispatch-intents.ts`'s
   * matching field for the full rationale; semantics are identical.
   */
  internalContext: InternalContext;
  /** Optional log prefix. */
  logPrefix?: string;
  /**
   * Tool-name → native AI SDK `Tool` registry (`ToolSet`). Only refresh
   * reads present in this map are dispatched; unwired tools are skipped
   * with a warn (matches the intent-dispatcher contract).
   *
   * [P4.1 Phase C — 2026-05-25] Pre-engine-3.0.0 this was `Map<string,
   * EngineTool>` and the refresh path invoked `tool.call(args, ctx)`.
   * Post-3.0.0 every tool ships in native AI SDK `tool()` shape — we
   * accept a `ToolSet` and invoke `tool.execute()` with the
   * `experimental_context` envelope (single path with the LLM-driven
   * round-trip).
   */
  registry: ToolSet;
  /** Turn index — used to build stable synthetic call IDs. */
  turnIndex: number;
}

/**
 * Compute the deduped union of `POST_WRITE_REFRESH_MAP[write.toolName]`
 * across all completed writes, then pre-fire each refresh read. Returns
 * `DispatchedReadPart[]` in the shape consumed by
 * `synthesizeAssistantToolMessage`.
 *
 * Errors during tool execution surface as console.warn + skipped read
 * (matches the intent-dispatcher graceful-fallback contract). NEVER
 * throws — a refresh blip must not wedge the resume turn's narration.
 */
export async function dispatchPostWriteRefresh(
  input: DispatchPostWriteRefreshInput
): Promise<DispatchedReadPart[]> {
  const { completedWrites, registry, internalContext, turnIndex, logPrefix } =
    input;
  const prefix = logPrefix ?? "[web-v2 post-write-refresh]";

  if (completedWrites.length === 0) {
    return [];
  }

  // Dedupe the refresh-read union across all completed writes. A
  // "swap + save" bundle resume produces two writes but should fire
  // each refresh tool at most once — matching the engine's internal
  // mechanism which also dedupes.
  const refreshSet = new Set<string>();
  for (const w of completedWrites) {
    const refreshTools = POST_WRITE_REFRESH_MAP[w.toolName] ?? [];
    for (const r of refreshTools) {
      refreshSet.add(r);
    }
  }

  console.info(`${prefix} classified`, {
    turnIndex,
    completedWrites: completedWrites.map((w) => w.toolName),
    refreshTools: [...refreshSet],
  });

  const dispatched: DispatchedReadPart[] = [];

  for (const refreshToolName of refreshSet) {
    const tool = registry[refreshToolName] as AISDKTool | undefined;
    if (!tool || typeof tool.execute !== "function") {
      console.warn(`${prefix} skipped — refresh tool not in registry`, {
        toolName: refreshToolName,
      });
      continue;
    }

    const callId = makeAutoDispatchId(turnIndex, refreshToolName, "pwr");

    // Empty input: every refresh tool (balance_check / savings_info /
    // health_check) accepts an optional `address` that defaults to the
    // signed-in wallet from `internalContext.toolContext`. Same shape
    // the engine's internal `postWriteRefresh` injector uses.
    const args: Record<string, unknown> = {};

    try {
      // [P4.1 Phase C — 2026-05-25] Native AI SDK invocation. See
      // `dispatch-intents.ts` for the full rationale; semantics identical.
      const output = await tool.execute(args, {
        toolCallId: callId,
        messages: [],
        experimental_context: internalContext,
      });
      dispatched.push({
        toolCallId: callId,
        toolName: refreshToolName,
        input: args,
        output,
        label: `post-write-refresh:${refreshToolName}`,
      });
      console.info(`${prefix} dispatched`, {
        turnIndex,
        callId,
        tool: refreshToolName,
      });
    } catch (err) {
      console.warn(`${prefix} tool.execute threw — skipping refresh`, {
        toolName: refreshToolName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return dispatched;
}
