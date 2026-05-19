/**
 * resume-outcome — extract HITL outcomes from a UI message history.
 *
 * [Phase 3 outcome-update slice — 2026-05-19] Closes the harness Spec
 * §Item 3 G5 acceptance gap that S.175 documented but punted to Phase
 * 4. The contract:
 *
 *   1. Turn 1 server stamps `TurnMetrics.attemptId = chunk.approvalId`
 *      when the engine emits `tool-approval-request` (already shipped
 *      in S.175 telemetry-integration update).
 *   2. Client runs sponsored-tx → `addToolApprovalResponse` +
 *      `addToolOutput`. The output payload carries
 *      `writeToolDurationMs` (the sponsored-tx wall time).
 *   3. `useChat.sendAutomaticallyWhen` fires the resume turn POST.
 *      The request body's LAST assistant message contains the tool
 *      part in state `output-available` (confirmed) or `output-error`
 *      (denied / sponsored-tx failed) with `approval.id` set.
 *   4. The chat route (this helper's caller) extracts each tool's
 *      `{ attemptId, outcome, writeToolDurationMs }` and runs
 *      `prisma.turnMetrics.updateMany({where: {attemptId}, data: ...})`
 *      fire-and-forget. Multi-turn idempotent — subsequent turns
 *      re-run the same updateMany with the same values; Prisma
 *      treats it as a noop overwrite.
 *
 * This mirrors the legacy audric/web `/api/engine/resume` route's
 * updateMany logic, but folded INTO the chat route (per D-3 (c) lock:
 * "merge resume route into chat route + keep TurnMetrics row split").
 *
 * Traceability: agent-harness-spec.mdc §Item 3 + §Item 3a + BENEFITS_
 * SPEC_v07c.md §"Phase 3 outcome-update slice".
 */

/**
 * The structural shape of a tool UI part with HITL state set. We type
 * this loosely (Record<string, unknown>) because the input is the
 * RAW request body — pre-Zod-parse on the parts array, since the
 * chat route's `partSchema` is `passthrough()` for forward-compat.
 */
type LooseToolPart = {
  type: string;
  state?: string;
  toolCallId?: string;
  approval?: {
    id?: string;
    approved?: boolean;
    reason?: string;
  };
  output?: unknown;
  errorText?: string;
};

type LooseMessage = {
  role: string;
  parts?: unknown[];
};

export type HitlOutcome = "confirmed" | "denied" | "failed";

export interface ResumeOutcome {
  /**
   * The AI SDK `approvalId` — equal to the engine's `attemptId` per
   * harness Spec §Item 3a (mirrored by construction in v0.7c).
   */
  attemptId: string;
  /**
   * The resolved outcome:
   *   - `confirmed` — user approved AND client-side sponsored-tx succeeded.
   *   - `denied`    — user denied (regardless of why).
   *   - `failed`    — user approved BUT client-side sponsored-tx threw.
   */
  outcome: HitlOutcome;
  /**
   * Sponsored-tx wall time on the client (Approve tap → execute returns).
   * Populated only for `confirmed` outcomes; `null` for denied or failed
   * (denied has no sponsored-tx; failed's client orchestrator currently
   * surfaces only the error message — a future tightening could thread
   * latency-to-failure here too, but Phase 3 ships the happy path).
   */
  writeToolDurationMs: number | null;
}

/**
 * Pull every HITL-resolved outcome out of the LAST assistant message.
 *
 * Why "last assistant message" specifically: AI SDK's
 * `lastAssistantMessageIsCompleteWithToolCalls` predicate only fires
 * the resume turn when every tool part on the LAST assistant message
 * is in `output-available` or `output-error` state. So that one
 * message is the canonical source of all this-turn HITL outcomes.
 *
 * If the request is a FIRST turn (no prior assistant message), this
 * returns `[]` and the caller short-circuits. Multi-turn history
 * (where earlier assistant messages have older HITL outcomes) is
 * ignored — those rows were already updated on their own resume turn.
 *
 * Returns `[]` when no HITL part was found (e.g. read-only tools turn,
 * or text-only assistant reply with no tool calls at all).
 */
export function extractResumeOutcomes(messages: unknown[]): ResumeOutcome[] {
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

  const outcomes: ResumeOutcome[] = [];
  for (const rawPart of lastAssistant.parts) {
    const part = rawPart as LooseToolPart | undefined;
    if (!part || typeof part.type !== "string") {
      continue;
    }
    // AI SDK v6 represents per-tool UI parts as `tool-<toolName>`. We
    // could also filter on `dynamic` tools (`dynamic-tool` type) but
    // the audric tool set doesn't currently use dynamic tools.
    if (!part.type.startsWith("tool-")) {
      continue;
    }
    if (part.state !== "output-available" && part.state !== "output-error") {
      continue;
    }
    const approvalId = part.approval?.id;
    if (typeof approvalId !== "string" || approvalId.length === 0) {
      // Not an HITL part — e.g. read-only tool that auto-executed.
      continue;
    }
    const approved = part.approval?.approved === true;
    let outcome: HitlOutcome;
    if (!approved) {
      outcome = "denied";
    } else if (part.state === "output-error") {
      outcome = "failed";
    } else {
      outcome = "confirmed";
    }

    let writeToolDurationMs: number | null = null;
    if (
      outcome === "confirmed" &&
      part.output &&
      typeof part.output === "object"
    ) {
      const raw = (part.output as { writeToolDurationMs?: unknown })
        .writeToolDurationMs;
      if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
        writeToolDurationMs = Math.round(raw);
      }
    }

    outcomes.push({
      attemptId: approvalId,
      outcome,
      writeToolDurationMs,
    });
  }
  return outcomes;
}
