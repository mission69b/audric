import { NextRequest } from 'next/server';
import { serializeSSE } from '@t2000/engine';
import type { PendingAction, ContentBlock, EngineEvent } from '@t2000/engine';
import {
  classifyReadIntents,
  makeAutoDispatchId,
  intentDiscriminator,
} from '@/lib/engine/intent-dispatcher';
import { buildDispatchIntents } from '@/lib/engine/dispatch-intents';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress, isJwtEmailVerified } from '@/lib/auth';
import {
  createEngine,
  createUnauthEngine,
  getSessionStore,
  generateSessionId,
  getConversationState,
  setConversationState,
  type HistoryMessage,
} from '@/lib/engine/engine-factory';
import { UpstashSessionStore } from '@/lib/engine/upstash-session-store';
import { logSessionUsage } from '@/lib/engine/log-session-usage';
import { getSessionSpend } from '@/lib/engine/session-spend';
import {
  TurnMetricsCollector,
  detectRefinement,
  detectTruncation,
  detectNarrationTableDump,
  emitHarnessTelemetry,
} from '@/lib/engine/harness-metrics';
import { getTelemetrySink } from '@t2000/engine';
import { emitBundleProposed } from '@/lib/engine/bundle-metrics';
import { costRatesForModel } from '@/lib/engine/cost-rates';
import { isSyntheticSessionId } from '@/lib/engine/synthetic-sessions';
import { prisma, withPrismaRetry } from '@/lib/prisma';
import {
  SESSION_LIMIT_VERIFIED,
  SESSION_WINDOW_MS,
  sessionLimitFor,
} from '@/lib/billing';

import { sanitizeStreamErrorMessage } from '@/lib/engine/stream-errors';
import { tryConsumeFastPathBundle } from '@/lib/engine/fast-path-bundle';
// [SPEC 15 Phase 2] Confirm-flow chip routing.
import {
  readBundleProposal,
  deleteBundleProposal,
} from '@/lib/engine/bundle-proposal-store';
import { expectsConfirmDecorator } from '@/lib/engine/expects-confirm-decorator';
import {
  emitExpectsConfirmSet,
  emitConfirmFlowDispatch,
} from '@/lib/engine/plan-context-metrics';
import { env } from '@/lib/env';
import {
  asHarnessVersion,
  currentHarnessVersion,
  type HarnessVersion,
} from '@/lib/interactive-harness';

const AGENT_MODEL = env.AGENT_MODEL ?? 'claude-sonnet-4-6';

export const runtime = 'nodejs';
// F13 (2026-05-03): bumped 60 → 300 to handle "max" shape compound write
// requests (4+ writes with multiple pre-write reads). Sonnet at high effort
// + extended thinking can burn 30–60s on planning alone before emitting the
// bundle proposal. Vercel Pro allows up to 300s. Cost impact ~zero — only
// long-running edge cases consume the extra budget.
export const maxDuration = 300;

const MAX_HISTORY = 12;
const MAX_MSG_LEN = 500;

/**
 * [v0.48 — bug 3] The unconditional resumed-session pre-fetch
 * (RESUMED_SESSION_INTENTS — balance_check + savings_info on every
 * turn of a returning auth session) was deleted here. Reasoning:
 *
 *   1. The <financial_context> block in the system prompt
 *      (`buildFinancialContextBlock`) already gives the LLM a daily
 *      orientation snapshot of balance, savings, debt, HF, APY, and
 *      recent activity — the LLM doesn't need a fresh tool result on
 *      every turn to know the current state.
 *   2. `READ_INTENT_RULES` already classifies explicit balance/savings
 *      questions ("what's my balance", "how much am I earning") and
 *      dispatches them through the same `buildDispatchIntents` path.
 *   3. Post-write tools refresh balance/savings via
 *      `EngineConfig.postWriteRefresh`, so action turns can't go stale
 *      either.
 *
 * The original baseline metric this targeted ("Returning user 2 → 0
 * tool calls" — bare-message resumes producing zero card renders) is
 * better fixed by the system-prompt freshness signal than by always
 * stamping two cards on every turn. The reported regression: asking
 * "what's funkii's address" rendered the user's own balance + savings
 * card *before* the LLM even saw the message.
 */

/**
 * [SPEC 15 Phase 2] Chip-click decision payload. Set by the frontend
 * `<ConfirmChips />` when the user taps Confirm or Cancel under a
 * multi-write Payment Stream plan. Echoed `forStashId` is matched
 * against the live Redis stash's `bundleId`:
 *   - match → execute (Yes) or cancel (No) the current stash
 *   - mismatch → ghost-dispatch race (cancel+new-stash, delayed click).
 *     Yes-mismatch falls through to the regular text-confirm path
 *     (treats the click like the user typed "Confirm"); No-mismatch
 *     still cancels the CURRENT stash (intent is unambiguous).
 *
 * `forStashId` is NOT a capability token — server consumes the stash
 * by `sessionId`. The mismatch path emits
 * `audric.confirm_flow.dispatch_count{outcome='stash_mismatch'}`
 * for visibility but never gates auth on the field.
 */
interface ChipDecision {
  via: 'chip';
  value: 'yes' | 'no';
  forStashId: string;
}

interface ChatRequestBody {
  message: string;
  address?: string;
  sessionId?: string;
  history?: HistoryMessage[];
  /** [SPEC 15 Phase 2] Chip click — see `ChipDecision`. */
  chipDecision?: ChipDecision;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const {
    message,
    address,
    sessionId: requestedSessionId,
    history = [],
    chipDecision,
  } = body;

  if (!message?.trim()) {
    return jsonError('message is required', 400);
  }

  // [SPEC 15 Phase 2] Defensive shape validation on chipDecision.
  // Bad shapes are silently ignored (treat as a normal text turn) so
  // a malformed client never bricks chat. We never want to surface a
  // 400 for "your chip click was malformed" — fall back to text path.
  const validChipDecision: ChipDecision | undefined =
    chipDecision &&
    chipDecision.via === 'chip' &&
    (chipDecision.value === 'yes' || chipDecision.value === 'no') &&
    typeof chipDecision.forStashId === 'string' &&
    chipDecision.forStashId.length > 0
      ? chipDecision
      : undefined;

  const jwt = request.headers.get('x-zklogin-jwt');
  const isAuth = !!jwt && !!address;

  if (isAuth) {
    if (!isValidSuiAddress(address)) {
      return jsonError('Invalid Sui address', 400);
    }
    const jwtResult = validateJwt(jwt);
    if ('error' in jwtResult) return jwtResult.error;
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  if (isAuth) {
    const rl = rateLimit(`engine:${ip}`, 20, 60_000);
    if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);
  } else {
    if (message.length > MAX_MSG_LEN) return jsonError(`Message too long (max ${MAX_MSG_LEN})`, 400);
    if (history.length > MAX_HISTORY) return jsonError(`History too long (max ${MAX_HISTORY})`, 400);
    const rl = rateLimit(`demo:${ip}`, 30, 600_000);
    if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);
  }

  try {
    let engine;
    let sessionId: string | undefined;
    let session = null;
    let saveSession = false;
    // [SPEC 8 v0.5.1 B3.3 / G4] Pin the harness renderer for the life of
    // this session. Decided ONCE per session (at creation, or on the
    // first turn of a pre-B3.3 session that hasn't been pinned yet) and
    // persisted into `session.metadata.harnessVersion`. Resolved below
    // after we load the session record.
    let harnessVersion: HarnessVersion = 'legacy';
    let engineMeta: {
      effortLevel: string;
      modelUsed: string;
      // [SPEC 8 v0.5.1 B3.2] Surfaced via the same factory `onMeta` hook
      // so the chat route can pass them into `engine.submitMessage(...)`
      // and the metrics row can stamp `harnessShape` for dashboards.
      harnessShape: 'lean' | 'standard' | 'rich' | 'max';
      harnessRationale: string;
    } | undefined;
    let sessionSpendUsdAtStart = 0;
    // Constructed early so the engine factory can pipe `onGuardFired`
    // directly into the collector before the agent loop starts.
    const collector = new TurnMetricsCollector();

    if (isAuth) {
      const store = getSessionStore();
      sessionId = requestedSessionId || generateSessionId();
      session = requestedSessionId ? await store.get(requestedSessionId) : null;
      saveSession = true;

      // [SPEC 8 v0.5.1 B3.3 / G4 + B3.7] Per-session harness-version pinning.
      //
      // Existing session with a pinned value → respect it (won't flip
      // mid-rollout, won't flip when the dial moves back). Existing
      // session without one (pre-B3.3 record) OR brand-new session →
      // evaluate the env var ONCE and that decision sticks for the
      // rest of this session's life via the `metadata` write in the
      // `finally` block below.
      //
      // [B3.7] When the rollout-percent dial is set, `currentHarnessVersion`
      // hashes the user address into a stable bucket and admits only the
      // lower `percent%` slice. The user's Sui `address` is the bucket
      // key — the same user always lands in the same bucket across
      // sessions, so a 10% rollout admits the SAME 10% of users every
      // session (no flicker). Falls back to `sessionId` for safety
      // (the address is always set in this branch — `isAuth` is true
      // — but defensive null-coalescing keeps the type clean).
      const pinned = asHarnessVersion(session?.metadata?.harnessVersion);
      harnessVersion = pinned ?? currentHarnessVersion(address ?? sessionId);

      // [PR-B2] Central usage billing.
      // Source `emailVerified` from the Google OIDC `email_verified` claim
      // on the zkLogin JWT — replaces the deleted Resend verify-link flow.
      // Personal Gmail is always `true`; Workspace depends on org policy.
      // Fetch prefs (contacts) and the rolling-24h distinct-session list
      // in parallel. SessionUsage logs every TURN, so we groupBy
      // `sessionId` to count distinct sessions, not turns.
      const [prefs, recentSessions] = await Promise.all([
        prisma.userPreferences.findUnique({
          where: { address },
          select: { contacts: true },
        }).catch(() => null),
        prisma.sessionUsage.groupBy({
          by: ['sessionId'],
          where: {
            address,
            createdAt: { gte: new Date(Date.now() - SESSION_WINDOW_MS) },
          },
        }).catch(() => [] as Array<{ sessionId: string }>),
      ]);

      const contacts = Array.isArray(prefs?.contacts) ? prefs.contacts as Array<{ name: string; address: string }> : [];

      // Continuing an existing session (already counted toward the user's
      // window) must never be blocked mid-conversation — only NEW sessions
      // beyond the limit get a 429. Without this guard, a user could be
      // cut off in the middle of a back-and-forth at the exact moment they
      // crossed the threshold.
      const recentSessionIds = new Set(recentSessions.map((r) => r.sessionId));
      const continuingExistingSession = !!requestedSessionId && recentSessionIds.has(requestedSessionId);
      const emailVerified = isJwtEmailVerified(jwt);
      const limit = sessionLimitFor(emailVerified);

      // [PR-B2] Operational signal — log when Google reports
      // `email_verified: false`. Personal Gmail is always `true`; only
      // Workspace orgs with specific auth policies produce `false`. If
      // we see this above ~1%/day in prod, we should add a DB override
      // table so support can manually bump those users to the 20-session
      // tier (per simplification spec §B.4).
      if (!emailVerified) {
        console.warn('[email-verified-false]', {
          address,
          limit,
          recentSessions: recentSessions.length,
        });
      }

      if (recentSessions.length >= limit && !continuingExistingSession) {
        const message = emailVerified
          ? `You've used ${limit} sessions in the last 24 hours. More sessions unlock as the 24h window rolls forward.`
          : `You've used ${limit} of ${limit} sessions today. Your Google account isn't marked verified by Google — contact support@audric.ai if you need the higher ${SESSION_LIMIT_VERIFIED}/day cap.`;
        return new Response(
          JSON.stringify({
            error: message,
            code: 'SESSION_LIMIT',
            tier: emailVerified ? 'verified' : 'unverified',
            limit,
            windowHours: 24,
          }),
          {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      const conversationState = sessionId ? await getConversationState(sessionId).catch(() => undefined) : undefined;

      // [v1.4] Read accumulated session spend so the engine can enforce
      // `autonomousDailyLimit` for the next auto-tier check.
      sessionSpendUsdAtStart = sessionId ? await getSessionSpend(sessionId) : 0;

      engine = await createEngine({
        address,
        session,
        contacts,
        message: message.trim(),
        conversationState,
        sessionSpendUsd: sessionSpendUsdAtStart,
        sessionId,
        onMeta: (meta) => { engineMeta = meta; },
        onGuardFired: (guard) => collector.onGuardFired(guard),
      });
    } else {
      engine = await createUnauthEngine(history);
    }

    const priorMsgCount = engine.getMessages().length;
    /**
     * [v1.4 Item 4] turnIndex = number of assistant messages BEFORE this
     * turn's response is added. Stable across resume because each
     * tool_result + assistant continuation lives in the same session
     * message ledger.
     */
    const turnIndex = engine.getMessages().filter((m) => m.role === 'assistant').length;

    /**
     * [v1.4 — Item 2] Trigger resumed-session pre-fetch ONLY when an
     * authenticated user is reopening a session that already has prior
     * messages. New auth sessions are covered upstream by
     * `engine-factory.ts:buildSyntheticPrefetch`; unauth sessions don't
     * have access to `balance_check` / `savings_info` and would just log
     * "tool not found" warnings on every cold landing-page hit.
     */

    const toolNamesByUseId = new Map<string, string>();
    // [v0.46.6] Accumulate text deltas so we can run the markdown-table-
    // dump detector once the turn closes. Pure observation — never blocks
    // the stream, never modifies the response.
    const narrationParts: string[] = [];
    const calledToolNames: string[] = [];
    // [SPEC 8 v0.5.1 B3.4 / Gap J] Server-side cleanliness flag for the
    // partial-turn case. Flipped to `true` when the engine emits
    // `turn_complete`; if the `finally` block runs without seeing one,
    // the SSE stream was cut off (client abort, serverless timeout,
    // unhandled exception) and we persist a `lastInterruption` marker
    // so a future page load can render `<RetryInterruptedTurn>` instead
    // of leaving the user staring at half a response.
    let turnCompleteSeen = false;
    // [Phase 0 / SPEC 13 / 2026-05-03 evening] Stream-close instrumentation.
    // Pairs with the engine's `engine.turn_outcome` counter so we can
    // diagnose the "Response interrupted · retry" bug from real traffic.
    // The structured log at `controller.close()` captures whether the
    // host actually saw the engine's terminator events; if engine emits
    // `turn_complete` but the host's `streamCloseLog` shows `false`,
    // the gap is in the for-await loop (delivery-side). If both are
    // false, the engine returned silently — investigate the engine.
    let pendingActionSeen = false;
    let errorEventSeen = false;
    let lastEventType: string | null = null;
    const streamStartMs = Date.now();

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let pendingAction: PendingAction | null = null;

        try {
          if (sessionId) {
            // [B3.3 / G4] Carry the pinned harness version on the same
            // event the client already uses to capture `sessionId`. The
            // client (`useEngine.ts`) stashes both at once, so the
            // renderer in `<ChatMessage>` can gate on a stable per-
            // session value instead of re-reading the env var on every
            // render.
            controller.enqueue(
              encoder.encode(
                `event: session\ndata: ${JSON.stringify({ sessionId, harnessVersion })}\n\n`,
              ),
            );
          }

          // [v0.46.7] Intent-driven pre-dispatch.
          //
          // For direct read questions ("what's my net worth", "am I at risk
          // of liquidation", "show available MPP services") we deterministically
          // run the corresponding read tool BEFORE invoking the LLM. This
          // closes the long-tail gap where the model skipped tool calls based
          // on its own efficiency heuristic ("data is fresh enough from earlier
          // turn"), leaving the user without a rich card.
          //
          // Mechanism mirrors the existing prefetch convention in
          // `buildSyntheticPrefetch`: append assistant(tool_use) + user(tool_result)
          // ContentBlocks to the message ledger, then let `submitMessage` push
          // the user's text and run the agent loop. The LLM sees the fresh
          // result in context and narrates around it without re-calling.
          // SSE events for the synthetic tool calls are streamed BEFORE the
          // LLM's stream so cards render immediately and metrics row is complete.
          const trimmedMessage = message.trim();

          // [SPEC 14 Phase 2 + SPEC 15 Phase 2] Pre-LLM short-circuits.
          //
          // Three mutually-exclusive paths fire BEFORE the engine stream:
          //
          //   1. Chip-Cancel (`chipDecision.value === 'no'`):
          //      Delete the stash, synthesize a tiny "Cancelled by user"
          //      assistant turn, skip the LLM. Idempotent — chip-Cancel
          //      against a no-stash session is a no-op + telemetry.
          //
          //   2. Chip-Yes (`chipDecision.value === 'yes'`):
          //      Read stash, validate `forStashId` against `bundleId`.
          //      On match → fast-path dispatch with `forceAdmit='chip'`
          //      (skips intent gates). On mismatch → emit telemetry and
          //      fall through to the regular text-confirm path (the
          //      mismatched chip is treated like the user typed
          //      "Confirm", which is exactly what the chip label says).
          //
          //   3. Text confirm (no `chipDecision` OR Yes-mismatch):
          //      Existing Phase 1+1.5 fast-path — regex / plan-context
          //      / wallet checks inside `tryConsumeFastPathBundle`.
          //
          // `fastPathFired` (and the new `chipCancelled`) gate the LLM
          // submitMessage call below — same way Phase 1 already does.
          let fastPathFired = false;
          let chipCancelled = false;

          // ── Path 1: Chip-Cancel ──────────────────────────────────
          if (
            !fastPathFired &&
            validChipDecision?.value === 'no' &&
            saveSession &&
            sessionId &&
            address
          ) {
            // R7 ghost-dispatch fix: ALWAYS delete the stash on Cancel,
            // even when the stashId mismatches. The user's intent is
            // unambiguous — cancel the current plan — and leaving the
            // stash live invites a delayed text "yes" to dispatch a
            // bundle the user already cancelled.
            const currentStash = await readBundleProposal(sessionId);
            const stashIdMatched = currentStash?.bundleId === validChipDecision.forStashId;
            const stepCountForTelemetry = currentStash?.steps.length ?? 0;
            await deleteBundleProposal(sessionId);

            // Synthetic assistant turn. Persisted in the engine ledger
            // (so the next prompt sees "user just cancelled" in
            // context — without it, the LLM might re-propose the same
            // bundle 30 seconds later) AND streamed to SSE so the UI
            // shows the cancellation acknowledgment.
            const cancelText = 'Cancelled by user — keeping the plan unchanged.';
            controller.enqueue(
              encoder.encode(
                serializeSSE({ type: 'text_delta', text: cancelText }),
              ),
            );
            controller.enqueue(
              encoder.encode(
                serializeSSE({ type: 'turn_complete', stopReason: 'end_turn' }),
              ),
            );
            const priorMessages = engine.getMessages();
            engine.loadMessages([
              ...priorMessages,
              { role: 'user', content: [{ type: 'text', text: trimmedMessage }] },
              { role: 'assistant', content: [{ type: 'text', text: cancelText }] },
            ]);
            narrationParts.push(cancelText);
            turnCompleteSeen = true;
            lastEventType = 'turn_complete';
            chipCancelled = true;

            // Both match + mismatch tag as `outcome='cancelled'` —
            // semantically the user cancelled the current plan in
            // both cases. Mismatch is logged via console.warn below
            // for UI-bug visibility (the chip the user clicked was
            // already stale).
            emitConfirmFlowDispatch({
              via: 'chip',
              outcome: 'cancelled',
              admittedVia: 'chip',
              stepCount: stepCountForTelemetry > 0 ? stepCountForTelemetry : 2,
            });

            console.info('[chip-cancel] stash deleted', {
              sessionId,
              clientStashId: validChipDecision.forStashId,
              currentStashId: currentStash?.bundleId ?? null,
              stashIdMatched,
            });
          }

          // ── Path 2 + 3: Yes-with-match (chip-fast-path) OR fall
          //               through to regular text-fast-path ──────────
          //
          // `useChipForceAdmit` flips true ONLY when chipDecision is
          // a Yes AND the forStashId matches the current bundleId. In
          // all other cases (no chipDecision; chip Yes with mismatch;
          // chip No — already handled above) we use the existing
          // text-confirm semantics.
          let useChipForceAdmit = false;
          if (
            !chipCancelled &&
            validChipDecision?.value === 'yes' &&
            saveSession &&
            sessionId &&
            address
          ) {
            const currentStash = await readBundleProposal(sessionId);
            if (currentStash?.bundleId === validChipDecision.forStashId) {
              useChipForceAdmit = true;
            } else {
              // Stash-mismatch ghost-dispatch race. Don't dispatch
              // chip-fast-path against a stash the user didn't approve.
              // Emit telemetry so the dashboard can spot stale clients,
              // then fall through — the regular text-confirm path below
              // will run. The user's intent ("Confirm") is preserved;
              // we just don't honor the stale stashId binding.
              emitConfirmFlowDispatch({
                via: 'chip',
                outcome: 'stash_mismatch',
                admittedVia: 'chip',
                stepCount: currentStash?.steps.length ?? 2,
              });
              console.warn('[chip-yes] stash mismatch — falling through to text-confirm', {
                sessionId,
                clientStashId: validChipDecision.forStashId,
                currentStashId: currentStash?.bundleId ?? null,
              });
            }
          }

          if (!chipCancelled && saveSession && sessionId && address) {
            const fastPath = await tryConsumeFastPathBundle({
              sessionId,
              walletAddress: address,
              trimmedMessage,
              turnIndex,
              // [SPEC 15 Phase 1.5] History enables the plan-context
              // override admission path. Skipped when forceAdmit='chip'
              // since the chip click bypasses intent gates.
              history: session?.messages ?? [],
              // [SPEC 15 Phase 2] Set when chip-Yes with matching
              // forStashId. Skips intent gates inside the helper but
              // still runs session/stash/wallet checks.
              forceAdmit: useChipForceAdmit ? 'chip' : undefined,
              // [SPEC 15 v0.7 follow-up #3 — single-source bundle
              // composer, 2026-05-04] Engine tools required so the
              // fast-path can call `composeBundleFromToolResults`
              // (the canonical engine bundle composer). Without
              // this, fast-path bundles ship without canRegenerate /
              // modifiableFields / future bundle fields. The engine
              // is constructed above (line ~317) so getTools is
              // always populated by this point.
              tools: engine.getTools(),
            });
            if (fastPath) {
              fastPathFired = true;

              // Yield the bundle as a normal `pending_action` SSE event.
              // The host's renderer (`useEngine.ts`) and PermissionCard
              // are agnostic to whether this came from the LLM or the
              // fast path — only the toolUseId prefix `fastpath_`
              // identifies it in logs.
              controller.enqueue(
                encoder.encode(
                  serializeSSE({ type: 'pending_action', action: fastPath.action }),
                ),
              );
              // Mirror engine.ts behavior — emit turn_complete with
              // `stopReason: 'tool_use'` (same as the engine yields
              // when an agentLoop iteration ends on a pending_action).
              controller.enqueue(
                encoder.encode(
                  serializeSSE({ type: 'turn_complete', stopReason: 'tool_use' }),
                ),
              );

              pendingAction = fastPath.action;
              pendingActionSeen = true;
              turnCompleteSeen = true;
              lastEventType = 'turn_complete';
              collector.onPendingAction(fastPath.action.attemptId);
              if (
                Array.isArray(fastPath.action.steps) &&
                fastPath.action.steps.length >= 2
              ) {
                emitBundleProposed(fastPath.action.steps);
              }

              // [SPEC 15 Phase 2] Confirm-flow dispatch counter. Tag
              // `via='chip'` when this dispatch came from a chip-Yes
              // click, else `via='text'`. `admittedVia` is sourced
              // from the fast-path's return value so the counter
              // accurately splits text dispatches between regex
              // (Phase 1) and plan_context (Phase 1.5) — no
              // coarse-graining.
              emitConfirmFlowDispatch({
                via: fastPath.admittedVia === 'chip' ? 'chip' : 'text',
                outcome: 'dispatched',
                admittedVia: fastPath.admittedVia,
                stepCount: fastPath.action.steps?.length ?? 2,
              });

              // Append synthetic user + assistant messages to the
              // engine's ledger so the chat-history UI and the next
              // LLM turn see a coherent transcript.
              const priorMessages = engine.getMessages();
              engine.loadMessages([
                ...priorMessages,
                {
                  role: 'user',
                  content: [{ type: 'text', text: trimmedMessage }],
                },
                {
                  role: 'assistant',
                  content: [{ type: 'text', text: fastPath.syntheticAssistantText }],
                },
              ]);

              console.info('[fast-path] bundle dispatched', {
                sessionId,
                bundleId: fastPath.proposal.bundleId,
                stepCount: fastPath.proposal.steps.length,
                via: useChipForceAdmit ? 'chip' : 'text',
                pairs: fastPath.proposal.steps
                  .slice(1)
                  .map((s, i) => `${fastPath.proposal.steps[i].toolName}->${s.toolName}`),
              });
            }
          }

          /**
           * [v0.48] Pure classifier-driven dispatch — no synthetic
           * pre-fetch. `buildDispatchIntents` exists solely to dedup
           * the classified list by (toolName, argsFingerprint) so a
           * compound prompt (e.g. "show my balance and balance again")
           * doesn't fire `balance_check` twice.
           */
          const intents = fastPathFired
            ? []
            : buildDispatchIntents({
                classified: classifyReadIntents(trimmedMessage),
              });

          // [Bug A trace] Always log a one-liner with intent classification
          // + dispatch outcome. When users report "this prompt didn't render
          // a card", we can grep this trace to see whether (a) classification
          // matched, (b) invokeReadTool ran, (c) what it returned. Cheap
          // (one log line per turn) and avoids the previous black box where
          // a missed card looked identical to "no rule matched".
          const messagePreview =
            trimmedMessage.length > 80
              ? `${trimmedMessage.slice(0, 80)}…`
              : trimmedMessage;
          console.info('[intent-dispatch] classified', {
            sessionId: sessionId ?? null,
            turnIndex,
            messagePreview,
            intentCount: intents.length,
            intents: intents.map((i) => ({
              tool: i.toolName,
              label: i.label,
              args: i.args,
            })),
          });

          if (intents.length > 0) {
            const priorMessages = engine.getMessages();
            const syntheticToolUses: ContentBlock[] = [];
            const syntheticToolResults: ContentBlock[] = [];

            for (const intent of intents) {
              // [v0.46.9] Discriminator avoids ID collisions when one turn
              // dispatches the same tool twice with different args (e.g.
              // transaction_history { date: today } AND { date: yesterday }
              // from a compound prompt). Empty discriminator preserves the
              // pre-existing `auto_<turn>_<tool>` ID for no-arg intents so
              // metrics and tests stay stable.
              const callId = makeAutoDispatchId(
                turnIndex,
                intent.toolName,
                intentDiscriminator(intent),
              );

              let result: { data: unknown; isError: boolean };
              try {
                result = await engine.invokeReadTool(
                  intent.toolName,
                  intent.args,
                );
              } catch (dispatchErr) {
                console.warn(
                  '[intent-dispatch] invokeReadTool threw — falling back to LLM flow',
                  {
                    sessionId: sessionId ?? null,
                    toolName: intent.toolName,
                    label: intent.label,
                    error:
                      dispatchErr instanceof Error
                        ? dispatchErr.message
                        : String(dispatchErr),
                  },
                );
                continue;
              }

              if (result.isError) {
                console.warn(
                  '[intent-dispatch] tool returned isError — falling back to LLM flow',
                  {
                    sessionId: sessionId ?? null,
                    toolName: intent.toolName,
                    label: intent.label,
                  },
                );
                continue;
              }

              syntheticToolUses.push({
                type: 'tool_use',
                id: callId,
                name: intent.toolName,
                input: intent.args,
              });
              syntheticToolResults.push({
                type: 'tool_result',
                toolUseId: callId,
                content: JSON.stringify({ data: result.data }),
              });

              const startEvent: EngineEvent = {
                type: 'tool_start',
                toolName: intent.toolName,
                toolUseId: callId,
                input: intent.args,
              };
              const resultEvent: EngineEvent = {
                type: 'tool_result',
                toolName: intent.toolName,
                toolUseId: callId,
                result: { data: result.data },
                isError: false,
                wasEarlyDispatched: true,
              };

              controller.enqueue(encoder.encode(serializeSSE(startEvent)));
              controller.enqueue(encoder.encode(serializeSSE(resultEvent)));

              toolNamesByUseId.set(callId, intent.toolName);
              calledToolNames.push(intent.toolName);
              collector.onToolStart(callId);
              collector.onToolResult(
                callId,
                intent.toolName,
                { data: result.data },
                {
                  wasTruncated: false,
                  wasEarlyDispatched: true,
                  resultDeduped: false,
                  returnedRefinement: false,
                },
              );

              // [Bug A trace] Confirm SSE events were enqueued. Pairs with
              // the [intent-dispatch] classified log above so a failed
              // reproduction shows whether dispatch reached this point.
              console.info('[intent-dispatch] dispatched', {
                sessionId: sessionId ?? null,
                turnIndex,
                callId,
                tool: intent.toolName,
                label: intent.label,
              });
            }

            if (syntheticToolUses.length > 0) {
              engine.loadMessages([
                ...priorMessages,
                { role: 'assistant', content: syntheticToolUses },
                { role: 'user', content: syntheticToolResults },
              ]);
            }
          }

          // [v1.4 Item 4] Tap raw EngineEvents for metrics BEFORE
          // serializing — the SSE adapter is lossy for our needs (`error`
          // events lose the Error type, and we want refinement detection
          // on the original `result` object).
          //
          // [SPEC 8 v0.5.1 B3.6] Stamp the harness shape on the
          // collector BEFORE the stream loop so the row carries the
          // shape even if the LLM call errors before yielding the
          // `harness_shape` event. The engine echo via `case 'harness_shape'`
          // below stays as a defensive last-write-wins.
          collector.onHarnessShape(engineMeta?.harnessShape);
          // [SPEC 14 Phase 2 + SPEC 15 Phase 2] When EITHER the fast
          // path fired (text-confirm or chip-Yes) OR the chip-Cancel
          // path fired we already emitted the SSE terminator events
          // from the synthetic flow. Skipping `engine.submitMessage`
          // is what makes those paths "fast" (zero LLM cost, ~10ms
          // total). Falls through to the existing finally block which
          // handles session save, TurnMetrics row, etc — those work
          // unchanged because we set the same state flags the legacy
          // path's `case 'pending_action'` would set.
          if (!fastPathFired && !chipCancelled) for await (const event of engine.submitMessage(trimmedMessage, {
            // [SPEC 8 v0.5.1 B3.2] Engine emits the one-shot `harness_shape`
            // event at turn start; host stashes the shape on the assistant
            // EngineChatMessage + on `TurnMetrics.harnessShape`. Falls back
            // to `'standard'` only when factory metadata is unavailable
            // (shouldn't happen in production — defensive default).
            harnessShape: engineMeta?.harnessShape ?? 'standard',
            harnessRationale: engineMeta?.harnessRationale,
          })) {
            // [Phase 0 / SPEC 13] Track every event for stream-close log.
            lastEventType = event.type;
            if (event.type === 'pending_action') pendingActionSeen = true;
            if (event.type === 'error') errorEventSeen = true;
            switch (event.type) {
              case 'compaction':
                collector.onCompaction();
                continue; // don't pollute the SSE stream
              case 'text_delta':
                collector.onFirstTextDelta();
                // [SPEC 8 v0.5.1 B3.6] Accumulate the user-visible final
                // text length so the row carries `finalTextTokens` as a
                // terseness regression signal.
                if (typeof event.text === 'string') {
                  collector.onTextDelta(event.text);
                  narrationParts.push(event.text);
                }
                break;
              case 'thinking_delta':
                // [SPEC 8 v0.5.1 B3.6] Stamp TTFVP off the first thinking
                // burst — typically the earliest renderable signal on a
                // write-recommendation turn.
                collector.onThinkingDelta();
                break;
              case 'thinking_done':
                // [SPEC 8 v0.5.1 B3.6] Increment the per-turn block count
                // and (when the engine parsed an `<eval_summary>` marker
                // from the buffered text) the eval-summary emission count.
                collector.onThinkingDone({ summaryMode: event.summaryMode });
                break;
              case 'tool_start':
                toolNamesByUseId.set(event.toolUseId, event.toolName);
                calledToolNames.push(event.toolName);
                collector.onToolStart(event.toolUseId);
                break;
              case 'tool_progress':
                // [SPEC 8 v0.5.1 B3.6] Long-running tools emit progress
                // mid-call (Cetus swap_execute, protocol_deep_dive,
                // portfolio_analysis). Counter feeds the dashboard pull.
                collector.onToolProgress();
                break;
              case 'todo_update':
                // [SPEC 8 v0.5.1 B3.6] Every `update_todo` tool call
                // surfaces here on the side channel — one increment per
                // call, regardless of the items array length. The host
                // also renders the persistent todo card from this event.
                collector.onTodoUpdate();
                break;
              case 'pending_input':
                // [SPEC 8 v0.5.1 B3.6 / D2] No-op handler for engine
                // forward-compat with SPEC 9 v0.1.2. The event MUST NOT
                // arrive under engine v1.5.0; if it does on a session
                // pinned to legacy, flag it on telemetry so we can spot
                // session-pinning breakage during phased rollout.
                collector.onPendingInput(harnessVersion);
                break;
              case 'tool_result':
                if (event.toolName === '__deduped__') {
                  // Engine-internal marker for microcompact dedup hits.
                  // Don't record a separate ToolMetric — flip the flag
                  // on the prior matching row so analytics see the saving.
                  collector.markToolResultDeduped(event.toolUseId);
                } else {
                  collector.onToolResult(event.toolUseId, event.toolName, event.result, {
                    wasTruncated: detectTruncation(event.result),
                    wasEarlyDispatched: event.wasEarlyDispatched ?? false,
                    resultDeduped: event.resultDeduped ?? false,
                    returnedRefinement: detectRefinement(event.result),
                  });
                }
                break;
              case 'usage':
                collector.onUsage(event);
                break;
              case 'turn_complete':
                // [B3.4 / Gap J] Engine confirmed clean turn close;
                // any pending `lastInterruption` from prior turns
                // gets cleared on the metadata write below.
                turnCompleteSeen = true;
                // [SPEC 15 Phase 2] If the just-finished assistant turn
                // called `prepare_bundle` AND a fresh stash exists AND
                // the final text matches the plan-confirm marker, emit
                // an `expects_confirm` SSE event so the frontend can
                // render Confirm/Cancel chips. ORDER MATTERS — the
                // event must precede the forwarded `turn_complete` so
                // the client attaches it to the just-finished message
                // before it transitions out of the streaming state.
                //
                // Stalls SSE for ~50–80ms on a Redis read; that's
                // intentional. The decorator's gate on
                // `preparedBundleThisTurn` short-circuits the read
                // when no `prepare_bundle` tool ran (the steady state
                // for narration / chitchat / read-only turns).
                if (sessionId && saveSession) {
                  try {
                    const finalText = narrationParts.join('');
                    const expectsConfirm = await expectsConfirmDecorator({
                      sessionId,
                      preparedBundleThisTurn: calledToolNames.includes('prepare_bundle'),
                      finalText: finalText.length > 0 ? finalText : undefined,
                    });
                    if (expectsConfirm) {
                      // Audric-only SSE event — encode manually (the
                      // engine's `serializeSSE` only knows about
                      // engine-emitted `SSEEvent` types). Mirrors the
                      // pattern already used for the `session` event
                      // emitted at stream start. Frontend SSE reducer
                      // treats unknown event types as no-ops, so this
                      // is non-breaking for stale clients.
                      controller.enqueue(
                        encoder.encode(
                          `event: expects_confirm\ndata: ${JSON.stringify(expectsConfirm)}\n\n`,
                        ),
                      );
                      emitExpectsConfirmSet({
                        hasSwap: expectsConfirm.expiresAt !== undefined,
                        stepCount: expectsConfirm.stepCount,
                      });
                    }
                  } catch (decoratorErr) {
                    // Telemetry / decorator failures must never block
                    // the turn from completing. Log and move on.
                    console.error(
                      '[expects-confirm] decorator failed (non-fatal):',
                      decoratorErr,
                    );
                  }
                }
                break;
              case 'pending_action':
                // [v1.4.2 — Day 3 / Spec Item 3] Pass the engine-stamped
                // `attemptId` so the resulting `TurnMetrics` row carries
                // it, and the resume route can `updateMany where {
                // attemptId }` to write the per-attempt outcome onto the
                // exact row this turn produced (instead of the ambiguous
                // `(sessionId, turnIndex)` pair that v1.3 used).
                collector.onPendingAction(event.action.attemptId);
                pendingAction = event.action;
                // [SPEC 7 P2.7] Measure LLM bundle-proposal rate. Single-
                // step pending_actions are no-op'd inside the helper —
                // only multi-step bundles emit. Combined with the
                // bundle_outcome_count emitted from the resume route, we
                // get the soak's headline metric: revert_rate =
                // (reverted + compose_error + sponsorship_failed) / total.
                if (Array.isArray(event.action.steps) && event.action.steps.length >= 2) {
                  emitBundleProposed(event.action.steps);
                }
                break;
              case 'harness_shape':
                // [SPEC 8 v0.5.1 B3.6] Defensive last-write-wins. The
                // collector was pre-stamped from `engineMeta` before the
                // stream loop; this just ensures the engine-emitted
                // value (the source of truth) wins if it ever differs.
                collector.onHarnessShape(event.shape);
                break;
              default:
                break;
            }

            if (event.type === 'error') {
              controller.enqueue(
                encoder.encode(
                  serializeSSE({
                    type: 'error',
                    message: sanitizeStreamErrorMessage(event.error.message),
                  }),
                ),
              );
            } else if (event.type === 'tool_result' && event.toolName === '__deduped__') {
              // Engine-internal marker; skip serialization.
            } else {
              controller.enqueue(encoder.encode(serializeSSE(event)));
            }
          }
        } catch (err) {
          const rawMsg = err instanceof Error ? err.message : 'Engine error';
          const errorMsg = sanitizeStreamErrorMessage(rawMsg);
          // Always log the raw message server-side for debugging.
          console.error('[engine/chat] stream error:', rawMsg);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`,
            ),
          );
        } finally {
          const messages = [...engine.getMessages()];
          const usage = engine.getUsage();

          // [v0.46.6] Card-tool + markdown-table-in-narration detector.
          // Pure observation — logs to the server only, never alters the
          // response. Tracks the rate at which Audric duplicates rich-card
          // data as a markdown table in chat (a v0.46.6 contract violation
          // per "Never duplicate card data in chat text").
          try {
            const narration = narrationParts.join('');
            const dump = detectNarrationTableDump(narration, calledToolNames);
            if (dump.violated) {
              console.warn(
                '[narration-dump] markdown table emitted alongside card-rendering tool',
                {
                  sessionId: sessionId ?? null,
                  cardTool: dump.cardTool,
                  toolsCalled: calledToolNames,
                  narrationPreview: narration.slice(0, 280),
                },
              );
            }
          } catch (dumpErr) {
            console.error('[narration-dump] detector failed (non-fatal):', dumpErr);
          }

          if (saveSession && sessionId && address) {
            try {
              const store = getSessionStore();
              // [B3.4 / Gap J] Compute the interruption marker BEFORE
              // building the metadata payload. A turn that ended with
              // `pending_action` is intentionally paused, not
              // interrupted; only flag when neither `turn_complete`
              // nor `pending_action` was ever emitted (server crash /
              // serverless timeout / network drop). On a clean turn,
              // we explicitly clear any prior marker so the retry
              // pill from the previous turn doesn't stick around.
              const wasInterrupted = !turnCompleteSeen && !pendingAction;
              if (wasInterrupted) {
                // [SPEC 8 v0.5.1 B3.6 / Gap J] Telemetry mirror of the
                // session-side `lastInterruption` marker. Rollback gate:
                // >1% over 24h flips SPEC 8 v0.5.1 B3.7 back to legacy.
                collector.markInterrupted();
              }
              const lastInterruption = wasInterrupted
                ? {
                    turnIndex,
                    // `trimmedMessage` was set inside the try block
                    // (out of scope here); re-trim from the outer
                    // `message` capture instead.
                    replayText: message.trim(),
                    interruptedAt: Date.now(),
                  }
                : undefined;
              const updatedSession = {
                id: sessionId,
                messages,
                usage,
                createdAt: session?.createdAt ?? Date.now(),
                updatedAt: Date.now(),
                pendingAction,
                // [B3.3 / G4] Persist the pinned harness version so a
                // session that started under "legacy" never flips to "v2"
                // (or vice-versa) when the rollout dial moves. Merged with
                // any pre-existing metadata so we don't clobber other
                // host-set fields on this record.
                metadata: {
                  ...(session?.metadata ?? {}),
                  address,
                  harnessVersion,
                  // [B3.4 / Gap J] `undefined` → key omitted on JSON
                  // serialise → previous value cleared on next read.
                  // Carrying the explicit `undefined` is intentional —
                  // it overrides the spread above when this turn was
                  // clean.
                  lastInterruption,
                },
              };
              await store.set(updatedSession);

              if (!requestedSessionId && store instanceof UpstashSessionStore) {
                await store.addToUserIndex(address, sessionId);
              }

              logConversationTurn(address, sessionId, messages, usage, engineMeta?.modelUsed).catch((err) =>
                console.error('[engine/chat] conversation log failed:', err),
              );
            } catch (saveErr) {
              console.error('[engine/chat] session save failed:', saveErr);
            }
          }

          if (saveSession && sessionId && address) {
            handleAdviceResults(address, sessionId, messages).catch((err) =>
              console.error('[engine/chat] advice log failed:', err),
            );
          }

          // F4: Update conversation state based on turn outcome
          if (saveSession && sessionId) {
            updateConversationState(sessionId, pendingAction, messages).catch((err) =>
              console.error('[engine/chat] state transition failed:', err),
            );
          }

          logSessionUsage(
            address ?? 'anonymous',
            sessionId ?? 'demo',
            usage,
            messages,
            AGENT_MODEL,
            priorMsgCount,
          ).catch((err) => console.error('[engine/chat] session usage log failed:', err));

          // [v1.4 Item 4] Fire-and-forget TurnMetrics row at turn close.
          // Wrapped in try/catch and `.catch()` to ensure analytics
          // failures NEVER surface to the user — the response is already
          // closed by `controller.close()` below regardless.
          if (saveSession && sessionId && address && engineMeta) {
            try {
              const inputTokens = usage.inputTokens ?? 0;
              const outputTokens = usage.outputTokens ?? 0;
              const cacheReadTokens = usage.cacheReadTokens ?? 0;
              const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
              // [v0.47] Use per-model rates instead of hardcoded Sonnet
              // ($3/$15 per MTok). Pre-fix, Haiku turns were charged at
              // Sonnet rates in this metric, making them look 2–3x more
              // expensive than reality and muddying the effort-classifier
              // cost analysis. Also: include cache read/write rates so
              // cached turns aren't reported at full input cost.
              const rates = costRatesForModel(engineMeta.modelUsed);
              const estimatedCostUsd =
                inputTokens * rates.input +
                outputTokens * rates.output +
                cacheReadTokens * rates.cacheRead +
                cacheWriteTokens * rates.cacheWrite;
              const built = collector.build({
                sessionId,
                userId: address,
                turnIndex,
                effortLevel: engineMeta.effortLevel,
                modelUsed: engineMeta.modelUsed,
                contextTokensStart: priorMsgCount,
                estimatedCostUsd,
                sessionSpendUsd: sessionSpendUsdAtStart,
                // [v1.4.2 — Day 3 / Spec Item 3] Mark the row synthetic
                // when `sessionId` matches a prefix in
                // `SYNTHETIC_SESSION_PREFIXES`. The chat route is
                // user-prompt-driven for human traffic, but bot/test
                // harnesses (e.g. the `s_1777047351366…` load tester
                // backfilled in the v1.4.2 deploy SQL) drive it the
                // same way — so the *route* can't decide the bit on
                // its own; the sessionId prefix is the canonical
                // signal. This MUST stay aligned with the resume
                // route's identical derivation so a turn's `initial`
                // and `resume` rows agree on `synthetic` and don't
                // mis-pair under `WHERE synthetic = false` filters.
                synthetic: isSyntheticSessionId(sessionId),
                // [v1.4.2 — Day 3] Initial chat-route close. The resume
                // route writes a separate row with `turnPhase: 'resume'`
                // when the user resolves a pending action.
                turnPhase: 'initial',
              });
              // Prisma's JSON columns demand `InputJsonValue` shapes —
              // round-trip through JSON to strip class-y types and satisfy
              // both the runtime serialiser and the static typing.
              const payload = {
                ...built,
                toolsCalled: JSON.parse(JSON.stringify(built.toolsCalled)),
                guardsFired: JSON.parse(JSON.stringify(built.guardsFired)),
              };
              prisma.turnMetrics
                .create({ data: payload })
                .catch((err) =>
                  console.error('[TurnMetrics] write failed (non-fatal):', err),
                );

              // [SPEC 8 v0.5.1 B3.6 / Layer 6] Emit per-turn transient
              // counters via the engine's installed Vercel sink — same
              // dashboard pull as `audric.tool.retry_count` etc. No new
              // vendor (per `metrics-and-monitoring.mdc`). Wrapped in
              // try/catch defensively even though the sink swallows
              // its own errors — telemetry must NEVER break a response.
              try {
                emitHarnessTelemetry(getTelemetrySink(), {
                  harnessShape: built.harnessShape,
                  modelUsed: built.modelUsed,
                  thinkingBlockCount: built.thinkingBlockCount,
                  todoUpdateCount: built.todoUpdateCount,
                  ttfvpMs: built.ttfvpMs,
                  finalTextTokens: built.finalTextTokens,
                  evalSummaryEmittedCount: built.evalSummaryEmittedCount,
                  evalSummaryViolationsCount: built.evalSummaryViolationsCount,
                  pendingInputSeenOnLegacy: built.pendingInputSeenOnLegacy,
                  toolProgressEventCount: built.toolProgressEventCount,
                  interruptedMessageCount: built.interruptedMessageCount,
                });
              } catch (telemetryErr) {
                console.error(
                  '[harness-telemetry] emit failed (non-fatal):',
                  telemetryErr,
                );
              }
            } catch (metricsErr) {
              console.error('[TurnMetrics] build failed (non-fatal):', metricsErr);
            }
          }

          // [Phase 0 / SPEC 13 / 2026-05-03 evening] Structured stream-close
          // log. The 4-tuple (turnCompleteSeen, pendingActionSeen,
          // errorEventSeen, lastEventType) lets us tell apart:
          //   - clean (true,  false, false, …)  — natural turn end
          //   - paused (false, true,  false, 'pending_action')
          //   - errored (false,false, true,  'error')
          //   - SILENT (false, false, false, …) — the bug we're hunting.
          //     A SILENT close means the engine generator returned
          //     without emitting any of its terminator events; on the
          //     engine side the matching `engine.turn_outcome` counter
          //     should have ALWAYS fired. If host=silent + engine=fired,
          //     the gap is in delivery (streaming/SSE/CDN). If
          //     host=silent + engine=silent, the gap is in engine.
          const streamClosedSilently =
            !turnCompleteSeen && !pendingActionSeen && !errorEventSeen;
          try {
            getTelemetrySink().counter('audric.engine.chat_stream_close', {
              outcome: turnCompleteSeen
                ? 'turn_complete'
                : pendingActionSeen
                  ? 'pending_action'
                  : errorEventSeen
                    ? 'error'
                    : 'silent',
              lastEventType: lastEventType ?? 'none',
            });
            getTelemetrySink().histogram(
              'audric.engine.chat_stream_duration_ms',
              Date.now() - streamStartMs,
              {
                outcome: turnCompleteSeen
                  ? 'turn_complete'
                  : pendingActionSeen
                    ? 'pending_action'
                    : errorEventSeen
                      ? 'error'
                      : 'silent',
              },
            );
            if (streamClosedSilently) {
              console.error('[engine/chat] STREAM_CLOSED_SILENTLY', {
                sessionId: sessionId ?? null,
                address: address ?? null,
                turnIndex,
                lastEventType,
                durationMs: Date.now() - streamStartMs,
                priorMsgCount,
              });
            }
          } catch (logErr) {
            console.error('[engine/chat] stream-close log failed (non-fatal):', logErr);
          }

          controller.close();
        }
      },
    });

    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    };
    if (sessionId) headers['X-Session-Id'] = sessionId;

    return new Response(stream, { headers });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Engine initialization failed';
    console.error('[engine/chat] init error:', errorMsg);
    return jsonError(errorMsg, 500);
  }
}

interface MessageLike {
  role: string;
  content?: unknown;
}

// [v1.3 — G11] Sonnet rates retained as defaults for the legacy
// `Message` / `ConversationLog` row writer below, where we don't have
// model context. The TurnMetrics path uses the per-model
// `costRatesForModel` helper imported from `@/lib/engine/cost-rates`.
const COST_PER_INPUT_TOKEN = 3 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000;

function extractToolCalls(content: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(content)) return undefined;
  const calls = content.filter(
    (b: unknown): b is Record<string, unknown> =>
      typeof b === 'object' && b !== null && (b as Record<string, unknown>).type === 'tool_use',
  );
  return calls.length > 0 ? calls : undefined;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return JSON.stringify(content ?? '');
  const texts = content
    .filter((b: unknown) => typeof b === 'object' && b !== null && (b as Record<string, unknown>).type === 'text')
    .map((b: unknown) => (b as Record<string, unknown>).text ?? '');
  return texts.join('\n') || JSON.stringify(content);
}

// [SIMPLIFICATION DAY 5] defaultFollowUpDays + AdviceItem.followUpDays
// retired with the follow-up cron stack. AdviceItem keeps the tool's input
// shape (followUpDays still parsed from record_advice payloads for
// backwards-compat) but the value is ignored on insert.
interface AdviceItem {
  adviceType: string;
  adviceText: string;
  targetAmount?: number;
  goalId?: string;
  followUpDays?: number;
}

async function handleAdviceResults(
  address: string,
  sessionId: string,
  messages: MessageLike[],
): Promise<void> {
  const user = await withPrismaRetry(
    () => prisma.user.findUnique({
      where: { suiAddress: address },
      select: { id: true },
    }),
    { label: 'handleAdviceResults:userFind' },
  );
  if (!user) return;

  const adviceItems: AdviceItem[] = [];

  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      const b = block as Record<string, unknown>;
      if (b.type !== 'tool_use' || b.name !== 'record_advice') continue;
      const input = b.input as { advice?: AdviceItem[] } | undefined;
      if (input?.advice) {
        adviceItems.push(...input.advice);
      }
    }
  }

  if (adviceItems.length === 0) return;

  for (const advice of adviceItems) {
    // [SIMPLIFICATION DAY 5] followUpDue dropped from AdviceLog along with
    // the follow-up cron stack. record_advice now logs pure history; advice
    // context surfaces it via buildAdviceContext without scheduling a check.
    await withPrismaRetry(
      () => prisma.adviceLog.create({
        data: {
          userId: user.id,
          sessionId,
          adviceText: advice.adviceText.slice(0, 500),
          adviceType: advice.adviceType,
          targetAmount: advice.targetAmount ?? null,
          goalId: advice.goalId ?? null,
        },
      }),
      { label: 'handleAdviceResults:create' },
    );
  }
}

async function logConversationTurn(
  address: string,
  sessionId: string,
  messages: MessageLike[],
  usage: { inputTokens?: number; outputTokens?: number },
  modelUsed?: string,
) {
  // [v0.49] Wrap fire-and-forget Prisma writes in withPrismaRetry to
  // smooth over transient Vercel / Neon driver hiccups. Without this
  // the lambda log fills with `DriverAdapterError: server conn crashed`
  // every time a freeze/thaw cycle kills the underlying socket.
  const user = await withPrismaRetry(
    () => prisma.user.upsert({
      where: { suiAddress: address },
      create: { suiAddress: address },
      update: {},
      select: { id: true },
    }),
    { label: 'logConversationTurn:userUpsert' },
  );

  const lastTwo = messages.slice(-2);
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  // [v0.47] Per-model rates so Haiku turns aren't reported at Sonnet prices.
  // Falls back to Sonnet defaults when modelUsed is unknown (e.g. unauth turns).
  const rates = modelUsed ? costRatesForModel(modelUsed) : { input: COST_PER_INPUT_TOKEN, output: COST_PER_OUTPUT_TOKEN };
  const costUsd = inputTokens * rates.input + outputTokens * rates.output;

  const rows = lastTwo.map((m) => {
    const tc = extractToolCalls(m.content);
    return {
      userId: user.id,
      sessionId,
      role: m.role,
      content: extractText(m.content),
      toolCalls: tc ? (JSON.parse(JSON.stringify(tc)) as object) : undefined,
      tokensUsed: m.role === 'assistant' ? outputTokens : inputTokens,
      costUsd: m.role === 'assistant' ? costUsd : 0,
    };
  });

  await withPrismaRetry(
    () => prisma.conversationLog.createMany({ data: rows }),
    { label: 'logConversationTurn:createMany' },
  );
}

async function updateConversationState(
  sessionId: string,
  pendingAction: PendingAction | null,
  messages: MessageLike[],
): Promise<void> {
  if (pendingAction) {
    await setConversationState(sessionId, {
      type: 'awaiting_confirmation',
      action: pendingAction.toolName,
      amount: typeof (pendingAction.input as Record<string, unknown>)?.amount === 'number'
        ? (pendingAction.input as Record<string, unknown>).amount as number
        : undefined,
      recipient: typeof (pendingAction.input as Record<string, unknown>)?.recipient === 'string'
        ? (pendingAction.input as Record<string, unknown>).recipient as string
        : undefined,
      proposedAt: Date.now(),
      expiresAt: Date.now() + 5 * 60_000,
    });
    return;
  }

  // tool_result blocks live in USER messages (the engine auto-creates them),
  // so scan user messages — not assistant messages — for errors.
  const userMessages = messages.filter((m) => m.role === 'user' && Array.isArray(m.content));
  const lastUserWithResults = [...userMessages].reverse().find((m) =>
    (m.content as Record<string, unknown>[]).some((b) => b.type === 'tool_result'),
  );

  if (lastUserWithResults && Array.isArray(lastUserWithResults.content)) {
    const blocks = lastUserWithResults.content as Record<string, unknown>[];
    const errorBlock = blocks.find((b) => b.type === 'tool_result' && b.isError === true);

    if (errorBlock) {
      // Find the corresponding tool_use in the preceding assistant message
      const userIdx = messages.indexOf(lastUserWithResults);
      const precedingAssistant = userIdx > 0 ? messages[userIdx - 1] : null;
      const failedTool = Array.isArray(precedingAssistant?.content)
        ? (precedingAssistant!.content as Record<string, unknown>[]).find((b) => b.type === 'tool_use')
        : undefined;

      await setConversationState(sessionId, {
        type: 'post_error',
        failedAction: (failedTool?.name as string) ?? 'unknown',
        errorMessage: typeof errorBlock.content === 'string' ? errorBlock.content.slice(0, 200) : 'Unknown error',
        occurredAt: Date.now(),
      });
      return;
    }
  }

  // Successful turn — reset to idle
  await setConversationState(sessionId, { type: 'idle' });
}
