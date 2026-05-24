/**
 * Audric chat route — Agent-backed POST /api/chat.
 *
 * --- WHY THIS FILE EXISTS (v0.7c Phase 2) ---
 *
 * SPEC §"Phase 2 — First end-to-end round-trip":
 *   - Day 2a: replace template's default chat route with an audric route
 *     reading from engine; emit `result.toUIMessageStreamResponse()`.
 *   - Day 2b: wire `balance_check` end-to-end + minimal renderer + verify
 *     TurnMetrics row shape matches production (G4 acceptance).
 *   - Day 2c: wrap engine model with `gateway('anthropic/<model>')`
 *     (D-6 lock) + enable `experimental_telemetry` (D-18 lock) so OTel
 *     spans land in the Vercel AI Gateway dashboard. G6 verifies 5-feature
 *     passthrough (cache, multi-block thinking, signed thinking, structured
 *     output, system prompt).
 *   - Day 2c++ Batch 1 (S.172): TelemetryIntegration replaces the legacy
 *     MinimalTurnMetricsCollector; AI Elements `Tool` replaces the custom
 *     tool-part renderer; perplexity_search via `gateway.tools.*` replaces
 *     the engine's Brave web_search tool.
 *   - **Day 2e (S.174) — THIS REFACTOR:** Compose via AI SDK's
 *     `Experimental_Agent` (the concrete `ToolLoopAgent` class) instead
 *     of `AISDKEngine.submitMessage()`. Per D-15 lock — engine internals
 *     stay on `streamText`; audric-side adopts `Agent` for cleaner
 *     composition + native middleware mount points (Phase 5.5 wraps the
 *     model with `wrapLanguageModel` here; D-17). Per D-18 lock —
 *     `experimental_telemetry` continues to ship OTel traces to the
 *     Vercel AI Gateway dashboard (verified at Day 2c; preserved here).
 *
 * **Naming history (S.197b, v0.7c Session 5.5, 2026-05-20):** this file
 * previously lived at `app/(chat)/api/audric-chat/route.ts` (URL
 * `/api/audric-chat`). The `audric-chat` naming was template-debris —
 * the file had to dodge the template's pre-existing `/api/chat` route
 * during the Phase 2 incremental wire-up. S.197a Path A lock (chat
 * cutover targets THIS Audric file, NOT the template's) made the
 * template route dead code; S.197b deleted the template + renamed
 * this file to its natural URL `/api/chat` (matching `useChat({
 * api: '/api/chat' })` in `app/chat/audric-chat-client.tsx`). The
 * route group `(chat)` continues to die in Session 9a alongside the
 * remaining template-debris files.
 *
 * --- DAY 2e ARCHITECTURE ---
 *
 * `new Experimental_Agent({ model, tools, instructions, stopWhen,
 * experimental_telemetry, experimental_context, providerOptions })`
 * builds the composition. `agent.stream({ messages })` returns a
 * `StreamTextResult<TOOLS, OUTPUT>` — same shape `streamText` returns
 * (verified by the AI SDK type — `agent.stream` literally calls
 * `streamText` internally).
 *
 * The route then iterates `result.fullStream` (AI SDK `TextStreamPart`
 * chunks) and:
 *  1. Feeds each chunk to `collector.observeChunk()` for the 41-field
 *     TurnMetrics row (preserves Day 2b G4 acceptance).
 *  2. Translates each chunk to a UIMessage part via `translateChunk()`
 *     and writes through the createUIMessageStream writer.
 *
 * The engine's tool-wrapping (guards + preflight + USD-aware permissions
 * + result budgeting) is preserved via `toAISDKTools(legacyTools)` —
 * the same wrapper `AISDKEngine.submitMessage` uses internally. The
 * `experimental_context` envelope is built via `buildInternalContext()`
 * (also from `@t2000/engine` — exposed in v2.11 for host-side composition).
 *
 * What the engine WAS doing that this refactor preserves:
 *  - Wrapping legacy tools with the AI SDK Tool() shape (toAISDKTools)
 *  - Wiring guards/preflight/USD permissions into `needsApproval` and
 *    `tool.execute` via the InternalContext envelope (buildInternalContext)
 *  - OTel telemetry via `experimental_telemetry`
 *  - Prompt caching via `providerOptions.gateway.caching: 'auto'`
 *
 * What the engine WAS doing that this refactor DOES NOT preserve
 * (deferred to Phase 3+ or absent from Day 2b/2c++ scope anyway):
 *  - `microcompact()` dedupe of identical tool calls across turn history
 *    (Phase 3+ re-adds via `experimental_transform` if multi-turn smokes
 *    show lazy-answering; current single-turn web-v2 doesn't need it)
 *  - StreamCheckpointStore / resume-on-reload (LOCK-4 in
 *    BENEFITS_SPEC_v07e). DEFERRED — see "LOCK-4 deferral" note below.
 *  - `pending_action` EngineEvent emission (replaced by AI SDK's native
 *    `needsApproval` round-trip via experimental_providerMetadata per D-8;
 *    Phase 3 wires the first write tool through this path — SPEC 40 Batch 3
 *    is the canonical migration of all 12 writes)
 *  - `turn_complete` semantic event (replaced by AI SDK's `finish` chunk)
 *  - `stream_started` event — paired with the LOCK-4 deferral below.
 *
 * **LOCK-4 deferral note (P1-A from 2026-05-22 H2 audit).**
 *
 * v0.7e SPEC LOCK-4 mandated wiring the engine's `StreamCheckpointStore`
 * (Upstash-backed in production, prior art at
 * `audric/apps/web/lib/engine/upstash-stream-checkpoint-store.ts`). The
 * deferral reason: that store appends raw `EngineEvent` objects to
 * Upstash, but web-v2's wire format is AI SDK v6's `UIMessage` stream
 * chunks (via `useChat` + `DefaultChatTransport`). The two formats are
 * not interchangeable — the engine no longer emits `EngineEvent`s in
 * the v0.7c refactor that this file is the canonical home for.
 *
 * Two viable paths exist for restoring resume-on-reload:
 *   (a) Build a parallel checkpoint mechanism for UIMessage stream
 *       chunks. No prior art; requires its own SPEC.
 *   (b) Restructure web-v2's chat client onto the legacy `useEngine`
 *       hook. Would undo v0.7c's "use vanilla `useChat`" decision.
 *
 * Neither is a P1-fix-sized change. The DB-hydrate path
 * (`/chat/[id]` → load persisted messages) covers the resume-on-reload
 * value for completed turns; only LIVE mid-stream reload is unhandled,
 * which is the lower-frequency case. Track as v0.7f follow-up.
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 2 Day 2e" + tracker S.174.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import {
  type AddressPortfolio,
  applyToolFlags,
  buildInternalContext,
  classifyEffort,
  composeBundleFromToolResults,
  DEFAULT_GUARD_CONFIG,
  DEFAULT_PERMISSION_CONFIG,
  getModifiableFields,
  getToolPolicy,
  harnessShapeForEffort,
  isBundleableTool,
  MAX_BUNDLE_OPS,
  type PendingAction,
  type PendingToolCall,
  READ_TOOLS,
  type ServerPositionData,
  type Tool,
  type ToolContext,
  toAISDKTools,
  type UserPermissionConfig,
  WRITE_TOOLS,
} from "@t2000/engine";
import { waitUntil } from "@vercel/functions";
import {
  Experimental_Agent as Agent,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  defaultSettingsMiddleware,
  gateway,
  generateId,
  type LanguageModel,
  type ModelMessage,
  stepCountIs,
  type TelemetrySettings,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
  type UIMessageStreamWriter,
  wrapLanguageModel,
} from "ai";
import { z } from "zod";
import {
  applyAccountAgeGate,
  computeAccountAgeDays,
} from "@/lib/audric/account-age-gate";
import {
  getChatById as getChatRowById,
  saveMessages,
  setActiveStreamId,
} from "@/lib/audric/chat-persistence";
import { generateChatTitle } from "@/lib/audric/chat-title";
import {
  argsFingerprint,
  dispatchIntentsToParts,
  synthesizeAssistantToolMessage,
} from "@/lib/audric/dispatch-intents";
import { getFinancialContextBlock } from "@/lib/audric/financial-context";
import { redactAddressesInText, redactPII } from "@/lib/audric/log-redact";
import { MemWalMemoryStore } from "@/lib/audric/memwal-memory-store";
import { buildMemoryPrepareStep } from "@/lib/audric/memwal-prepare-step";
import { buildMemoryWriteCallback } from "@/lib/audric/memwal-write-callback";
import { audricObservabilityMiddleware } from "@/lib/audric/middleware/observability";
import { buildAdviceContext } from "@/lib/audric/moat-context";
import { ensureNaviMcpConnected } from "@/lib/audric/navi-mcp";
import {
  dispatchPostWriteRefresh,
  extractWritesNeedingRefresh,
} from "@/lib/audric/post-write-refresh";
import {
  extractResumeOutcomes,
  type ResumeOutcome,
} from "@/lib/audric/resume-outcome";
import { selectResponseMessageId } from "@/lib/audric/select-response-message-id";
import { getSessionSpend } from "@/lib/audric/session-spend";
import { sanitizeStreamErrorMessage } from "@/lib/audric/stream-errors";
import { buildAudricSystemPrompt } from "@/lib/audric/system-prompt";
import { TelemetryIntegration } from "@/lib/audric/telemetry-integration";
import {
  countReasoningParts,
  countToolParts,
  validateModelMessages,
} from "@/lib/audric/validate-model-messages";
import { getCurrentUser } from "@/lib/audric-auth";
import { env } from "@/lib/env";
import { ChatbotError } from "@/lib/errors";
import { memwal } from "@/lib/memwal";
import { getPortfolio, prewarmPortfolio } from "@/lib/portfolio";
import { Prisma, prisma } from "@/lib/prisma";
import { checkIpRateLimit } from "@/lib/ratelimit";
import { getResumableStreamContext } from "@/lib/resumable-stream";
import { subscribeToAbort } from "@/lib/stream-abort";
import { getSuiRpcUrl } from "@/lib/sui-rpc";

// [S.212 — 2026-05-21] Bumped from 60s to 300s to match the legacy
// `apps/web/app/api/engine/chat/route.ts` ceiling. Pre-S.211 turns
// rarely exceeded 60s because adaptive thinking wasn't actually
// emitting (the `display: 'summarized'` knob was missing). Post-S.211
// the model genuinely thinks on Tier 2 / Tier 3 prompts — observed
// 57s + 44s thinking spans in production, both of which hit the 60s
// Vercel Runtime Timeout. 300s matches the proven legacy ceiling.
export const maxDuration = 300;

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_MODEL_USED = "claude-sonnet-4-6";
const DEFAULT_MAX_TURNS = 10;

// [Phase 5e — 2026-05-19] Custom UIMessageStream data part type for the
// bundle marker. AI SDK supports `data-*` custom parts via the writer;
// the client reads them off `m.parts` and folds the referenced
// `tool-*` parts under a single bundle PermissionCard. The type
// string MUST start with `data-` per AI SDK's part type contract.
const BUNDLE_MARKER_TYPE = "data-audric-bundle" as const;

/**
 * [Phase 5e] Bundle marker payload — emitted as a `data-audric-bundle`
 * UIMessageStream part at the `finish-step` boundary when the LLM
 * produced ≥2 confirm-tier bundleable writes in one step. The client
 * reads this off `m.parts` to render ONE PermissionCard for the whole
 * bundle (instead of N cards for N approval-requests), dispatch ONE
 * sponsored `bundle` transaction (atomic PTB), then fan-out N
 * `addToolApprovalResponse` + N `addToolOutput` calls so AI SDK's
 * state machine sees individual resolutions.
 *
 * The `steps[]` shape mirrors the engine's `PendingActionStep[]` for
 * the fields the renderer needs (`toolName`, `input`, `description`,
 * `modifiableFields`), plus the AI SDK identity fields the client
 * needs to dispatch back to AI SDK (`toolCallId`, `approvalId`). One
 * payload per bundle; the original `tool-input-available` +
 * `tool-approval-request` chunks still emit individually after the
 * marker so AI SDK's part state machine stays consistent — the client
 * just hides them via `toolCallId ∈ bundle.toolCallIds`.
 */
export interface AudricBundleMarker {
  /**
   * Per-step rendering payload. Carries everything the bundle
   * PermissionCard needs to display the steps list + dispatch back
   * to AI SDK on Approve/Deny without re-resolving anything.
   */
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
  }>;
}
// AI SDK doesn't expose a token estimator publicly; this is a coarse
// heuristic matching the engine's estimateTokens (chars / 4). Used only
// to seed `TurnMetrics.contextTokensStart` for warehouse parity — not
// load-bearing for any runtime decision.
const CHARS_PER_TOKEN_ESTIMATE = 4;

// -----------------------------------------------------------------------------
// Request body schema — minimal Day 2a/2b shape
// -----------------------------------------------------------------------------

const messageRoleSchema = z.enum(["user", "assistant", "system"]);

// AI SDK v6 `useChat` sends messages in `UIMessage` shape: `{id, role,
// parts: Array<UIMessagePart>}`. Direct curl callers send the simpler
// `{role, content}` shape. Both shapes are accepted at the edge and
// normalised below before being fed to `Agent.stream`.
//
// [Phase 3 Day 3a / S.175] The earlier Day 2b shape extracted just
// `text` parts and rejected messages with no text — that worked for
// the user-only smoke but BREAKS the HITL resume turn. After the user
// approves a tool call, `useChat` fires the next request with an
// assistant message whose parts are tool-only (`tool-<name>` in state
// `output-available`) and NO text. Rejecting that message kills the
// LLM narration. We now keep the raw `parts` array and delegate the
// UI → ModelMessage translation to AI SDK's `convertToModelMessages`,
// which understands tool calls, tool results, tool approvals, and
// tool denials natively.
const partSchema = z
  .object({
    type: z.string(),
  })
  .passthrough();

const legacyMessageSchema = z.object({
  role: messageRoleSchema,
  content: z.string().min(1, "content must be a non-empty string"),
});

const uiMessageSchema = z.object({
  id: z.string().optional(),
  role: messageRoleSchema,
  parts: z.array(partSchema).min(1, "parts must contain at least one entry"),
});

const messageSchema = z.union([uiMessageSchema, legacyMessageSchema]);

const bodySchema = z.object({
  id: z.string().optional(),
  messages: z
    .array(messageSchema)
    .min(1, "messages must contain at least one entry")
    .max(100, "messages list capped at 100 entries"),
  /**
   * Optional session id. Day 2b client can pass a stable id for
   * multi-turn TurnMetrics grouping; absent → route generates a fresh
   * UUID per request. (Production audric/web stamps session ids via
   * the chat-list flow; web-v2 wires that in Phase 3.)
   */
  sessionId: z.string().min(1).max(120).optional(),
  /**
   * Optional turn index (0-based). Day 2b client tracks this; absent →
   * derived from `messages.length` so single-shot smoke requests work.
   */
  turnIndex: z.number().int().min(0).optional(),
});

// -----------------------------------------------------------------------------
// POST handler
// -----------------------------------------------------------------------------

export async function POST(request: Request) {
  // 1. Auth gate
  const session = await getCurrentUser();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const walletAddress = session.user.id;

  // 1.5. Rate limit — 30 requests per 60 seconds per IP (Redis-backed).
  //
  // [P2.5 / S.285 — 2026-05-24] Replaced the in-memory `rateLimit()`
  // helper with `checkIpRateLimit` (`lib/ratelimit.ts`). The previous
  // in-memory limiter was per-instance; Vercel cold-starts wiped the
  // counter, so a bot could pace requests across cold instances to
  // dodge the limit indefinitely. The Redis-backed limiter is
  // cross-instance correct.
  //
  // Policy: 30 messages / 60s / IP — widened from the in-memory
  // limiter's 20/60s for headroom on legitimate fast-typers (the HITL
  // resume pattern means one user can legitimately hit the route from
  // multiple tabs concurrently — see Phase 6.5 comment retained
  // below).
  //
  // Why IP-keyed (not user-keyed): a single user can hit the route
  // from multiple tabs concurrently (HITL resume from one tab while
  // authoring a new turn in another) which is a legitimate use case;
  // IP-keying captures bot-style burst patterns without
  // false-positiving on real user behavior.
  //
  // Degrades open: in dev / preview / Redis-unavailable scenarios the
  // limiter no-ops. Anthropic's own per-key rate limit is the
  // secondary safety net. See `lib/ratelimit.ts` for the full
  // degrade-open conditions and `Retry-After` semantics.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkIpRateLimit(ip);
  if (!rl.success) {
    // Build the canonical ChatbotError response (single source of
    // truth for the user-facing message lives in `lib/errors.ts`),
    // then layer on the `Retry-After` header for HTTP-semantic
    // correctness (curl, monitoring, browser-fetch retry hints).
    const baseResponse = new ChatbotError("rate_limit:chat").toResponse();
    const headers = new Headers(baseResponse.headers);
    headers.set("Retry-After", String(rl.retryAfterSec));
    return new Response(baseResponse.body, {
      status: baseResponse.status,
      headers,
    });
  }

  // [Bug fix 2026-05-20] Pre-warm the canonical portfolio fetch so the
  // engine's `balance_check` positionFetcher call below shares the
  // in-flight Promise instead of issuing a duplicate fan-out. Pattern
  // mirrors `audric/apps/web/lib/engine/engine-factory.ts` (legacy).
  // Returns void immediately; the underlying Promise is retained in
  // `getPortfolio`'s inflight map and reused by the next call. Errors
  // are swallowed here — the consumer (positionFetcher / direct call)
  // surfaces the same error.
  prewarmPortfolio(walletAddress);

  // 2. Parse body
  let body: z.infer<typeof bodySchema>;
  try {
    const json = await request.json();
    body = bodySchema.parse(json);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Invalid request body",
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  // [Phase 3 Day 3a / S.175] At least one user-authored entry must
  // exist. After the HITL handshake the resume turn carries a prior
  // user message AND an assistant message with tool-only parts — the
  // latter is valid; the user check guards against bots / curl
  // hitting the chat route with assistant-only history.
  const hasUserMessage = body.messages.some((m) => m.role === "user");
  if (!hasUserMessage) {
    return new Response(
      JSON.stringify({
        error: "messages must contain at least one user-authored entry",
      }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  // Day 2e: either `AI_GATEWAY_API_KEY` (preferred — D-6 lock) OR
  // `ANTHROPIC_API_KEY` (fallback) must be set. The gateway path picks
  // up `AI_GATEWAY_API_KEY` from the AI SDK's auto-discovery; the
  // fallback path uses `@ai-sdk/anthropic`'s `createAnthropic` with
  // `ANTHROPIC_API_KEY`.
  if (!(env.AI_GATEWAY_API_KEY || env.ANTHROPIC_API_KEY)) {
    return new Response(
      JSON.stringify({
        error:
          "Neither AI_GATEWAY_API_KEY (preferred, D-6) nor ANTHROPIC_API_KEY (fallback) is set",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  // [v0.7e Persistent Chats (S.247) — P1-E lazy creation update]
  // Resolve chatId + ensure ownership.
  //
  // Three branches:
  //   (a) `body.id` present + chat exists + caller owns it       → resume turn
  //   (b) `body.id` present + chat exists + caller does NOT own  → 403
  //   (c) chat does not yet exist (either `body.id` present-but-fresh,
  //       or `body.id` absent → server generates one)            → first turn
  //
  // **P1-E orphan-row fix.** Pre-P1-E this code ran `saveChat(...)` eagerly
  // here — every POST to /api/chat created a Chat row, even if the user
  // closed the tab before the first response landed. That left empty
  // chats in the sidebar. Now: we DEFER chat-row creation to the first
  // successful `saveMessages` call (via the new lazy-upsert path inside
  // `saveMessages` itself). The ownership check still runs here so we
  // 403 on the not-yours case before any LLM work happens; the
  // `isNewChat` flag still drives the title-generation trigger below.
  //
  // Failures here are non-fatal — we log + degrade to ephemeral session
  // if Neon is unavailable.
  const chatId = body.id ?? generateId();
  let isNewChat = false;
  try {
    const existing = await getChatRowById({ chatId });
    if (existing) {
      if (existing.userId !== walletAddress) {
        return new Response(
          JSON.stringify({ error: "Chat does not belong to caller" }),
          { status: 403, headers: { "content-type": "application/json" } }
        );
      }
    } else {
      isNewChat = true;
    }
  } catch (err) {
    console.warn(
      "[audric-chat] chat-persistence ownership check failed (continuing ephemerally):",
      err instanceof Error ? err.message : String(err)
    );
    isNewChat = false;
  }

  const sessionId = body.sessionId ?? `web-v2-${crypto.randomUUID()}`;
  const turnIndex =
    body.turnIndex ?? Math.max(0, Math.floor(body.messages.length / 2));
  const collector = new TelemetryIntegration();
  const contextTokensStart = estimateContextTokens(body.messages);

  // [Phase 3 outcome-update slice / 2026-05-19] Cross-turn outcome
  // resolution — the v0.7c rewrite folds the legacy `/api/engine/resume`
  // route's `updateMany` logic into the chat route (per D-3 (c)).
  //
  // When the user approves (or denies) a HITL tool call, `useChat`
  // auto-fires the resume turn to `/api/audric-chat`. The request
  // body's LAST assistant message carries the resolved tool parts:
  // `state: 'output-available'` for confirmed (with the client-
  // measured `writeToolDurationMs` in `output`) or `state: 'output-
  // error'` for denied / failed. We walk that message via
  // `extractResumeOutcomes(...)`, then run a Prisma `updateMany`
  // keyed on `attemptId` (== AI SDK `approvalId`, per harness Spec
  // §Item 3a) for each outcome.
  //
  // Fire-and-forget: never blocks the response stream. Idempotent —
  // multi-turn history has the same tool part on every subsequent
  // turn; subsequent `updateMany` calls overwrite with the same
  // value. We only walk the LAST assistant message so we don't keep
  // re-updating older HITL rows from earlier in the conversation.
  const resumeOutcomes = extractResumeOutcomes(body.messages);
  if (resumeOutcomes.length > 0) {
    console.log(
      `[audric-chat] resume-turn detected: ${resumeOutcomes.length} HITL outcome(s) — ${resumeOutcomes
        .map(
          (o) =>
            `attemptId=${o.attemptId.slice(0, 8)} outcome=${o.outcome}${
              o.writeToolDurationMs === null
                ? ""
                : ` ms=${o.writeToolDurationMs}`
            }`
        )
        .join(", ")}`
    );
    for (const o of resumeOutcomes) {
      persistResumeOutcome(o);
    }
  }

  // 3. NAVI MCP singleton — same as Day 2b. Required for `balance_check`
  // since its SDK fallback wants a signing keypair (read-only Day 2b
  // doesn't wire one); the MCP path is what audric/web production uses.
  const mcpManager = await ensureNaviMcpConnected();

  // [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY A.5 / S.198 — 2026-05-20]
  // Permission config + account-age gate inputs.
  //
  // Mirrors `apps/web/lib/engine/engine-factory.ts` L376-379 + L532-544
  // exactly. Two reads, both fail-open: if the user has no
  // `UserPreferences` row yet we use `DEFAULT_PERMISSION_CONFIG`; if
  // the `User` row is missing (shouldn't happen post-auth, but
  // defensive) `applyAccountAgeGate` treats `null` ageDays as legacy
  // fail-open. Both queries are short, parallel-safe, and only run
  // once per turn (Phase 3.6's per-turn caching of read tools doesn't
  // apply at this boundary — these are session-scoped, not turn-scoped,
  // but the cost is two indexed point-lookups so we accept the
  // duplicate work for now).
  //
  // `Promise.all` over `userPreferences.findUnique` +
  // `user.findUnique`. Each `.catch(() => null)` so a DB blip on
  // either lookup degrades to the safest config (gated + default
  // limits) instead of failing the chat turn.
  const [userPrefsRow, userRow] = await Promise.all([
    prisma.userPreferences
      .findUnique({
        where: { address: walletAddress },
        select: { limits: true },
      })
      .catch(() => null),
    prisma.user
      .findUnique({
        where: { suiAddress: walletAddress },
        // [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY B.1-B.4 / S.198 — 2026-05-20]
        // `id` selection added: AdviceLog / UserFinancialProfile /
        // UserMemory all FK on User.id, so we need it for the moat
        // hydration Promise.all below. Cheap to add — `User.id` is the
        // primary key column, already indexed, no extra cost.
        select: { createdAt: true, id: true },
      })
      .catch(() => null),
  ]);
  const accountAgeDays = computeAccountAgeDays(userRow?.createdAt ?? null);
  const userId = userRow?.id ?? null;
  const rawPermissionConfig: UserPermissionConfig =
    (userPrefsRow?.limits as UserPermissionConfig | null) ??
    DEFAULT_PERMISSION_CONFIG;
  // SPEC 30 D-13: < 7d accounts get every `autoBelow` zeroed → no
  // auto-tier writes can fire. Closes takeover-while-onboarding drain
  // class. After Day 7 the gate is a no-op (returns input unchanged).
  const permissionConfigForTurn = applyAccountAgeGate(
    rawPermissionConfig,
    accountAgeDays
  );

  // 4. Resolve the language model (gateway preferred; direct-Anthropic
  // fallback when AI_GATEWAY_API_KEY is absent).
  //
  // [Phase 5.5 / D-17 / G8.5 — 2026-05-19] Wrap the underlying model in
  // `wrapLanguageModel` with the audric observability middleware.
  // The middleware emits a redacted per-call telemetry line to console
  // (provider/model/prompt-tokens/first-byte-latency/last-user-text-PII-scrubbed)
  // so operators can grep `vercel logs` for individual LLM calls
  // without trawling OTel spans. PURE-OBSERVATION — does not mutate
  // params, never short-circuits, never replaces the response.
  //
  // Architectural reasoning for what we did NOT wrap:
  //  - Guards / preflight live INSIDE tool.execute() via the engine's
  //    `toAISDKTools` (the dispatched tool name is in scope there;
  //    model middleware fires BEFORE tool dispatch so it can't gate
  //    per-tool decisions). Activated above via `guards: DEFAULT_GUARD_CONFIG`.
  //  - PII redaction sits at the logging layer (`log-redact.ts`).
  //    Redacting addresses at the prompt boundary would break the
  //    agent — the user's wallet address is load-bearing in the
  //    system prompt and recipient addresses are load-bearing in
  //    `send_transfer.to`. We let the model SEE addresses; we just
  //    don't LOG them.
  //  - Retry/failover is the AI Gateway's job (provider failover
  //    ladder configured via Vercel).
  //
  // See `lib/audric/middleware/observability.ts` for the full
  // architectural note on why this is the honest D-17 close for
  // web-v2 (the SPEC's "delete 400-600 LoC of decorator boilerplate"
  // benefit applied to legacy audric/web; the fork sits on engine
  // helpers that already removed it).
  const useGateway = Boolean(env.AI_GATEWAY_API_KEY);
  const rawModel: LanguageModel = useGateway
    ? gateway(`anthropic/${DEFAULT_MODEL_USED}`)
    : createAnthropic({ apiKey: env.ANTHROPIC_API_KEY ?? "" })(
        DEFAULT_MODEL_USED
      );
  // [P2.3 / S.286 — 2026-05-24] Two-layer middleware chain:
  //   1. `audricObservabilityMiddleware` (outer) — per-call console
  //      telemetry line with PII-redacted last user text, prompt-token
  //      estimate, and first-byte latency. See observability.ts.
  //   2. `defaultSettingsMiddleware` (inner) — locks in
  //      `temperature: 0.3` (mostly deterministic tool routing + light
  //      narration variation; safer for Anthropic models than greedy
  //      decoding per their training-distribution guidance) and
  //      `maxOutputTokens: 8192` (doubled from Claude's 4096 default to
  //      eliminate the rare mid-receipt-narration cut-off observed in
  //      multi-step bundle responses). Settings apply BEFORE the real
  //      model executes; observability sees the params as the user sent
  //      them, while the model sees them with the defaults applied.
  //
  // Why both: observability is pure-observation (never short-circuits,
  // never transforms); defaults are pure-transform (never logs, never
  // observes). Composable: future middleware (e.g., per-tool gating)
  // can be appended without disturbing either concern.
  const model: LanguageModel = wrapLanguageModel({
    model: rawModel,
    middleware: [
      audricObservabilityMiddleware,
      defaultSettingsMiddleware({
        settings: {
          temperature: 0.3,
          maxOutputTokens: 8192,
        },
      }),
    ],
  });
  // [Phase 5.5 / D-17] Redact sessionId before logging. Today the client
  // passes a non-PII session UUID, but defense-in-depth: if a future
  // intake ever sets sessionId to a wallet address, this scans for
  // embedded address substrings and collapses them to the truncated
  // form before they hit Vercel's multi-week log retention. Non-address
  // strings pass through unchanged.
  console.log(
    `[audric-chat] sessionId=${redactAddressesInText(sessionId)} turn=${turnIndex} model=${
      useGateway
        ? `vercel-ai-gateway[anthropic/${DEFAULT_MODEL_USED}]`
        : `direct-anthropic-fallback[${DEFAULT_MODEL_USED}]`
    } telemetry=enabled composition=Experimental_Agent`
  );

  // 5. Build the tool set: legacy engine tools wrapped via `toAISDKTools`
  // (preserves guards / preflight / USD permissions / result budgeting),
  // merged with gateway-managed tools when the gateway is active.
  // Engine-native tools take precedence on key collision (same rule as
  // engine v2.10 buildToolSet at v2/engine.ts L1594).
  //
  // [Phase 3 Day 3a → Phase 4 → Phase 4b 2026-05-19] Wrap 11 of the 12
  // legacy write tools via `toAISDKTools`. The wrapper sets AI SDK's
  // native `needsApproval` callback via `buildNeedsApproval`; because
  // web-v2's `toolContext` has no `agent` (we use client-signed
  // sponsored-tx flow, not server-side signing), `need-approval.ts`
  // L113-115 returns `true` unconditionally for any confirm-tier tool
  // → AI SDK pauses on `tool-approval-request`.
  //
  // Tools wrapped (via `WRITE_TOOLS` filter):
  //   save_deposit, withdraw, send_transfer, borrow, repay_debt,
  //   claim_rewards, harvest_rewards, swap_execute.
  // [S.277] volo_stake / volo_unstake removed from WRITE_TOOLS in
  // engine 2.18.0 ("Earns Its Keep" audit).
  //
  // [S.243 / V07E_CONTACTS_SIMPLIFICATION Path A — 2026-05-22]
  // `save_contact` was removed from web-v2's tool set; the filter
  // below was kept as a transitional safety while the engine package
  // still exported the tool (H3 Phase 4 was queued as a no-rush
  // cleanup).
  //
  // [S.269 item 6 — 2026-05-23] Engine 2.16.0 deleted `save_contact`
  // from the package entirely; the filter is now a no-op (the tool
  // doesn't exist to filter out). Removed.
  //
  // [S.245 — 2026-05-22] `pay_api` / `mpp_services` no longer in
  // engine — deleted per V07E_D_QUESTION_AUDITS D-2 reframe. apps/web
  // dies en bloc in v0.7e Phase 5; pay_api returns as a Commerce
  // primitive in Audric Store SPEC (clean-slate, not a port). No
  // filter needed — the tools no longer exist to filter out.
  //
  // [S.277 — 2026-05-23] Engine 2.18.0 cut `web_search` outright
  // ("Earns Its Keep" audit). The Phase 2 D-19 dual-write was already
  // dead in prod (gateway path filtered web_search out, non-gateway
  // path was an unused fallback); now the engine tool's gone, so the
  // filter step is unnecessary. Gateway-managed `perplexity_search`
  // still surfaces when `useGateway` is on — that's our search path.
  // Non-gateway path no longer offers any search tool; LLM degrades
  // to training knowledge for protocol questions. Acceptable per
  // audit (BRAVE_API_KEY also dropped).
  const engineTools = toAISDKTools([...READ_TOOLS, ...WRITE_TOOLS]);
  const tools: ToolSet = useGateway
    ? ({
        perplexity_search: gateway.tools.perplexitySearch(),
        ...engineTools,
      } as ToolSet)
    : (engineTools as ToolSet);

  // 6. Build the InternalContext envelope threaded through every
  // tool.execute() + needsApproval + step-finish callback via
  // `experimental_context`. Day 2b/2c++/2e wires the minimum surface
  // (no guards, no contacts, no callbacks); Phase 3+ writes pass
  // permission preset + onAutoExecuted + postWriteRefresh through this.
  const abortController = new AbortController();

  // [SPEC_AUDRIC_STREAM_RESUME Phase 3 — 2026-05-24] Holds the
  // cross-instance abort subscription cleanup function once
  // `consumeSseStream` registers it. `onFinish` invokes it on natural
  // completion so the dispatch table in `lib/stream-abort.ts` doesn't
  // hold a stale reference to a freed `AbortController`. Shared across
  // the `createUIMessageStream` (onFinish) + `createUIMessageStreamResponse`
  // (consumeSseStream) closure boundaries by virtue of being declared
  // in the POST handler scope that contains both.
  let activeAbortCleanup: (() => void) | null = null;
  // [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY A.1 / S.198 — 2026-05-20]
  // Thread `AUDRIC_INTERNAL_API_URL` through `ToolContext.env` so the
  // 7 engine read tools that hit Audric's canonical API surface resolve
  // their internal base URL. The tools are:
  //
  //   - `portfolio_analysis` (calls `/api/portfolio` via getAudricApiBase
  //     for the canonical priced portfolio so the LLM, dashboard, and
  //     daily cron all see identical numbers)
  //   - `spending_analytics` (calls `/api/analytics/spending`)
  //   - `yield_summary` (calls `/api/analytics/yield`)
  //   - `activity_summary` (calls `/api/analytics/activity`)
  //   - `create_payment_link` / `list_payment_links` /
  //     `cancel_payment_link` (call `/api/internal/payments`).
  //     Payment links also cover invoicing post-V07E_INVOICE_DEPRECATION
  //     (S.269 item 7 — engine 2.17.0 deleted create_invoice /
  //     list_invoices / cancel_invoice; payment-link tool descriptions
  //     route invoice intents into them).
  //
  // Pre-Phase-6.5 web-v2's chat route built `toolContext` without an
  // `env:` field, so these tools silently returned empty/null when
  // wired. The S.196 work added `AUDRIC_INTERNAL_API_URL` to web-v2's
  // Zod schema but never threaded the value through — that's what
  // this block closes.
  //
  // **Founder ops (Vercel project: `audric-web-v2`):** set
  // `AUDRIC_INTERNAL_API_URL = https://audric-web-v2.vercel.app` so
  // web-v2's engine calls itself directly (no hop through audric.ai
  // rewrites). Optional — if unset, engine `getAudricApiBase` falls
  // through to `process.env.NEXT_PUBLIC_APP_URL` → null → tools
  // gracefully return empty/null with a "not available" `displayText`
  // (see engine `audric-api.ts:38-53`).
  // [Group E READ-side — 2026-05-21 / S.214 follow-on] Read the
  // session's cumulative auto-executed USD spend from the Upstash
  // ledger (`lib/audric/session-spend.ts`). This feeds the daily-cap
  // downgrade rule in `resolvePermissionTier` (engine
  // `permission-rules.ts` — cumulative > autonomousDailyLimit → any
  // auto-tier write downgrades to confirm-tier).
  //
  // Failure mode: fail-OPEN (returns 0 if Upstash is down). Acceptable
  // because (a) web-v2 has zero auto-tier writes today (all
  // confirm-tier), (b) per-call tier checks remain in effect even with
  // a 0 reading, and (c) the alternative (failing the chat turn for an
  // infra blip) is strictly worse UX.
  //
  // The INCREMENT side (`incrementSessionSpend` after a successful
  // auto-executed write) is wired in apps/web's engine factory via
  // `EngineConfig.onAutoExecuted`; web-v2 uses `Experimental_Agent`
  // directly so that hook path doesn't apply. When v0.7d Phase 1+
  // activates auto-tier writes, wire the increment in the
  // `translateChunk` → `tool-result` case (see TODO marker there).
  const sessionSpendUsdAtStart = await getSessionSpend(sessionId);

  // [S.269 item 0a — 2026-05-23] Both `AUDRIC_INTERNAL_API_URL` and
  // `T2000_INTERNAL_KEY` are now `requiredString` in `lib/env.ts` (no
  // longer optional). Pre-S.269 the optional posture meant a typo /
  // unset var in Vercel UI silently 401'd every internal-API tool call
  // (S.267 trace: receive.ts → no x-internal-key header → 401 →
  // data:null → no card → LLM rephrased as "unexpected result"). The
  // env validation now fails the deploy at boot if either is absent,
  // surfacing the misconfig instead of a silent product death. Engine
  // reads `AUDRIC_INTERNAL_KEY` (its canonical name); web-v2's schema
  // calls the matching value `T2000_INTERNAL_KEY` for historical reasons
  // (apps/web shared name; tracked as a follow-up rename in §M3).
  const toolContext: ToolContext = {
    walletAddress,
    suiRpcUrl: getSuiRpcUrl(),
    blockvisionApiKey: env.BLOCKVISION_API_KEY,
    env: {
      AUDRIC_INTERNAL_API_URL: env.AUDRIC_INTERNAL_API_URL,
      AUDRIC_INTERNAL_KEY: env.T2000_INTERNAL_KEY,
      // [S.277 — 2026-05-23] BRAVE_API_KEY spread dropped — engine
      // `web_search` tool cut in 2.18.0 ("Earns Its Keep" audit).
      // Gateway-managed `perplexity_search` covers the search use
      // case when `useGateway` is on.
    },
    mcpManager,
    // Per-request portfolio cache so balance_check + future read tools
    // in the same turn share a single BlockVision response (avoids
    // 200–500ms RTT amplification per the agent-harness-spec rule).
    portfolioCache: new Map<string, AddressPortfolio>(),
    // [Bug fix 2026-05-20] Wire `positionFetcher` so `balance_check`
    // (and any future read tool that needs NAVI positions) routes
    // through the canonical `getPortfolio()` reader instead of falling
    // back to NAVI MCP's `GET_POSITIONS` path.
    //
    // **Why this matters:** the NAVI MCP fallback in `balance_check`
    // pipes through `transformPositions()` in the engine, which
    // multiplies `valueUSD` by 1000 for the "newer-pool" symbols
    // (USDsui / USDe / suiUSDT — see
    // `packages/engine/src/navi/transforms.ts:225-242`). That factor
    // is a workaround for an old NAVI MCP bug where amounts were
    // returned 1000× too small for 6-decimal stablecoins in newer
    // pools; NAVI MCP's behaviour has since drifted, and the
    // workaround now over-counts USDsui savings by 1000× on production
    // smoke (a $9.19 USDsui supply renders as $9194.66). The canonical
    // `fetchPositions()` reader (in `lib/navi-positions.ts`) reads from
    // the SDK's protocol-registry NAVI adapter directly — no factor,
    // no drift — which is the SSOT every audric surface already uses.
    //
    // Per `.cursor/rules/single-source-of-truth.mdc` Item 4: when the
    // engine runs server-side inside an audric host, it MUST go through
    // the canonical `getPortfolio()` so the LLM, the dashboard hero,
    // the profile portfolio card, and the daily cron all read identical
    // numbers. The `prewarmPortfolio()` call right after auth above
    // overlaps the canonical fetch with the rest of route setup so the
    // engine sees an in-flight Promise (free dedup) by the time it
    // dispatches `balance_check`.
    //
    // Shape conversion: `Portfolio.positions.borrowsDetail`
    // (canonical reader) → `ServerPositionData.borrows_detail` (engine).
    // Same fields, just snake_case.
    positionFetcher: async (addr: string): Promise<ServerPositionData> => {
      const portfolio = await getPortfolio(addr);
      return {
        savings: portfolio.positions.savings,
        borrows: portfolio.positions.borrows,
        savingsRate: portfolio.positions.savingsRate,
        healthFactor: portfolio.positions.healthFactor,
        maxBorrow: portfolio.positions.maxBorrow,
        pendingRewards: portfolio.positions.pendingRewards,
        supplies: portfolio.positions.supplies,
        borrows_detail: portfolio.positions.borrowsDetail,
      };
    },
    signal: abortController.signal,
    retryStats: { attemptCount: 1 },
    // [Phase 3 Day 3a] USD-aware permission resolver inputs. In web-v2
    // these are forward-looking: `need-approval.ts` L113-115 forces
    // `needsApproval = true` UNCONDITIONALLY when `toolContext.agent`
    // is unset (audric's client-signed sponsored flow), so the USD
    // resolver below never gates Phase 3's `save_deposit` canary.
    // Wiring them now (a) matches the engine's ToolContext contract
    // for forward compatibility when audric eventually adds a
    // sub-threshold auto-execute path (NOT Phase 3 scope), and (b)
    // documents the intended preset.
    //
    // `priceCache` is intentionally empty at request start — future
    // read tools (token_prices, portfolio_analysis) populate it inline
    // so subsequent same-turn USD resolves get cached values without
    // re-fetching. Empty map → `resolveUsdValue` returns 0 → small
    // amounts that WOULD auto-execute (if agent were set) get rejected
    // by the L117 fallback that forces approval when priceCache is
    // empty. Conservative-by-construction.
    // [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY A.5 / S.198 — 2026-05-20]
    // USD-aware permission config from `UserPreferences.limits` +
    // ≥7-day account-age gate. Pre-A.5 web-v2 hardcoded
    // `DEFAULT_PERMISSION_CONFIG` for every user, which silently
    // ignored the user's saved `conservative` / `balanced` /
    // `aggressive` preset (set via settings → safety) AND skipped the
    // SPEC 30 D-13 account-age gate. After the chat-flip that gap
    // would have leaked the conservative-by-default behaviour for
    // newly-signed-up users (Day-1 accounts must require tap-to-
    // confirm for EVERY write, no matter how small, to close the
    // takeover-while-onboarding drain class).
    //
    // Today the `permissionConfig` is forward-looking on this surface
    // (see comment at L660-676 — `need-approval.ts` L113-115 forces
    // `needsApproval = true` unconditionally when `toolContext.agent`
    // is unset, which is the audric sponsored-flow case). Wiring it
    // correctly now (a) matches `apps/web/lib/engine/engine-factory.ts`
    // L532-544 byte-for-byte so cutover preserves behaviour, and (b)
    // is load-bearing the moment audric adopts a sub-threshold
    // auto-execute path (NOT v0.7c scope, but the wiring goes in
    // before the flip).
    permissionConfig: permissionConfigForTurn,
    priceCache: new Map<string, number>(),
    sessionSpendUsd: sessionSpendUsdAtStart,
  };
  // [Phase 5.5 / D-17 / G8.5 — 2026-05-19; shape-fix 2026-05-19 review]
  // Mutable holder for the normalized message history. The guard
  // pipeline's `getMessages` closure (passed to `buildInternalContext`
  // below) reads off this ref. We populate it AFTER `convertToModelMessages`
  // resolves (~L580); by then any tool dispatch — and therefore any
  // guard call — has the latest history available.
  //
  // CONTENT SHAPE — load-bearing: `extractConversationText` in
  // `packages/engine/src/guards.ts` (L1247-1259) walks `msg.content`
  // ONLY when it is `Array.isArray(...)` and pulls `{type:'text', text}`
  // blocks. Anything else (including raw `string` content) is silently
  // skipped, which silently NO-OPs every guard that reads conversation
  // text (`guardAddressSource`, `guardAddressScope`, `guardAssetIntent`,
  // `guardSlippage`, `guardIrreversibility`, `guardCostWarning`). The
  // canonical test fixture is `guard-address-scope.test.ts` L191-207
  // (`{ role: 'user', content: [{ type: 'text', text: '...' }] }`).
  const guardMessagesRef: {
    current: Array<{
      role: string;
      content: Array<{ type: string; text: string }>;
    }>;
  } = { current: [] };

  const internalContext = buildInternalContext({
    toolContext,
    walletAddress,
    // [Phase 5.5 / D-17 / G8.5 — 2026-05-19] Activate the 14-guard
    // pipeline by passing `DEFAULT_GUARD_CONFIG`. Without this, the
    // engine's `runGuardsForTool` returns `{ allowed: true }` immediately
    // (see `packages/engine/src/v2/guard-runner.ts` L92) and the 14
    // Safety/Financial/UX-tier guards are NO-OPs. The wrapper plumbing
    // has been in place since Phase 3 (`toAISDKTools` runs guards inside
    // every wrapped tool's `execute()`); only the config was missing.
    //
    // Default config thresholds (engine `guards.ts` L139-154):
    //   - Health Factor warn < 2.0, BLOCK < 1.5
    //   - Large transfer warn > $50, strong warn > $500
    //   - All other guards on (balance / slippage / stale data /
    //     irreversibility / cost / retry / input validation /
    //     address-source / asset-intent / swap-preview / address-scope).
    //
    // Architectural note: guards live INSIDE tool.execute() (after the
    // model picks a tool, before legacy call), NOT in model middleware.
    // Model middleware runs BEFORE tool dispatch — at that point you
    // don't know which tool to gate on. The SPEC's "convert guards to
    // middleware adapters" framing matched legacy audric/web's
    // decorator-wrapped streamText; web-v2's fork sits on engine
    // helpers that already do the right thing.
    guards: DEFAULT_GUARD_CONFIG,
    // [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY C.2 / S.198 — 2026-05-20]
    // Stream guard fires into the telemetry collector so `TurnMetrics
    // .guardsFired` is real (not the pre-C.2 hardcoded `[]`). The
    // engine invokes this once per guard fire from
    // `runGuardsForTool` (packages/engine/src/v2/guard-runner.ts L104).
    onGuardFired: (g) => collector.onGuardFired(g),
    // Day 2e web-v2 has no contacts surface; pass empty.
    contacts: [],
    // `getMessages` lets guards inspect the latest history for the
    // address-source / asset-intent / address-scope scans. Reads
    // through the mutable ref populated below so the closure resolves
    // cleanly at construction time but still surfaces the latest
    // history at guard-dispatch time.
    getMessages: () => guardMessagesRef.current,
  });

  // 7. OTel telemetry settings (D-18). functionId groups spans in the
  // Vercel AI Gateway dashboard; metadata is attached as span attributes
  // so we can filter by session. CRITICAL: do NOT include `turnIndex`
  // (or any per-turn-varying field) in metadata — Vercel's AI Gateway
  // includes telemetry metadata in its cache key computation, so a
  // per-turn metadata field invalidates the cache on every turn
  // (Day 2c++ smoke verified this; sessionId is per-conversation so
  // it caches correctly).
  const experimentalTelemetry: TelemetrySettings = {
    isEnabled: true,
    functionId: "audric-chat-day2e",
    metadata: {
      sessionId,
      userId: walletAddress,
    },
  };

  // 7.5 [v0.7d Phase 6 Block A — 2026-05-21 / S.221] Moat fan-out.
  //
  // Two inputs (post-Block A; was four pre-Block A):
  //
  //   - `financialContextBlock` (layer 2) — daily orientation snapshot.
  //     "" when missing OR > 48h stale → drops layer 2 cleanly.
  //   - `adviceContext` (layer 1 dynamic) — last 5 advice rows in
  //     30-day window. AdviceLog stores what AUDRIC SAID; permanent
  //     intelligence layer (MemWal stores what the USER said,
  //     orthogonal access pattern — different table, different
  //     lifecycle).
  //
  // What was deleted in Block A:
  //
  //   - `profileRecord` reads + `buildProfileContext` block (Silent
  //     Profile / Audric Intelligence System #3) — replaced by MemWal
  //     `<memory_recall>` recall surface. `UserFinancialProfile` table
  //     drops in the Block A schema migration.
  //   - `memoryRecords` reads + `buildMemoryContext` block (B.3
  //     conversation memory + B.4 chain memory) — replaced by MemWal
  //     `<memory_recall>` recall surface. `UserMemory` table drops
  //     in the Block A schema migration.
  //
  // Both replaced layers are now injected via `prepareStep`
  // (see `lib/audric/memwal-prepare-step.ts`) which calls
  // `memwal.recall(latestUserMessage)` per step-0 and reuses the
  // result for any step-N follow-ups. Chain-memory writes are paused
  // in Block A; the chain-classifier pipeline rebuilds against
  // `memwal.store` in Block B alongside the cron migration.
  //
  // Both reads are fail-OPEN: a DB blip on either returns the empty
  // value and the chat turn proceeds without the missing moat layer.
  const [financialContextBlock, adviceContext] = await Promise.all([
    getFinancialContextBlock(walletAddress),
    userId ? buildAdviceContext(userId) : Promise.resolve(""),
  ]);

  // 7.6 [v0.7c Phase 6 prep + Phase 6.5] Assemble the F-4 5-layer
  // system prompt. Layer 5 (user message) is owned by AI SDK's
  // `messages` argument — this function never touches it. Skill recipe
  // (layer 4) stays a v0.7d gate. Layers 1 (dynamic moat additions)
  // and 3 (memory) are now wired.
  const systemInstructions = buildAudricSystemPrompt({
    adviceContext,
    financialContext: financialContextBlock,
    skillRecipeBlock: undefined, // v0.7d gate — McpPromptAdapter not wired yet
    walletAddress,
  });

  // 7.7 [S.210 — 2026-05-21; S.211 — 2026-05-21] Effort classification
  // + thinking provider options. MUST run before the Agent constructor
  // so the resulting bag can be threaded into `providerOptions.anthropic`.
  //
  // Pre-S.210 this lived ~150 lines down (next to `harnessShape` for
  // telemetry wiring) and never reached the agent — Claude ran with no
  // extended thinking config, so the `<Reasoning>` accordion stayed
  // empty even on Tier 2 / Tier 3 prompts.
  //
  // S.210 wired `{ type: 'enabled', budgetTokens: N }` via
  // `clampThinkingForEffort`. Live test post-merge: 609 reasoning
  // tokens were billed by the AI Gateway (Claude WAS thinking) but
  // ZERO `reasoning-delta` chunks reached the wire — UI still showed
  // no accordion.
  //
  // Root cause: the @ai-sdk/anthropic provider only honors the
  // `display` field when `thinking.type === 'adaptive'` (see
  // `anthropic-messages-language-model.ts` L381-384: `thinkingDisplay
  // = thinkingType === 'adaptive' ? ... : undefined`). With our
  // `type: 'enabled'` config, `display` was silently dropped, and the
  // Vercel AI Gateway defaults to `display: 'omitted'` for Claude 4.6+
  // — Anthropic STILL ran extended thinking (hence the billed
  // reasoning tokens) but the summarized thinking text was suppressed
  // before reaching the gateway stream. No `thinking_delta` events →
  // no `reasoning-delta` chunks → no UI accordion.
  //
  // S.211 fix: switch to `{ type: 'adaptive', display: 'summarized' }`
  // + pass effort via `providerOptions.anthropic.effort`. This is
  // Anthropic's recommended mode for Sonnet 4.6+ AND it makes
  // `display: 'summarized'` actually flow through. The model still
  // dynamically scales effort (low / medium / high — Sonnet doesn't
  // support `max`, that's Opus-only; we clamp `max → high`).
  //
  // `latestUserText` extraction is inlined (vs the helper at L2238
  // which works on the post-normalize array — that array is built
  // later in §9). We walk backwards through `body.messages` for the
  // last user message, then collapse its `parts[]` (UIMessage shape)
  // or `content` (legacy shape) into a single string. Empty when the
  // last message isn't a user turn (e.g. HITL resume) — classifier
  // defaults to `medium` in that case.
  const latestUserTextForEffort = (() => {
    for (let i = body.messages.length - 1; i >= 0; i--) {
      const m = body.messages[i];
      if (m.role !== "user") {
        continue;
      }
      if ("content" in m) {
        return typeof m.content === "string" ? m.content : "";
      }
      return m.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ");
    }
    return "";
  })();

  // [v0.7e Persistent Chats (S.247) — LOCK-5] Fire-and-forget Haiku-class
  // title generator on the first turn of a freshly-created chat. The row
  // already exists with `title: null`; this updates it ~300-600ms later.
  // The sidebar renders a fallback while null, so a slow / failed title
  // generation never blocks the user-perceived stream start.
  if (isNewChat && latestUserTextForEffort.length > 0) {
    // [Smoke 2026-05-22 V3 fix] Wrap with `waitUntil` — same Vercel
    // serverless teardown race as the onFinish writes. Without it the
    // sidebar shows "New chat" indefinitely (title upsert never lands)
    // for fast users who refresh before generateChatTitle's ~300-600ms
    // Anthropic round-trip completes.
    waitUntil(
      generateChatTitle({
        chatId,
        firstUserMessageText: latestUserTextForEffort,
        // [S.248-followup] Thread owner address so updateChatTitle can
        // lazy-upsert the Chat row if title gen wins the race against
        // saveMessages (P1-E moved chat-row creation into saveMessages,
        // so the row may not exist when title gen finishes).
        chatOwnerSuiAddress: walletAddress,
      }).catch((err) => {
        console.warn(
          `[audric-chat] title gen kickoff failed for chatId=${chatId}:`,
          err instanceof Error ? err.message : String(err)
        );
      })
    );
  }

  const sessionWriteCount = countWriteToolsInHistory(body.messages);
  const effortLevel = latestUserTextForEffort
    ? classifyEffort(
        DEFAULT_MODEL_USED,
        latestUserTextForEffort,
        sessionWriteCount
      )
    : ("medium" as const);

  // Map our 4-level engine effort to Anthropic's 3-level effort.
  // Sonnet 4.6 only supports low/medium/high (high is the default;
  // `max` is Opus-only and would 400 on Sonnet). `low` lets Claude
  // skip thinking entirely on trivial prompts — the model decides,
  // which gets us the same "skip thinking on greetings" outcome as
  // the old `clampThinkingForEffort('low') → disabled` path, just
  // model-driven instead of host-driven.
  const anthropicEffort: "low" | "medium" | "high" =
    effortLevel === "max" ? "high" : effortLevel;

  // Adaptive thinking is supported on Claude Sonnet 4.6 + Opus 4.6+.
  // `display: 'summarized'` is the only knob that surfaces thinking
  // text on the Vercel AI Gateway path (the gateway defaults to
  // 'omitted'). Both fields are required for the `<Reasoning>`
  // accordion to render.
  const thinkingProviderOption = {
    thinking: {
      type: "adaptive" as const,
      display: "summarized" as const,
    },
    effort: anthropicEffort,
  };

  // 8. Compose the Agent. Per D-15: audric-side `Agent` for clean
  // composition + native middleware mount points (Phase 5.5 wraps
  // `model` with `wrapLanguageModel(model, [audricGuardsMiddleware,
  // preflightMiddleware, piiRedactionMiddleware, telemetryMiddleware])`
  // here per D-17). Per D-6: gateway-routed when `AI_GATEWAY_API_KEY`
  // is set, direct-Anthropic otherwise.
  //
  // [S.210 — 2026-05-21; S.211 — 2026-05-21] `providerOptions` merges
  // TWO bags:
  //   - `gateway.caching: 'auto'` (when on the gateway path) — pre-S.210
  //     behavior, preserves auto cache_control injection
  //   - `anthropic.thinking` + `anthropic.effort` — adaptive thinking
  //     with `display: 'summarized'` so the route's `translateChunk`
  //     reasoning forwarders actually have chunks to forward (the
  //     gateway omits thinking text by default; only `summarized`
  //     surfaces it as `reasoning-delta` stream chunks)
  const providerOptionsForAgent: Record<string, unknown> = {
    anthropic: thinkingProviderOption,
  };
  if (useGateway) {
    // [S.234 — 2026-05-21] `user` field enables per-user cost attribution
    // in the Vercel AI Gateway Custom Reporting dashboard (added to AI SDK
    // October 2025; docs at https://vercel.com/docs/ai-gateway/capabilities/custom-reporting).
    // walletAddress is the canonical zkLogin-derived Sui address (same value
    // used in experimental_telemetry.metadata.userId above for OTel parity).
    // Gateway billing: $0.075 per 1k unique user IDs written — at audric scale
    // (hundreds of MAU, single-digit dollars/month total). Tags omitted: the
    // user attribution alone is the cost-attribution signal the founder asked
    // for; adding tag taxonomies prematurely fragments the dashboard.
    providerOptionsForAgent.gateway = {
      caching: "auto" as const,
      user: walletAddress,
    };
  }

  // [v0.7d Phase 1 Day 1b / S.215 — 2026-05-21] MemWal memory recall
  // injection via `prepareStep`. The factory returns:
  //   - undefined when `memwal` client is null (MEMWAL_* env vars unset
  //     → no memory recall; engine takes the legacy-only path; same
  //     posture as v0.7c). Vercel deploys without the env vars boot
  //     cleanly + run cleanly; founder activates by setting the vars.
  //   - a stateful callback otherwise. Callback owns its own
  //     `memoryCache` closure (one per request) per the engine's
  //     per-turn caching contract — recall fires ONCE at stepNumber===0,
  //     subsequent steps re-inject from cache.
  //
  // [v0.7d Phase 6 Block A — 2026-05-21 / S.221] The legacy
  // `## Remembered Context` block (from `buildAudricSystemPrompt`
  // `memoryBlock` param) was deleted in this same change. MemWal's
  // `<memory_recall>` is now the sole cross-session memory surface
  // — no parallel rendering, no staged co-existence. The Phase 1-5
  // staging window IS the smoke discipline that earned the deletion:
  // founder confirmed memory quality via G2 + G3 + G4 acceptance
  // before this deletion sweep.
  //
  // Per-user scoping: the namespace is `audric:user:<walletAddress>`.
  // `walletAddress` is always defined here (it's session.user.id —
  // checked at L310 before this code runs). Phase 1.5 / Phase 2 swaps
  // this from "founder-owned singleton + per-user namespace strings"
  // to "per-user MemWal accounts" (each user has their own delegate
  // key + MemWalAccount on Sui — true crypto-isolation). The change is
  // invisible at this call site; only `lib/memwal.ts` changes shape.
  const memWalStore = memwal
    ? new MemWalMemoryStore({
        client: memwal,
        defaultNamespace: `audric:user:${walletAddress}`,
      })
    : null;
  const prepareStepCallback = buildMemoryPrepareStep({
    memoryStore: memWalStore,
    systemInstructions,
  });

  // [Phase 2 / 2026-05-21] MemWal WRITE side: fire-and-forget post-turn
  // ingestion via `memwal.analyze(userMessageText, namespace)`. Per
  // BENEFITS_SPEC_v07d D-3 lock — writes don't block the response. See
  // `lib/audric/memwal-write-callback.ts` for the full design rationale
  // (analyze vs remember, why waitUntil, what gets logged).
  //
  // Gate on resume turns: when `body.messages` contains a tool-approval-
  // response (i.e. `extractResumeOutcomes` returned non-empty earlier
  // in the function at L433), the user message was already ingested on
  // the INITIAL turn. Skipping the resume re-ingest avoids duplicate
  // fact extraction (MemWal's LLM would re-derive the same facts from
  // the same input → MemWal-side cost + duplicate vector rows).
  const writeCallback = buildMemoryWriteCallback({
    memwal,
    namespace: `audric:user:${walletAddress}`,
    userMessageText: resumeOutcomes.length > 0 ? "" : latestUserTextForEffort,
  });

  // [S.215 follow-on / 2026-05-21] G2 + G3 verification log. Always fires
  // once per chat request — tells us in production whether the MEMWAL_*
  // env vars are landing on this deployment AND whether the prepareStep
  // + onFinish closures were constructed. Pair with the per-step
  // `[web-v2 memwal-prepare-step]` (recall) and per-turn
  // `[web-v2 memwal-write]` (analyze) logs (inside the closures) to
  // assert the full chain:
  //   - `client=true` + `recall_cb=true` + step logs appear → recall ✓
  //   - `client=true` + `write_cb=true` + analyze log appears → write ✓
  //   - `client=true` + NO step logs → callback constructed but AI SDK
  //     never called it (bug in Agent wire-up)
  //   - `client=false` → env vars not picked up by THIS deployment
  //     (Vercel didn't rebuild after env vars were added)
  //   - `write_cb=false` with `client=true` → resume-turn skip (expected)
  //     OR empty user message (also expected on tool-only resume).
  // Same diagnostic posture as S.213a's `validateModelMessages` line.
  console.info(
    `[web-v2 memwal-init] client=${memwal !== null} recall_cb=${prepareStepCallback !== undefined} write_cb=${writeCallback !== undefined} namespace=audric:user:${walletAddress.slice(0, 10)}...`
  );

  const audricAgent = new Agent({
    model,
    tools,
    instructions: systemInstructions,
    stopWhen: stepCountIs(DEFAULT_MAX_TURNS),
    experimental_telemetry: experimentalTelemetry,
    experimental_context: internalContext,
    prepareStep: prepareStepCallback,
    onFinish: writeCallback,
    // ProviderOptions has a strict `JSONObject`-indexed shape in AI SDK
    // v6; our typed bag (with `as const` literals from `caching: 'auto'`
    // / `type: 'adaptive'`) is JSON-structurally identical but doesn't
    // satisfy the index signature without a cast. Mirrors the same
    // bridge `packages/engine/src/v2/engine.ts` L1202 uses
    // (`as unknown as any` with an eslint-disable). Keeping the cast
    // localised here so the `as any` doesn't leak into the wider scope.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    providerOptions: providerOptionsForAgent as unknown as any,
  });

  // 9. Build the messages array for agent.stream().
  //
  // Two intake shapes are accepted at the edge:
  //   (a) Legacy `{role, content: string}` — direct curl / smoke tests.
  //   (b) AI SDK v6 `UIMessage` `{role, parts: [...]}` — produced by
  //       `useChat` in the browser. After the HITL handshake the parts
  //       array carries tool-call / tool-result / tool-approval-request
  //       / tool-approval-response / tool-output-denied entries that
  //       MUST be passed to the LLM (otherwise the resume turn has no
  //       context for the just-executed write).
  //
  // We hand the UI shape to AI SDK's `convertToModelMessages`, which
  // emits the canonical `ModelMessage[]` (system / user / assistant /
  // tool) including tool-call + tool-result pairs in the order the
  // model provider expects. Legacy `{role, content}` entries are
  // promoted to the UI shape with a single text part so the same
  // converter handles both — keeps the downstream path single-shape.
  const normalized: Omit<UIMessage, "id">[] = body.messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if ("content" in m) {
        return {
          role: m.role,
          parts: [{ type: "text", text: m.content }],
        } as Omit<UIMessage, "id">;
      }
      return {
        role: m.role,
        parts: m.parts as UIMessage["parts"],
      } as Omit<UIMessage, "id">;
    });

  // [Smoke 2026-05-22 V3 diagnostic] Fingerprint per-part state of
  // body.messages on POST entry — pinpoints whether the client sent
  // tool-call parts in the expected `output-available` state after
  // user-confirm + sponsoredTx + addToolOutput. If body.messages already
  // has `state=approval-requested` on resume turns, the client failed to
  // transition (e.g. addToolOutput didn't fire). If it's
  // `output-available` but the DB ends up with `approval-requested`,
  // the AI SDK stream-state merge is clobbering it.
  console.log(
    `[audric-chat] body-messages-states sessionId=${sessionId} turn=${turnIndex} ` +
      summariseToolStates(
        body.messages as ReadonlyArray<{
          id?: string;
          role: string;
          parts?: readonly unknown[];
        }>
      )
  );

  // [Phase 5.5 / D-17; shape-fix 2026-05-19 review] Populate the
  // guard-pipeline message ref. Guards read this via the `getMessages`
  // closure passed to `buildInternalContext` above so
  // `guardAddressSource`, `guardAssetIntent`, and `guardAddressScope`
  // (plus `guardSlippage` / `guardIrreversibility` / `guardCostWarning`
  // for their `lastAssistantText` / `fullText` reads) can scan the
  // user's recent text.
  //
  // SHAPE: `extractConversationText` in `packages/engine/src/guards.ts`
  // ONLY consumes `content` arrays of `{type:'text', text}` blocks —
  // raw string content is silently skipped (L1248 `!Array.isArray →
  // continue`). System messages are filtered out (they live in the
  // agent system prompt; not part of the guard's natural-language
  // window). Per-text-block granularity matters: `currentUserText`
  // is the LAST text block in the LAST user message (not a join), so
  // UI messages with multiple text parts get emitted as multiple
  // blocks, not concatenated.
  guardMessagesRef.current = body.messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if ("content" in m) {
        return {
          role: m.role,
          content: [{ type: "text", text: String(m.content) }],
        };
      }
      const blocks = m.parts
        .map((p) => {
          const part = p as { type?: string; text?: string };
          if (part.type === "text" && typeof part.text === "string") {
            return { type: "text", text: part.text };
          }
          return null;
        })
        .filter((b): b is { type: string; text: string } => b !== null);
      return { role: m.role, content: blocks };
    });

  // 9.5 [v0.7c Phase 6 prep] Run the intent-dispatcher on the latest
  // user message text. Per D-14 lock: deterministic regex pre-fire of
  // direct-read questions ("what's my balance?") to counter the ~30%
  // skip-rate pathology where the LLM lazy-answers from cached
  // `<financial_context>` instead of calling fresh tools.
  //
  // The dispatcher only earns its cost AFTER `<financial_context>` is
  // wired (otherwise the skip-rate pathology doesn't exist) — which is
  // why these three artifacts ship as one coupled slice.
  //
  // We only dispatch when the LAST message in `normalized` is a fresh
  // user turn (skip on HITL resume turns where the tail is an assistant
  // message with tool-output-available parts). Mirrors the legacy
  // route's `trimmedMessage` extraction pattern: empty string → no
  // intents matched → no dispatch (zero cost).
  //
  // [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY A.1 / S.198 — 2026-05-20]
  // Build the dispatcher registry from the full `READ_TOOLS` array (24
  // tools post-S.245 mpp_services deletion). Pre-Phase-6.5 only
  // `balance_check` was registered; the intent dispatcher has rules
  // for `health_check`, `transaction_history` (3 rules),
  // `activity_summary`, `yield_summary` — so wiring `READ_TOOLS` here
  // activates 5 dispatcher rules that were previously dormant.
  //
  // The dispatcher pre-fires read tools matching deterministic regex
  // intents BEFORE the LLM round-trip to dodge the ~30% lazy-answer
  // skip-rate on direct read questions (D-14 lock per BENEFITS_SPEC
  // S.173 — runbook §Day 2d). The 8 patterns themselves are
  // byte-for-byte ports from `audric/apps/web/lib/engine/intent-
  // dispatcher.ts`; only the registry-passed-in changes here.
  //
  // [S.277 — 2026-05-23] `web_search` no longer in READ_TOOLS (engine
  // 2.18.0 cut). The pre-cut dispatcher comment about the gateway-
  // path harmlessly including it is now moot.
  const readToolRegistry = new Map<string, Tool>(
    READ_TOOLS.map((t) => [t.name, t])
  );
  const latestUserText = extractLatestUserText(normalized);

  // [S.210 — 2026-05-21] `effortLevel` is now computed BEFORE the
  // Agent constructor (see L963 region) so the resulting thinking
  // budget can flow into `providerOptions.anthropic.thinking` at
  // agent construction. Pre-S.210 effort was classified HERE for
  // telemetry only; the model ran without extended thinking. Now
  // the classifier output drives BOTH (a) `providerOptions.anthropic.
  // thinking.budgetTokens` for the Anthropic call AND (b)
  // `TurnMetrics.effortLevel` + `harnessShape` for telemetry — same
  // classification, two consumers, single computation. Matches
  // `packages/engine/src/v2/engine.ts` L1146 single-classify pattern.
  const harnessShape = harnessShapeForEffort(effortLevel);

  const intentDispatchedParts = latestUserText
    ? await dispatchIntentsToParts({
        message: latestUserText,
        toolContext,
        registry: readToolRegistry,
        turnIndex,
      })
    : [];

  // [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY C.1 / S.198 — 2026-05-20]
  // Post-write refresh — host-side equivalent of the engine's
  // `EngineConfig.postWriteRefresh` mechanism (NOT reachable on the
  // Experimental_Agent path per BENEFITS_SPEC_v07c §D-15).
  //
  // Scans the LAST assistant message's parts for confirm-tier writes
  // that just succeeded on the client (sponsored-tx → addToolOutput).
  // For each detected write, looks up POST_WRITE_REFRESH_MAP and
  // pre-fires the refresh reads (deduped across writes) so the LLM
  // sees fresh balances when it narrates the receipt.
  //
  // Without this, the LLM narrates post-write paragraphs using STALE
  // pre-write balance numbers from the `<financial_context>` snapshot,
  // re-opening the hallucination class. See
  // `lib/audric/post-write-refresh.ts` for the full rationale + the
  // ported POST_WRITE_REFRESH_MAP table.
  //
  // On a non-resume turn (fresh user query) `extractWritesNeedingRefresh`
  // returns [] and this is a no-op. The only cost is one O(parts) scan
  // of the last assistant message.
  const completedWrites = extractWritesNeedingRefresh(body.messages);
  const refreshDispatchedParts =
    completedWrites.length > 0
      ? await dispatchPostWriteRefresh({
          completedWrites,
          registry: readToolRegistry,
          toolContext,
          turnIndex,
        })
      : [];

  // Merge: intent-pre-fires first (matches the user's latest question),
  // then refresh-reads (matches the just-completed writes). The order
  // matters because if a user asks "what's my balance?" right after a
  // save, the intent dispatcher already pre-fires `balance_check` with
  // the fresh result — the refresh dispatcher must NOT double-fire the
  // same tool. Dedupe via tool-name fingerprint so the refresh path
  // skips tools the intent path already handled.
  const intentFingerprints = new Set(
    intentDispatchedParts.map((p) => p.toolName)
  );
  const dispatchedReadParts = [
    ...intentDispatchedParts,
    ...refreshDispatchedParts.filter(
      (p) => !intentFingerprints.has(p.toolName)
    ),
  ];

  // Inject the synthetic assistant message carrying pre-fired tool
  // results AT THE END of the normalized array. `convertToModelMessages`
  // translates the `output-available` tool parts into the canonical
  // Anthropic [tool_use, tool_result] ModelMessage pair so the LLM
  // sees the pre-fired results as already-done history + narrates
  // around them without re-calling the tool.
  if (dispatchedReadParts.length > 0) {
    normalized.push(synthesizeAssistantToolMessage(dispatchedReadParts));
  }

  let aiSdkMessages: ModelMessage[];
  try {
    aiSdkMessages = await convertToModelMessages(normalized);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Failed to convert UIMessages → ModelMessages",
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  // [S.213 — 2026-05-21] Anthropic strict-shape safety net. Strips
  // orphan tool-call / tool-result blocks before the prompt reaches the
  // provider. Catches the class of corruption documented in
  // `lib/audric/validate-model-messages.ts` — e.g. a tool part stuck in
  // `state: 'input-available'` because its `tool-output-available`
  // chunk never arrived (stream truncation, browser disconnect,
  // network blip mid-turn). Without this gate the next POST round-trips
  // the orphan tool_use to Anthropic → 400, and the rejection persists
  // for every subsequent turn until the corrupt blocks are removed.
  //
  // Mirrors the legacy engine's `validateHistory` defense (engine
  // v2.0.5, audric session s_1778993279816_47a9814c835d incident).
  //
  // [S.213a — 2026-05-21] Diagnostic upgrade: log BOTH message-count
  // and tool-part-count deltas. A simple message-count comparison
  // misses content-level cleanup (e.g. an assistant message with
  // text + 3 orphan tool-calls — message survives because text
  // remains, but the orphan parts were stripped). The tool-part
  // counts are the canonical signal for "validateModelMessages
  // actually did work" in production logs.
  const beforeMsgCount = aiSdkMessages.length;
  const beforeToolParts = countToolParts(aiSdkMessages);
  const beforeReasoningParts = countReasoningParts(aiSdkMessages);
  aiSdkMessages = validateModelMessages(aiSdkMessages);
  const afterMsgCount = aiSdkMessages.length;
  const afterToolParts = countToolParts(aiSdkMessages);
  const afterReasoningParts = countReasoningParts(aiSdkMessages);

  // Always log a single structured line on the first POST per stream
  // so we have unambiguous evidence the function ran. Cheap (one log
  // line per chat turn). Includes ALL counts so deltas are computable
  // off the live log stream.
  //
  // [Smoke 2026-05-22 V2 root-cause fix] Added `reasoning` count to
  // surface Pass 5 (strip post-tool-call reasoning). A non-zero
  // reasoning delta on resume turns is the canonical signal Pass 5
  // is doing its job — that's the Anthropic
  // extended-thinking-block-after-tool_use bug being defused.
  console.log(
    `[audric-chat] validateModelMessages ran sessionId=${sessionId} turn=${turnIndex} ` +
      `msgs=${beforeMsgCount}->${afterMsgCount} ` +
      `toolCalls=${beforeToolParts.toolCalls}->${afterToolParts.toolCalls} ` +
      `toolResults=${beforeToolParts.toolResults}->${afterToolParts.toolResults} ` +
      `reasoning=${beforeReasoningParts}->${afterReasoningParts}`
  );

  // [Smoke 2026-05-22 V4 fix] Log-level discrimination. Pass 5
  // (`stripPostToolReasoning`) fires on EVERY resume turn after a
  // confirm-tier write — the assistant message has [text, reasoning,
  // tool-call, reasoning, tool-call, approval-request] and Anthropic's
  // extended-thinking contract requires all reasoning blocks to precede
  // all tool_use blocks within an assistant message. Pass 5 strips the
  // middle reasoning block by design. Logging this as `warn` makes the
  // happy path look like an incident every time it runs.
  //
  // Reserve `warn` for the GENUINELY surprising case: tool blocks
  // dropped (orphan tool-use without a tool-result, or vice versa) or
  // whole messages dropped. Reasoning-only deltas with no tool damage
  // are normal flow — log at `info` so we still have the data for
  // analytics without polluting the warning channel.
  const onlyReasoningStripped =
    afterMsgCount === beforeMsgCount &&
    afterToolParts.toolCalls === beforeToolParts.toolCalls &&
    afterToolParts.toolResults === beforeToolParts.toolResults &&
    afterReasoningParts !== beforeReasoningParts;
  if (
    afterMsgCount !== beforeMsgCount ||
    afterToolParts.toolCalls !== beforeToolParts.toolCalls ||
    afterToolParts.toolResults !== beforeToolParts.toolResults ||
    afterReasoningParts !== beforeReasoningParts
  ) {
    const summary =
      `sessionId=${sessionId} turn=${turnIndex} ` +
      `msgsDropped=${beforeMsgCount - afterMsgCount} ` +
      `toolCallsDropped=${beforeToolParts.toolCalls - afterToolParts.toolCalls} ` +
      `toolResultsDropped=${beforeToolParts.toolResults - afterToolParts.toolResults} ` +
      `reasoningDropped=${beforeReasoningParts - afterReasoningParts}`;
    if (onlyReasoningStripped) {
      console.info(
        `[audric-chat] validateModelMessages normalised reasoning ${summary}`
      );
    } else {
      console.warn(
        `[audric-chat] validateModelMessages STRIPPED corruption ${summary}`
      );
    }
  }

  // [S.248-followup / Smoke #3 V2 diagnostic] Full part-type sequence
  // per message. V1 only logged tool-call/tool-result IDs — useful for
  // confirming counts match, but missed the actual smoking gun: the
  // FULL part order within each ModelMessage. The Anthropic adapter
  // serializes our ModelMessage[] verbatim, and Anthropic's extended-
  // thinking + multi-step contract has subtle ordering rules
  // (thinking blocks before tool_use, no text between tool_use blocks
  // in the same step, etc.) that may be violated by our persisted
  // multi-step assistant messages.
  //
  // For each message, dump ordered part types with optional tool-id
  // suffix. e.g.:
  //
  //   [1] assistant: text|reasoning|tool-call(toolu_013kCh)|text|reasoning|tool-call(toolu_0195h6)
  //
  // This reveals whether the assistant message has structural patterns
  // the @ai-sdk/anthropic adapter chokes on (e.g. interleaved
  // text/reasoning between tool_uses) versus a clean
  // [text, reasoning, tool-call, tool-call] sequence.
  try {
    const structureSummary = aiSdkMessages.map((msg, idx) => {
      if (typeof msg.content === "string") {
        const preview = msg.content.slice(0, 40).replace(/\s+/g, " ");
        return `[${idx}] ${msg.role}: string(${preview.length}c)`;
      }
      if (!Array.isArray(msg.content)) {
        return `[${idx}] ${msg.role}: <unknown>`;
      }
      const trunc = (id: string) => id.slice(0, 12);
      const parts = msg.content.map((part) => {
        if (
          part.type === "tool-call" &&
          typeof (part as { toolCallId?: string }).toolCallId === "string"
        ) {
          return `tool-call(${trunc(
            (part as { toolCallId: string }).toolCallId
          )})`;
        }
        if (
          part.type === "tool-result" &&
          typeof (part as { toolCallId?: string }).toolCallId === "string"
        ) {
          return `tool-result(${trunc(
            (part as { toolCallId: string }).toolCallId
          )})`;
        }
        // Surface providerExecuted flag for tool-call/result parts so
        // we can spot provider-executed tools that pair inline.
        return part.type;
      });
      return `[${idx}] ${msg.role}: ${parts.join("|")}`;
    });
    console.log(
      `[audric-chat] llm-message-structure-v2 sessionId=${sessionId} turn=${turnIndex} ` +
        structureSummary.join(" || ")
    );
  } catch (logErr) {
    console.warn(
      "[audric-chat] llm-message-structure logging failed (non-fatal):",
      logErr instanceof Error ? logErr.message : String(logErr)
    );
  }

  // 10. Stream the agent and translate AI SDK chunks → UIMessage parts.
  // [SPEC_AUDRIC_STREAM_RESUME Phase 3 — 2026-05-24] Thread the existing
  // `abortController.signal` (created at line 722 for ToolContext, never
  // fired pre-Phase 3) into `agent.stream`. When the stop route fires
  // `abortController.abort()` (via `lib/stream-abort.ts` cross-instance
  // pub/sub), this cancels the in-flight LLM call + any chained
  // step-N calls, stopping Anthropic token spend mid-turn. Pre-Phase 3
  // the controller existed but was never aborted; this single new
  // option turns Stop from "client-only disconnect" into "genuine
  // cancel" end-to-end.
  const result = await audricAgent.stream({
    messages: aiSdkMessages,
    abortSignal: abortController.signal,
  });

  // [v0.7c Phase 6 — B6 fix (2026-05-20)] Mirror AI SDK's canonical
  // `getResponseUIMessageId` (ai@6.0.185 L5133-5142): on resume turns
  // (tail message is an assistant), REUSE its id so the client's
  // `processUIMessageStream` splices into the existing message in-place
  // instead of pushing a duplicate. See
  // `lib/audric/select-response-message-id.ts` for the full mechanism +
  // why a NEW id duplicates a `save_deposit` receipt card after approve.
  const messageId = selectResponseMessageId(body.messages, generateId);
  let turnCompleted = false;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start", messageId });

      // [v0.7c Phase 6 cutover hotfix — 2026-05-20]
      // Pre-fired read tool parts MUST emit in their OWN step boundary
      // (start-step ... finish-step) BEFORE the agent's text-streaming
      // step. Otherwise the assistant message ends up with parts
      // [step-start, text, tool(output-available)] inside a SINGLE
      // step, and AI SDK's `lastAssistantMessageIsCompleteWithToolCalls`
      // predicate (used by `useChat({ sendAutomaticallyWhen })` in
      // `audric-chat-client.tsx`) walks the LAST step, sees a complete
      // tool invocation, returns true, and auto-fires a spurious second
      // POST → user observes duplicate narration + card.
      //
      // The predicate keys on the last `step-start` index in the parts
      // array (verified at
      // `node_modules/.../ai/src/ui/last-assistant-message-is-complete-
      // with-tool-calls.ts` L23-38). By emitting pre-fired tools in
      // step 0 and the agent's text in step 1, the LAST step contains
      // only the text part → predicate returns false → no auto-POST →
      // user sees exactly one narration.
      //
      // Note: the synthetic assistant message injected into messages[]
      // at step 9.5 above is what makes the LLM SEE the pre-fired
      // results as already-done history (so it narrates around them
      // without re-calling the tool). This step-boundary emission is
      // the WIRE-side counterpart that prevents the client from
      // misinterpreting the pre-fired tool as "needs narration".
      if (dispatchedReadParts.length > 0) {
        writer.write({ type: "start-step" });
        for (const p of dispatchedReadParts) {
          writer.write({
            type: "tool-input-available",
            toolCallId: p.toolCallId,
            toolName: p.toolName,
            input: p.input,
          });
          writer.write({
            type: "tool-output-available",
            toolCallId: p.toolCallId,
            output: p.output,
          });
        }
        writer.write({ type: "finish-step" });
      }

      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: messageId });

      // [Phase 5e] Step-boundary buffer for atomic bundle marker
      // emission. Captures confirm-tier `tool-call` +
      // `tool-approval-request` chunks within each step; at
      // `finish-step` decides bundle vs single-write and emits a
      // `data-audric-bundle` marker if ≥2 writes are bundleable.
      const bundleBuffer = new BundleBuffer();

      // [v0.7c Phase 6 — B2 fix (2026-05-20)] Server-side microcompact
      // equivalent for the AI SDK Agent path. When the LLM re-issues a
      // read tool whose (name + input fingerprint) matches a pre-fired
      // tool already emitted in step 0, suppress the duplicate
      // tool-input-available / tool-output-available wire writes. Without
      // this, "what's my balance?" renders 2 cards (pre-fired + LLM-issued)
      // because the agent's stream still executes the LLM's call and emits
      // both events even though the result is already in context.
      //
      // The legacy `apps/web` engine path uses `microcompact()` in
      // `packages/engine/src/v2/engine.ts` to dedupe at the engine layer.
      // The Experimental_Agent path used by web-v2 has no equivalent
      // dedup, so we add it on the wire. Note this only suppresses the
      // CLIENT render — the agent still incurs the tool's execution cost
      // internally; preventing that requires hooking into the tool's
      // execute() function, which is a v0.7d optimization.
      const preFiredFingerprints = new Set(
        dispatchedReadParts.map(
          (p) =>
            `${p.toolName}:${argsFingerprint(p.input as Record<string, unknown>)}`
        )
      );
      const suppressedToolCallIds = new Set<string>();

      try {
        for await (const chunk of result.fullStream) {
          collector.observeChunk(chunk);

          // Step lifecycle: reset buffer on start, flush on finish.
          // These chunks are intentionally NOT passed to translateChunk
          // (the existing route wraps its own UIMessageStream framing).
          if (chunk.type === "start-step") {
            bundleBuffer.reset();
            continue;
          }
          if (chunk.type === "finish-step") {
            bundleBuffer.flush(writer, messageId);
            continue;
          }

          // [B2 fix] Suppress LLM-issued duplicates of pre-fired reads.
          // Tracks `toolCallId`s so the matching `tool-result` chunk is
          // suppressed too (otherwise the wire emits an orphan
          // tool-output-available for a tool the client never saw an
          // input for).
          if (chunk.type === "tool-call" && preFiredFingerprints.size > 0) {
            const fp = `${chunk.toolName}:${argsFingerprint((chunk.input ?? {}) as Record<string, unknown>)}`;
            if (preFiredFingerprints.has(fp)) {
              suppressedToolCallIds.add(chunk.toolCallId);
              console.log(
                `[audric-chat] B2 dedup: suppressed LLM-issued ${chunk.toolName} (matches pre-fired)`
              );
              continue;
            }
          }
          if (
            (chunk.type === "tool-result" || chunk.type === "tool-error") &&
            suppressedToolCallIds.has(chunk.toolCallId)
          ) {
            continue;
          }

          // Defer eligible chunks; pass through everything else.
          if (bundleBuffer.tryBufferChunk(chunk)) {
            continue;
          }

          translateChunk(chunk, writer, messageId);
          if (chunk.type === "finish") {
            turnCompleted = true;
          }
        }
      } finally {
        // Defensive: flush any chunks still buffered if the stream
        // exits mid-step (error / abort). Without this, a partial
        // bundle would be lost from the UI.
        bundleBuffer.flush(writer, messageId);
        writer.write({ type: "text-end", id: messageId });
        writer.write({ type: "finish-step" });
        writer.write({ type: "finish" });
      }
    },
    generateId,
    // [v0.7e Persistent Chats (S.247)] Persistence-mode trigger.
    // Per AI SDK v6's `createUIMessageStream` contract: passing
    // `originalMessages` flips the stream into persistence mode where
    // `onFinish` receives the FULL updated `messages: UIMessage[]`
    // array (originals + the freshly streamed assistant response).
    // We dedup by message id via `saveMessages({ skipDuplicates: true })`,
    // so re-saving prior turns on resume is a no-op.
    originalMessages: body.messages.map((m) => {
      const id = "id" in m && m.id ? m.id : generateId();
      const parts =
        "content" in m
          ? [{ type: "text" as const, text: String(m.content) }]
          : m.parts;
      return { id, role: m.role, parts };
    }) as UIMessage[],
    onFinish: ({ messages: finalMessages }) => {
      // 11. Persist TurnMetrics row (fire-and-forget; never blocks the
      // response). Matches the production fire-and-forget pattern in
      // `audric/web/app/api/engine/chat/route.ts` ~L1390.
      if (!turnCompleted) {
        collector.markInterrupted();
      }
      const payload = collector.build({
        sessionId,
        userId: walletAddress,
        turnIndex,
        // [Phase 6.5 C.2 — 2026-05-20] Real values via `classifyEffort()`
        // + `harnessShapeForEffort()` (computed at turn start above).
        // Pre-C.2 these were hardcoded to `"medium"` / `null`.
        effortLevel,
        harnessShape,
        modelUsed: DEFAULT_MODEL_USED,
        contextTokensStart,
        // [Group E READ-side — 2026-05-21 / S.214 follow-on] Replaced
        // the `sessionSpendUsd: 0` placeholder with the real value
        // read at chat-start (~L680). This matches the value flowing
        // into `ToolContext.sessionSpendUsd` for the same turn so
        // TurnMetrics rows and the engine see the same accumulated
        // spend.
        //
        // Note: the increment side is still deferred (see
        // `lib/audric/session-spend.ts` header). When auto-tier writes
        // activate post-Phase-1, the TurnMetrics row should record the
        // POST-increment value via the same `getSessionSpend` call at
        // turn END. For now the value is stable across the turn.
        sessionSpendUsd: sessionSpendUsdAtStart,
        synthetic: false,
        turnPhase: "initial",
      });
      const dataForCreate = {
        ...payload,
        // JSONB columns: Prisma distinguishes `null` from `Prisma.DbNull`.
        // Passing `Prisma.DbNull` writes SQL NULL (matches production
        // convention in audric/web/lib/engine/harness-metrics.ts L540-553).
        cetusRoute: Prisma.DbNull,
        streamResumeOutcome: Prisma.DbNull,
        // toolsCalled + guardsFired are Json columns — round-trip
        // through JSON.parse(JSON.stringify(...)) so Prisma sees plain
        // objects rather than class instances.
        toolsCalled: JSON.parse(
          JSON.stringify(payload.toolsCalled)
        ) as Prisma.InputJsonValue,
        guardsFired: JSON.parse(
          JSON.stringify(payload.guardsFired)
        ) as Prisma.InputJsonValue,
      };
      // [Smoke 2026-05-22 V3 fix] Wrap with `waitUntil` so Vercel keeps
      // the function instance alive until the Prisma write commits.
      // Without it, the serverless instance tears down when the response
      // stream closes, killing the pending DB promise. Symptom:
      // intermittent TurnMetrics gaps in NeonDB; co-occurs with the
      // saveMessages teardown bug fixed below (both share onFinish).
      waitUntil(
        prisma.turnMetrics
          .create({ data: dataForCreate })
          .catch((err: unknown) => {
            // [Phase 5.5 / D-17] Scrub embedded addresses from Prisma error
            // payloads. Prisma errors generally don't contain row values
            // but `meta.target` / unique-constraint violations can echo
            // back input fields including walletAddress.
            console.error(
              "[web-v2 audric-chat] TurnMetrics write failed (non-fatal):",
              redactPII(err)
            );
          })
      );

      // [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY A.3 / S.198 — 2026-05-20]
      // SessionUsage row per turn — fire-and-forget. Pre-Phase-6.5 web-v2
      // never wrote this row, which silently broke a load-bearing
      // downstream cron with a 30-day fuse:
      //
      //   `apps/web/lib/jobs/financial-context-snapshot.ts` (the Vercel
      //   cron job impl; `/api/internal/financial-context-snapshot`
      //   receiver route was deleted in S.224 Block C.3, 2026-05-21)
      //   filters its daily user-list to `SessionUsage.createdAt >= 30d
      //   ago`. Users who only use web-v2 post-chat-flip would age out
      //   of the snapshot population after 30 days → `<financial_context>`
      //   block goes empty → silent intelligence regression (Dimension 20
      //   of the S.198 parity audit).
      //
      // The financial-context-snapshot cron itself stays on apps/web
      // (KEEP-IN-WEB per runbook §1.1 audit-3) — only the input it
      // reads from (SessionUsage) needs to keep getting populated
      // from whichever host the user is hitting. apps/web writes its
      // own SessionUsage rows via `lib/engine/log-session-usage.ts`;
      // web-v2 mirrors that pattern here.
      //
      // **Field source:** `payload` is the TelemetryIntegration build
      // output — inputTokens/outputTokens/cacheRead/cacheWrite are
      // extracted from AI SDK's usage chunk (telemetry-integration.ts
      // L182-185), `estimatedCostUsd` is computed from per-model rates
      // (L211-214), tool names come from `payload.toolsCalled` (the
      // 41-field TurnMetrics row's Json column). `model` mirrors
      // TurnMetrics.modelUsed for cross-table consistency.
      //
      // **Why fire-and-forget:** the SessionUsage write is best-effort
      // accounting; a single failure must NOT block the user's chat
      // response. Same pattern as the TurnMetrics write above; both
      // share the redactPII error path so wallet addresses aren't
      // logged in Prisma error stack traces.
      const sessionUsageToolNames = Array.from(
        new Set(payload.toolsCalled.map((t) => t.name))
      );
      // [Smoke 2026-05-22 V3 fix] Wrap with `waitUntil` for the same
      // reason as TurnMetrics above. Without it the 30-day
      // financial-context-snapshot cron silently ages out web-v2-only
      // users (SessionUsage row never lands → cron's
      // `createdAt >= 30d` filter drops them → `<financial_context>`
      // block goes empty).
      waitUntil(
        prisma.sessionUsage
          .create({
            data: {
              address: walletAddress,
              sessionId,
              inputTokens: payload.inputTokens,
              outputTokens: payload.outputTokens,
              cacheReadTokens: payload.cacheReadTokens,
              cacheWriteTokens: payload.cacheWriteTokens,
              costUsd: payload.estimatedCostUsd,
              toolNames: sessionUsageToolNames,
              model: DEFAULT_MODEL_USED,
            },
          })
          .catch((err: unknown) => {
            console.error(
              "[web-v2 audric-chat] SessionUsage write failed (non-fatal):",
              redactPII(err)
            );
          })
      );

      // [v0.7e Persistent Chats (S.247) + P0-A + P1-E + P1-F]
      // Persist the conversation. Fire-and-forget: a single failure must
      // NEVER block the response.
      //
      // **P0-A:** `saveMessages` upserts per row so the assistant
      // message's `approval-requested → output-available` state
      // transition on continuation turns updates the DB row (previously
      // `createMany skipDuplicates` no-op'd the existing row, leaving
      // ghost permission cards on resume).
      //
      // **P1-E:** `saveMessages` lazy-upserts the Chat row using the
      // `chatOwnerSuiAddress` field — orphan chats (tab close before
      // first response) no longer pile up.
      //
      // **P1-F:** `saveMessages` bumps `Chat.updatedAt` so active chats
      // float to the top of the sidebar.
      //
      // **[S.248-followup / Smoke #3] Skip-on-abort guard.** If the
      // stream errored (e.g. Anthropic 400 on a malformed continuation),
      // `turnCompleted` is false. In that case `finalMessages` may
      // contain the corrupt mid-turn snapshot (post-write-refresh
      // synthetic messages + a partial assistant response). Persisting
      // it creates a permanent corruption loop:
      //
      //   1. User confirms `save_deposit` → resume turn begins
      //   2. Post-write-refresh injects synthetic balance_check/savings_info
      //   3. Some pre-existing converter quirk produces an orphan
      //      `tool_use` block → Anthropic rejects with 400
      //   4. Without this guard: corrupt snapshot persists → reload
      //      replays the same orphan → same 400 → forever
      //
      // The safe fallback is to persist `body.messages` (the INPUT
      // state we received from the client) instead. That captures the
      // user's confirmation (assistant tool-use in `output-available`)
      // without the synthetic refresh artifacts, so the receipt card
      // survives the failed narration turn AND the next reload starts
      // from a clean slate the LLM can actually continue.
      //
      // The monotonic `createdAt` offset preserves intra-turn ordering.
      const persistenceTimestamp = Date.now();
      const messagesToPersist = turnCompleted
        ? finalMessages
        : (body.messages as unknown as typeof finalMessages);
      if (!turnCompleted) {
        console.warn(
          "[web-v2 audric-chat] stream aborted — persisting INPUT messages " +
            `only (${messagesToPersist.length} msgs) to avoid corruption ` +
            `loop. chatId=${chatId} sessionId=${sessionId} turn=${turnIndex}`
        );
      }
      // [Smoke 2026-05-22 V3 diagnostic] Fingerprint per-part state of
      // what we're about to persist. The pair body-messages-states (POST
      // entry) + persist-states (this site) reveals whether onFinish's
      // `finalMessages` preserves the client's post-approval
      // `output-available` tool-call state, or whether AI SDK's
      // stream-state clone is collapsing it back to
      // `approval-requested` (the suspected cause of the ghost
      // permission card on refresh).
      console.log(
        `[audric-chat] persist-states sessionId=${sessionId} turn=${turnIndex} ` +
          `turnCompleted=${turnCompleted} count=${messagesToPersist.length} ` +
          summariseToolStates(
            messagesToPersist as unknown as ReadonlyArray<{
              id?: string;
              role: string;
              parts?: readonly unknown[];
            }>
          )
      );
      // [Smoke 2026-05-22 V3 fix] CRITICAL — wrap with `waitUntil`. The
      // ghost-permission-card-after-refresh bug (S.248-followup smoke
      // test #4) was caused by Vercel's serverless function tearing down
      // the moment the UIMessageStream response closed, killing this
      // Prisma upsert before it committed. Symptom verified end-to-end:
      //   - persist-states log fired with state=output-available
      //   - 24s later load-states returned state=approval-requested
      //   - identical to turn 0's persist-states snapshot → turn 1's
      //     upsert never ran.
      // `waitUntil` is Vercel's canonical pattern for "extend execution
      // past the response so the side-effect lands." Same pattern used
      // by the MemWal write callback (`memwal-write-callback.ts` L89-126).
      // Net effect: user sees the response stream close at normal
      // latency, but the function instance stays alive until
      // saveMessages commits.
      waitUntil(
        saveMessages({
          messages: messagesToPersist.map((m, i) => ({
            id: m.id,
            chatId,
            role: m.role,
            parts: m.parts as Prisma.InputJsonValue,
            attachments: [],
            createdAt: new Date(persistenceTimestamp + i),
          })),
          chatOwnerSuiAddress: walletAddress,
          visibility: "private",
        }).catch((err: unknown) => {
          console.error(
            `[web-v2 audric-chat] saveMessages failed for chatId=${chatId} (non-fatal):`,
            redactPII(err)
          );
        })
      );

      // [SPEC_AUDRIC_STREAM_RESUME Phase 1] Clear the activeStreamId on
      // natural turn completion. After this fires, the next GET to
      // /api/chat/[id]/stream returns 204 (no active stream) — the
      // client's mount-time resume probe gets nothing back, so reload
      // post-completion just shows the persisted messages without an
      // erroneous reconnect attempt. Wrapped in waitUntil for the same
      // post-response-survival reason as saveMessages above.
      waitUntil(
        setActiveStreamId({
          chatId,
          activeStreamId: null,
          userSuiAddress: walletAddress,
        }).catch((err: unknown) => {
          console.error(
            `[web-v2 audric-chat] setActiveStreamId(null) failed for chatId=${chatId} (non-fatal):`,
            redactPII(err)
          );
        })
      );

      // [SPEC_AUDRIC_STREAM_RESUME Phase 3 — 2026-05-24] Tear down the
      // cross-instance abort subscription. If the stream completed
      // naturally (the common case), the handler in `lib/stream-abort.ts`
      // would never fire — but leaving it in the dispatch table is a
      // slow memory leak (handler holds a reference to the freed
      // `AbortController`). Cleanup is synchronous (Map.delete), so no
      // waitUntil needed.
      //
      // Also fires `producer_completed_after_disconnect` telemetry:
      // if the abort subscription was registered (cleanup is non-null)
      // AND we got here, the producer completed naturally — that's
      // the SPEC's "win metric" (proves resume infrastructure is
      // doing its job of keeping the producer alive).
      if (activeAbortCleanup) {
        activeAbortCleanup();
        activeAbortCleanup = null;
        console.info(
          `[stream-resume] producer_completed_after_disconnect=ok chatId=${chatId}`
        );
      }
    },
  });

  // [SPEC_AUDRIC_STREAM_RESUME Phase 1] Wire `consumeSseStream` when the
  // feature flag + Redis are configured. `consumeSseStream` receives a
  // COPY of the outgoing SSE byte stream (independent of the client's
  // consumption — AI SDK tees internally) and lets us push it into the
  // `resumable-stream` producer keyed on a fresh streamId. The producer
  // keeps running via Next.js `after()` even after the original client
  // disconnects, so a reconnecting tab on /api/chat/[id]/stream picks
  // up live via Redis pub/sub.
  //
  // When the flag is off OR Redis is unavailable, `getResumableStreamContext()`
  // returns null and we omit the callback entirely — chat behaves
  // identically to pre-SPEC (no resume, no regression).
  const streamContext = getResumableStreamContext();
  if (!streamContext) {
    return createUIMessageStreamResponse({ stream });
  }

  return createUIMessageStreamResponse({
    stream,
    // Per AI SDK contract (`ai/dist/index.d.ts` line 2234): "The
    // callback receives a tee'd copy of the stream and does not block
    // the response." So awaiting inside consumeSseStream does NOT
    // delay the client response — the AI SDK runs the callback in
    // parallel with the primary response stream. Awaiting is what
    // eliminates three races vs fire-and-forget:
    //
    //   1. GET /api/chat/[id]/stream race — tab reload between
    //      consumeSseStream start and the DB write would return 204
    //      even though a stream was live, surfacing as "resume didn't
    //      work" for the user.
    //   2. onFinish race — a fast LLM turn could fire onFinish's
    //      setActiveStreamId(null) before consumeSseStream's
    //      setActiveStreamId(streamId) lands, leaving a phantom
    //      streamId pointing at a finished producer.
    //   3. Stop-route race — user clicks stop before the DB write
    //      lands; compare-and-set finds null → can't clear → late
    //      write lands → user sees post-stop bytes on reload.
    //
    // Order matters: createNewResumableStream FIRST (sets the Redis
    // sentinel that resumeExistingStream checks), setActiveStreamId
    // SECOND (exposes the streamId to GET /stream). After both awaits
    // resolve, a GET /stream finds an active sentinel for any
    // streamId it reads from the DB.
    async consumeSseStream({ stream: sseStream }) {
      const streamId = generateId();
      try {
        await streamContext.createNewResumableStream(streamId, () => sseStream);
        await setActiveStreamId({
          chatId,
          activeStreamId: streamId,
          userSuiAddress: walletAddress,
        });

        // [SPEC_AUDRIC_STREAM_RESUME Phase 3 — 2026-05-24] Register the
        // abort handler AFTER the resumable-stream sentinel + DB write
        // both land. Order matters: by the time a stop request can
        // resolve `activeStreamId` from the DB, both the Redis sentinel
        // and this dispatch-table entry exist on this instance. If the
        // stop request lands on a DIFFERENT instance, the publish via
        // Redis still fans out to this instance's pattern subscription
        // (see `lib/stream-abort.ts` for the full pSubscribe model).
        activeAbortCleanup = await subscribeToAbort(streamId, () => {
          console.info(
            `[stream-abort] aborting streamId=${streamId} chatId=${chatId}`
          );
          abortController.abort();
        });

        // [SPEC_AUDRIC_STREAM_RESUME Phase 3 telemetry] Definitive
        // proof that consumeSseStream fires + the streamId is committed.
        // Without this log we can't distinguish "resume route returns
        // 204 because turn completed" from "consumeSseStream never
        // fired so activeStreamId was never set" in production logs.
        console.info(
          `[consumeSseStream] streamId=${streamId} chatId=${chatId}`
        );
      } catch (err) {
        // Either write failing means the user can't resume (degraded
        // to v0.7e baseline behavior); the chat itself still works for
        // the original client. consumeSseStream errors don't propagate
        // to the response per the AI SDK contract.
        console.error(
          `[web-v2 audric-chat] resumable-stream wiring failed for streamId=${streamId} chatId=${chatId} (non-fatal):`,
          redactPII(err)
        );
      }
    },
  });
}

// -----------------------------------------------------------------------------
// DELETE — remove a chat (v0.7e Persistent Chats, S.247)
// -----------------------------------------------------------------------------
//
// The sidebar's per-chat delete dialog fires `DELETE /api/chat?id=X`
// (see `components/chat/sidebar-history.tsx:170`). The handler is
// ownership-gated by the prisma helper's `where: { id, userSuiAddress }`
// filter — a caller that doesn't own the chat sees `deletedCount: 0`
// (treated as not-found rather than 403 so we don't leak chat existence).
// FK cascade deletes the Chat's Messages + Votes in the same transaction.
export async function DELETE(request: Request) {
  const session = await getCurrentUser();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { searchParams } = new URL(request.url);
  const chatIdParam = searchParams.get("id");
  if (!chatIdParam) {
    return new Response(
      JSON.stringify({ error: "Missing required query param: id" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  try {
    const { deleteChatById } = await import("@/lib/audric/chat-persistence");
    const { deletedCount } = await deleteChatById({
      chatId: chatIdParam,
      userSuiAddress: session.user.id,
    });
    if (deletedCount === 0) {
      return new Response(JSON.stringify({ error: "Chat not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return Response.json({ ok: true, deletedCount }, { status: 200 });
  } catch (err) {
    console.error(
      `[audric-chat] DELETE failed chatId=${chatIdParam}:`,
      err instanceof Error ? err.message : String(err)
    );
    return new Response(JSON.stringify({ error: "Failed to delete chat" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// -----------------------------------------------------------------------------
// AI SDK chunk → UIMessageStream part translator (Day 2e — chunks, not events)
// -----------------------------------------------------------------------------
//
// AI SDK v6 tool parts use the type `tool-<toolName>` with state-based
// payloads (`input-available`, `approval-requested`, `output-available`,
// `output-error`). The client renderer (`app/audric-chat/audric-chat-client.tsx`)
// switches on `part.type` + `part.state`; AI Elements `<Tool>` handles
// read tools, `<PermissionCard>` handles approval-requested writes.
//
// AI SDK chunk semantics:
//   - `text-delta` → write `text-delta` part (assistant prose).
//   - `tool-call` → write `tool-input-available`. For confirm-tier tools
//     we attach `providerMetadata.audric = { description, modifiableFields,
//     attemptId }` so the client can render an approval card without
//     hardcoding tool-name → description mapping (the engine's
//     `describeAction` + `TOOL_MODIFIABLE_FIELDS` registry is the SSOT —
//     mirrored here per Phase 3 D-8 PendingAction transport).
//   - `tool-approval-request` → write `tool-approval-request` UI part.
//     The client's `useChat` assembler joins it with the prior
//     `tool-input-available` via `toolCallId`, transitioning the tool UI
//     part state to `'approval-requested'`. The client renders
//     `<PermissionCard>`, which on Approve runs the sponsored-tx flow
//     (prepare → sign → execute) then calls `addToolOutput`; on Deny
//     calls `addToolApprovalResponse({approved: false})`.
//   - `tool-result` → write `tool-output-available` (the tool's
//     successful return value). For confirm-tier writes in web-v2 the
//     server-side execute is never reached (no agent → needsApproval=true);
//     the client populates this part via `addToolOutput` after the
//     sponsored-tx round-trip.
//   - `tool-error` → write `tool-output-error` (the tool threw / guard
//     blocked / preflight rejected).
//   - `tool-output-denied` → fires when the user denies approval via
//     `addToolApprovalResponse({approved: false})`. We translate to a
//     `tool-output-error` UI part with a clear "user denied" message so
//     the LLM's next-step continuation sees a structured rejection it
//     can narrate around.
//   - `error` → write `text-delta` with `[engine error]` prefix so the
//     user sees the failure.
//   - `reasoning-*` → log only (thinking visualization is Phase 4+).
//
//   - `tool-input-start` → write `tool-input-start` UIMessage part so
//     the UI tool-part enters `input-streaming` state. Source chunk
//     field is `id`; UIMessage field is `toolCallId`. [P1.2 / 2026-05-24]
//   - `tool-input-delta` → write `tool-input-delta` UIMessage part so
//     the client's `useChat` assembler accumulates `part.input` as the
//     LLM streams it. Field rename: source `delta` → UIMessage
//     `inputTextDelta`. [P1.2 / 2026-05-24]
//   - `tool-input-end` → intentional no-op (AI SDK v6 has no
//     `tool-input-end` UIMessage part; state transitions when the
//     subsequent `tool-call` chunk writes `tool-input-available`).
//
// Chunks NOT translated (silently ignored — collector consumes them):
//   - `start`, `start-step`, `finish-step` (lifecycle markers we wrap
//     our own UIMessageStream framing around).
//   - `finish` (terminal — `turnCompleted` flag is set in the loop).
//   - `text-start`/`text-end` (chunk-level framing the UIMessage
//     assembler doesn't need at Day 2e granularity).
//   - `source`/`file`/`raw`/`abort` — wired through in later phases as
//     specific features land.

// -----------------------------------------------------------------------------
// [Phase 5e — 2026-05-19] BundleBuffer — step-boundary bundle marker
// -----------------------------------------------------------------------------
//
// When the LLM emits ≥2 confirm-tier bundleable writes in a single
// assistant step, AI SDK fires N separate `tool-call` + `tool-approval-
// request` chunks. Without intervention, the client renders N
// PermissionCards → N signatures → no atomicity.
//
// This buffer captures those chunks between `start-step` and
// `finish-step`. At `finish-step` it decides:
//
//   - If ≥2 buffered confirm-tier writes ARE all bundleable: call the
//     canonical `composeBundleFromToolResults` helper (same one v0.7a
//     orchestration + audric fast-path use) to assemble a `PendingAction`
//     with `steps[]`, emit a `data-audric-bundle` marker carrying the
//     per-step renderer payload, THEN flush the original chunks
//     individually so AI SDK's part state machine sees each `tool-call`
//     and `tool-approval-request` independently. The client folds the
//     marked toolCallIds into one bundle PermissionCard.
//
//   - If <2 confirm-tier OR any non-bundleable: flush each buffered
//     chunk individually (single-write paths, unchanged behaviour).
//
// Other chunks (text-delta, reasoning, read tool-call/tool-result)
// pass through directly without buffering — text streaming is
// preserved; only the confirm-tier writes get held back briefly until
// the step boundary.
//
// The helper requires `tool.flags?.bundleable === true` on each tool
// to pass the defensive check; we apply `applyToolFlags(WRITE_TOOLS)`
// once and cache the result. This is the same flag set
// `getDefaultTools()` produces.
const FLAGGED_WRITE_TOOLS: Tool[] = applyToolFlags(WRITE_TOOLS);

interface BufferedToolCall {
  /**
   * The original AI SDK chunk — replayed via `translateChunk` after
   * marker emission so the part state machine sees each call.
   */
  chunk: TextStreamPart<ToolSet>;
  input: Record<string, unknown>;
  toolCallId: string;
  toolName: string;
}

interface BufferedApprovalRequest {
  approvalId: string;
  chunk: TextStreamPart<ToolSet>;
  toolCallId: string;
}

class BundleBuffer {
  private toolCalls: BufferedToolCall[] = [];
  private approvalRequests: BufferedApprovalRequest[] = [];

  /**
   * Drop all buffered state. Called at every `start-step` so a
   * multi-step turn (e.g. resume after HITL) starts fresh per step.
   */
  reset(): void {
    this.toolCalls = [];
    this.approvalRequests = [];
  }

  /**
   * Try to capture `chunk` into the per-step buffer. Returns `true`
   * when buffered (caller skips immediate translation); `false`
   * otherwise (caller translates normally).
   *
   * We buffer ONLY:
   *   - confirm-tier `tool-call` chunks (read tools + auto writes
   *     pass through immediately so streaming UX stays snappy)
   *   - `tool-approval-request` chunks (these only fire for
   *     confirm-tier tools by construction)
   */
  tryBufferChunk(chunk: TextStreamPart<ToolSet>): boolean {
    if (chunk.type === "tool-call") {
      const policy = safeToolPolicy(chunk.toolName);
      if (policy?.permissionLevel === "confirm") {
        this.toolCalls.push({
          toolName: chunk.toolName,
          toolCallId: chunk.toolCallId,
          input: (chunk.input ?? {}) as Record<string, unknown>,
          chunk,
        });
        return true;
      }
      return false;
    }
    if (chunk.type === "tool-approval-request") {
      this.approvalRequests.push({
        approvalId: chunk.approvalId,
        toolCallId: chunk.toolCall.toolCallId,
        chunk,
      });
      return true;
    }
    return false;
  }

  /**
   * Flush at `finish-step`. Decides bundle vs single, emits the
   * bundle marker if applicable, then replays each buffered chunk
   * via `translateChunk` so the part state machine stays consistent
   * regardless of bundling.
   */
  flush(writer: UIMessageStreamWriter, messageId: string): void {
    if (this.toolCalls.length === 0) {
      // Nothing to flush. Approval requests can't arrive without a
      // prior tool-call, so this branch covers turns with no writes.
      this.reset();
      return;
    }

    // [P7.1 / 2026-05-24] Defensive cap enforcement (Option A).
    //
    // `MAX_BUNDLE_OPS` (currently 4) was set by historical Phase 0
    // wallet-race correctness bugs at cap=5 (see
    // `packages/engine/src/compose-bundle.ts` lines 52-95). It's
    // soft-enforced via the system prompt + hard-enforced at the
    // Zod schema in `app/api/transactions/prepare/route.ts`
    // (`.max(4)` on bundle steps). Pre-fix, an LLM emission of 5+
    // bundleable writes would surface a 5-step BundlePermissionCard,
    // the user would tap Approve, and the prepare route would return
    // 400 Invalid request body — opaque failure.
    //
    // Fix: when N > MAX_BUNDLE_OPS, only include the first
    // MAX_BUNDLE_OPS legs in the bundle. For overrun legs (5+),
    // emit `tool-input-available` + `tool-output-error` directly,
    // SKIPPING their `tool-approval-request` chunks so no user
    // gesture is required. The LLM sees a structured rejection on
    // resume and re-plans (e.g., issues the remaining writes as a
    // second bundle).
    //
    // Option B (post-P3.2): route the overrun through
    // `experimental_repairToolCall` so the LLM repairs the call BEFORE
    // any per-tool state exists. Cleaner recovery — swap here once
    // P3.2 lands.
    let overrunCalls: BufferedToolCall[] = [];
    if (this.toolCalls.length > MAX_BUNDLE_OPS) {
      overrunCalls = this.toolCalls.slice(MAX_BUNDLE_OPS);
      this.toolCalls = this.toolCalls.slice(0, MAX_BUNDLE_OPS);
      // Drop approval requests that belong to overrun legs — the
      // user never sees them; the LLM gets a synthetic tool-error
      // instead.
      const keptToolCallIds = new Set(this.toolCalls.map((c) => c.toolCallId));
      this.approvalRequests = this.approvalRequests.filter((a) =>
        keptToolCallIds.has(a.toolCallId)
      );
      console.warn(
        "[audric-chat] Bundle overrun: LLM emitted",
        overrunCalls.length + MAX_BUNDLE_OPS,
        "bundleable writes;",
        MAX_BUNDLE_OPS,
        "included in bundle, rest rejected with structured tool-error. Overrun tools:",
        overrunCalls.map((c) => c.toolName).join(", ")
      );
    }

    const N = this.toolCalls.length;

    // Decide bundle eligibility. Three gates:
    //   1. N ≥ 2 confirm-tier writes
    //   2. Every write is bundleable (engine `tool-flags.ts`)
    //   3. Every write has a matching approval request (defensive —
    //      a confirm-tier tool MUST yield an approval request)
    const allBundleable = this.toolCalls.every((c) =>
      isBundleableTool(c.toolName)
    );
    const approvalsByToolCallId = new Map(
      this.approvalRequests.map((a) => [a.toolCallId, a.approvalId])
    );
    const everyHasApproval = this.toolCalls.every((c) =>
      approvalsByToolCallId.has(c.toolCallId)
    );
    const isBundle = N >= 2 && allBundleable && everyHasApproval;

    if (isBundle) {
      try {
        const marker = buildBundleMarker(this.toolCalls, approvalsByToolCallId);
        writer.write({
          type: BUNDLE_MARKER_TYPE,
          // AI SDK requires data parts carry a `data` field. The marker
          // shape is `AudricBundleMarker` (typed at the top of this
          // module + parsed at the client).
          data: marker,
        });
      } catch (err) {
        // The helper throws on any validation failure (unknown tool,
        // non-bundleable, malformed input). Log + fall through to
        // individual rendering — the user sees N PermissionCards
        // instead of one bundle, which is the same UX as pre-Phase-5e.
        console.warn(
          "[audric-chat] Bundle marker emission failed (falling back to N individual cards):",
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    // Replay buffered chunks in original order via translateChunk.
    // The state machine sees each part — only the client render
    // layer hides claimed parts via the marker's toolCallIds set.
    for (const c of this.toolCalls) {
      translateChunk(c.chunk, writer, messageId);
    }
    for (const a of this.approvalRequests) {
      translateChunk(a.chunk, writer, messageId);
    }

    // [P7.1] Emit synthetic input-available + output-error for
    // overrun legs. Order is important: the input-available MUST be
    // written before the output-error so AI SDK's part state machine
    // can transition `nothing → input-available → output-error`.
    // Skipping `tool-approval-request` keeps these parts out of the
    // user-gesture path (terminal error state, no client action).
    for (const c of overrunCalls) {
      translateChunk(c.chunk, writer, messageId);
      writer.write({
        type: "tool-output-error",
        toolCallId: c.toolCallId,
        errorText: `Bundle exceeds capacity (max ${MAX_BUNDLE_OPS} ops per bundle). This leg was not included in the atomic Payment Intent — please retry it as a separate bundle.`,
      });
    }

    this.reset();
  }
}

/**
 * [Phase 5e] Build the `data-audric-bundle` marker payload from the
 * buffered tool-calls + approval-requests. Calls the canonical
 * `composeBundleFromToolResults` helper to derive each step's
 * `description` + `modifiableFields` (same path v0.7a orchestration
 * + audric fast-path-bundle use, no drift on field semantics).
 *
 * Throws if the helper rejects (unknown tool, non-bundleable). Caller
 * catches + falls back to individual rendering.
 */
function buildBundleMarker(
  buffered: BufferedToolCall[],
  approvalsByToolCallId: Map<string, string>
): AudricBundleMarker {
  const pendingWrites: PendingToolCall[] = buffered.map((c) => {
    const tool = FLAGGED_WRITE_TOOLS.find((t) => t.name === c.toolName);
    if (!tool) {
      throw new Error(
        `Unknown tool '${c.toolName}' in bundle marker assembly (not in WRITE_TOOLS)`
      );
    }
    return {
      name: c.toolName,
      input: c.input,
      id: c.toolCallId,
      tool,
    };
  });

  const composed: PendingAction = composeBundleFromToolResults({
    pendingWrites,
    tools: FLAGGED_WRITE_TOOLS,
    // [Phase 5e MVP] Read-result tracking + swap-quote matching are
    // Phase 5d-deferred features (PermissionCard's quote-refresh +
    // guard-injection chrome aren't wired through `toolMetadata` in
    // v0.7c yet). Empty inputs here mean: no `canRegenerate`, no
    // `regenerateInput`, no per-step `cetusRoute`. The bundle still
    // composes correctly + renders correctly; the per-step swap
    // appender falls back to fresh `findSwapRoute()` at execute time
    // (+150-200ms per swap leg vs the v1 fast path — acceptable for
    // MVP and recoverable in Phase 6+).
    readResults: [],
    swapQuoteReads: undefined,
    assistantContent: [],
    completedResults: [],
    turnIndex: 0,
  });

  // Compose-bundle ALWAYS populates `steps[]` for N≥2 (its first line
  // throws otherwise). Defensive narrowing keeps TS strict.
  if (!composed.steps || composed.steps.length === 0) {
    throw new Error(
      "composeBundleFromToolResults returned no steps[] — should be unreachable"
    );
  }

  // Map composed steps → marker payload. Each marker step carries the
  // AI SDK identifiers (toolCallId, approvalId from the buffered
  // tool-approval-request) instead of compose-bundle's stamped UUIDs.
  // The compose helper's `step.attemptId` is the harness-spec resume id;
  // we don't surface it on the marker (client uses AI SDK's approvalId
  // for `addToolApprovalResponse` + toolCallId for `addToolOutput`).
  const steps: AudricBundleMarker["steps"] = composed.steps.map((s) => {
    const approvalId = approvalsByToolCallId.get(s.toolUseId);
    if (!approvalId) {
      // Should be unreachable — we gated on `everyHasApproval` before
      // calling this helper. Throw to surface any logic regression.
      throw new Error(
        `Bundle step ${s.toolUseId} has no matching approval request`
      );
    }
    return {
      toolCallId: s.toolUseId,
      approvalId,
      toolName: s.toolName,
      input: (s.input ?? {}) as Record<string, unknown>,
      description: s.description,
      modifiableFields: (s.modifiableFields ?? []).map((f) => ({
        name: f.name,
        kind: f.kind,
        ...(f.asset ? { asset: f.asset } : {}),
      })),
    };
  });

  return { steps };
}

function translateChunk(
  chunk: TextStreamPart<ToolSet>,
  writer: UIMessageStreamWriter,
  messageId: string
): void {
  switch (chunk.type) {
    case "text-delta": {
      if (typeof chunk.text === "string" && chunk.text.length > 0) {
        writer.write({ type: "text-delta", id: messageId, delta: chunk.text });
      }
      break;
    }
    case "tool-call": {
      // [Phase 3 Day 3a] Attach audric metadata for confirm-tier writes
      // via AI SDK's `toolMetadata?: JSONObject` field (dedicated tool-
      // call metadata carrier; `providerMetadata` is reserved for
      // upstream provider injections like Anthropic cache control).
      // The client (`audric-chat-client.tsx`) reads `part.toolMetadata`
      // when state transitions to `'approval-requested'` and renders
      // `<PermissionCard>` without hardcoding the tool→description map.
      // Read-only tools (TOOL_POLICY.permissionLevel === 'auto') don't
      // get metadata — they render via AI Elements `<Tool>` without an
      // approval card.
      //
      // The metadata's `attemptId` field carries the toolCallId as a
      // UI-only client-side hint. The PERSISTED correlation id (used
      // for cross-turn `updateMany` on `TurnMetrics.attemptId`) is the
      // AI SDK `approvalId` from the subsequent `tool-approval-request`
      // chunk — `approvalId` is a freshly-generated UUID, NOT equal to
      // `toolCallId`. Per harness Spec §Item 3a, `attemptId` ===
      // `approvalId` by construction in the v0.7c rewrite; the
      // telemetry collector at `lib/audric/telemetry-integration.ts`
      // handles the persistence side of that contract.
      const policy = safeToolPolicy(chunk.toolName);
      const isConfirmTier = policy?.permissionLevel === "confirm";
      const audricMetadata = isConfirmTier
        ? buildAudricToolMetadata(chunk.toolName, chunk.input, chunk.toolCallId)
        : undefined;
      writer.write({
        type: "tool-input-available",
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        input: chunk.input,
        // `toolMetadata` is typed as `JSONObject` (= `Record<string,
        // JSONValue | undefined>`) imported from `@ai-sdk/provider`.
        // The audric shape IS structurally a JSONObject (strings +
        // arrays of {string,string,string?} objects) but TS can't
        // infer the index signature from a typed-property record
        // literal — the inline-import cast below is the standard AI
        // SDK pattern for adapter-injected metadata. No new runtime
        // dep: `@ai-sdk/provider` is a transitive dep of `ai`.
        ...(audricMetadata
          ? {
              toolMetadata:
                audricMetadata as unknown as import("@ai-sdk/provider").JSONObject,
            }
          : {}),
      });
      break;
    }
    case "tool-approval-request": {
      // [Phase 3 Day 3a / D-8] AI SDK's native HITL handshake. The
      // chunk's `approvalId` is the addToolApprovalResponse correlation
      // id; the chunk's `toolCall.toolCallId` matches the prior
      // `tool-input-available`'s id so `useChat` joins them and
      // transitions the tool part to state='approval-requested'.
      writer.write({
        type: "tool-approval-request",
        approvalId: chunk.approvalId,
        toolCallId: chunk.toolCall.toolCallId,
      });
      break;
    }
    case "tool-result": {
      // [Group E INCREMENT-side TODO — 2026-05-21 / S.214 follow-on]
      // When v0.7d Phase 1+ activates auto-tier writes (today every
      // write is confirm-tier; user always taps), call
      // `incrementSessionSpend(sessionId, usdValue)` here for tool
      // calls that were resolved to auto-tier. Apps/web's engine
      // factory wires this via `EngineConfig.onAutoExecuted`; web-v2
      // uses `Experimental_Agent` directly so the equivalent post-
      // write hook needs to land here. Inputs needed: (a) the
      // resolved tier from `resolvePermissionTier` for `chunk.toolName`
      // + the call's input — we'd need to thread that state from
      // `needsApproval` callback OR re-resolve it here against the
      // turn's `ToolContext.priceCache`. (b) the USD value from
      // `resolveUsdValue` against the same priceCache.
      //
      // Deferring because: web-v2 has zero auto-tier writes in
      // production today, so the increment never fires. The READ side
      // (`getSessionSpend` at chat-start, ~L680) feeds the daily-cap
      // downgrade rule and is what actually unblocks the safety net
      // when auto-tier flips on.
      writer.write({
        type: "tool-output-available",
        toolCallId: chunk.toolCallId,
        output: chunk.output,
      });
      break;
    }
    case "tool-error": {
      writer.write({
        type: "tool-output-error",
        toolCallId: chunk.toolCallId,
        errorText: safeErrorText(chunk.error),
      });
      break;
    }
    case "tool-output-denied": {
      // [Phase 3 Day 3a] User denied approval client-side via
      // `addToolApprovalResponse({approved: false})`. AI SDK surfaces
      // this as a `tool-output-denied` chunk; we map it to a structured
      // error so the LLM sees a clean rejection in its tool-result
      // slot and can narrate around it ("OK, I won't proceed with the
      // save — anything else I can help with?"). Without translation
      // the LLM would see no tool-result for the call → next-step
      // confusion.
      writer.write({
        type: "tool-output-error",
        toolCallId: chunk.toolCallId,
        errorText: "User denied the action.",
      });
      break;
    }
    case "error": {
      // [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY C.3 / S.198 — 2026-05-20]
      // Sanitize + redact the engine-emitted error before writing to
      // the wire. Without this, raw Anthropic JSON / Prisma stack
      // traces / Sui addresses can land in the user's chat text.
      // `safeErrorText` runs the full sanitize → redact pipeline.
      console.error(
        "[audric-chat] engine error chunk (raw, server-only):",
        redactPII(chunk.error)
      );
      writer.write({
        type: "text-delta",
        id: messageId,
        delta: `\n\n[engine error] ${safeErrorText(chunk.error)}`,
      });
      break;
    }
    case "reasoning-start": {
      // [S.210 — 2026-05-21] Forward reasoning lifecycle to the wire.
      // Pre-S.210 the Day 2c G6 path logged reasoning chunks server-side
      // and STOPPED — the comment claimed "Rendering thinking to the UI
      // is Phase 4+ scope". Phase 6.5 wired the `<Reasoning>` accordion
      // in `audric-chat-client.tsx` (S.207 P4) but no one re-checked
      // this translateChunk gate, so Claude's extended-thinking chunks
      // landed in stdout instead of the UI.
      //
      // The UIMessageStreamWriter accepts the same `reasoning-start /
      // reasoning-delta / reasoning-end` part types AI SDK v6 emits
      // from `streamText` (see `ai/dist/index.d.ts` L2089-2100). The
      // client assembler folds the three streaming parts into a single
      // `reasoning` UIMessagePart with `text` + `state`, which is what
      // `<Reasoning>` reads.
      //
      // [S.212 — 2026-05-21] Forward `providerMetadata` through —
      // Anthropic doesn't currently emit it on `reasoning-start`, but
      // future-proof against other providers / extensions.
      writer.write({
        type: "reasoning-start",
        id: chunk.id,
        ...(chunk.providerMetadata
          ? { providerMetadata: chunk.providerMetadata }
          : {}),
      });
      break;
    }
    case "reasoning-delta": {
      // [S.210 — 2026-05-21] Forward reasoning text deltas to the wire
      // (previously log-only). Each delta increments the trailing
      // `reasoning` part's text by `chunk.text`. The client's <Reasoning>
      // collapsible auto-opens during streaming and auto-closes 1s after
      // the matching `reasoning-end` lands.
      //
      // [S.212 — 2026-05-21] CRITICAL: Anthropic emits TWO shapes of
      // `reasoning-delta` per the @ai-sdk/anthropic stream parser
      // (`anthropic-messages-language-model.ts` L2102-2128):
      //
      //   (a) `thinking_delta`   → { text: "<thinking text>", id }
      //   (b) `signature_delta`  → { text: "", id, providerMetadata: {
      //                              anthropic: { signature: "<sig>" } } }
      //
      // The signature-carrying chunk has EMPTY text. Pre-S.212 we
      // suppressed empty-text chunks "to avoid spurious wire frames"
      // — which silently dropped the signature, which broke multi-step
      // round-trips back to Anthropic ("unsupported reasoning metadata"
      // warning observed in production logs 2026-05-21 06:33 UTC, twice
      // per Tier 2 turn). Without the signature, prior thinking blocks
      // can't be re-sent to Anthropic on continue-turns → multi-step
      // reasoning quality silently degrades.
      //
      // Forward both shapes; drop only when BOTH text is empty AND no
      // providerMetadata is attached.
      const hasText = typeof chunk.text === "string" && chunk.text.length > 0;
      const hasMetadata = chunk.providerMetadata != null;
      if (hasText || hasMetadata) {
        writer.write({
          type: "reasoning-delta",
          id: chunk.id,
          delta: chunk.text ?? "",
          ...(hasMetadata ? { providerMetadata: chunk.providerMetadata } : {}),
        });
      }
      break;
    }
    case "reasoning-end": {
      // [S.210 — 2026-05-21] Forward reasoning end to the wire. Closes
      // the streaming reasoning part on the client — flips `state` to
      // 'done' so the <Reasoning> accordion knows to stop the shimmer
      // and start the auto-close countdown.
      //
      // [S.212 — 2026-05-21] Forward `providerMetadata` through. Even
      // when reasoning-end carries no Anthropic-specific fields today,
      // preserving the shape keeps future provider extensions wire-safe.
      writer.write({
        type: "reasoning-end",
        id: chunk.id,
        ...(chunk.providerMetadata
          ? { providerMetadata: chunk.providerMetadata }
          : {}),
      });
      break;
    }
    case "tool-input-start": {
      // [P1.2 / 2026-05-24] Forward `tool-input-start` so the UIMessage
      // tool part enters state='input-streaming'. Without this the
      // client only sees the eventual `tool-input-available` (state
      // jumps directly to 'input-available'), which means
      // `ToolResultRouter`'s input-streaming branch was unreachable
      // for confirm-tier writes — partial-input deltas were dropped.
      //
      // The source chunk field is `id`; the UIMessage part field is
      // `toolCallId`. Optional metadata fields pass through unchanged.
      writer.write({
        type: "tool-input-start",
        toolCallId: chunk.id,
        toolName: chunk.toolName,
        ...(chunk.providerExecuted === undefined
          ? {}
          : { providerExecuted: chunk.providerExecuted }),
        ...(chunk.providerMetadata === undefined
          ? {}
          : { providerMetadata: chunk.providerMetadata }),
        ...(chunk.dynamic === undefined ? {} : { dynamic: chunk.dynamic }),
        ...(chunk.title === undefined ? {} : { title: chunk.title }),
      });
      break;
    }
    case "tool-input-delta": {
      // [P1.2 / 2026-05-24] Forward each partial-input fragment so the
      // client's `useChat` assembler can accumulate `part.input` as
      // the LLM streams it. Field rename: source `delta` → UIMessage
      // `inputTextDelta`.
      writer.write({
        type: "tool-input-delta",
        toolCallId: chunk.id,
        inputTextDelta: chunk.delta,
      });
      break;
    }
    case "tool-input-end": {
      // [P1.2 / 2026-05-24] Intentional no-op. AI SDK v6's UIMessage
      // chunk format has no `tool-input-end` part — state transitions
      // from 'input-streaming' to 'input-available' when the
      // subsequent `tool-call` chunk writes `tool-input-available`.
      // Listed explicitly here (instead of falling into default)
      // to make the lifecycle intent visible to future readers.
      break;
    }
    default:
      // Other chunks (`start`, `start-step`, `finish-step`, `finish`,
      // `text-start`, `text-end`, `source`, `file`, `raw`, `abort`)
      // are not translated.
      break;
  }
}

// -----------------------------------------------------------------------------
// Audric metadata builders (Phase 3 Day 3a)
// -----------------------------------------------------------------------------
//
// Mirror of the engine's `describeAction` + `TOOL_MODIFIABLE_FIELDS`
// registry, scoped to the tools wired into web-v2 today. We could
// import `describeAction` directly, but it's currently NOT exported
// from `@t2000/engine`'s barrel (private to the legacy v1 `pending_action`
// emit path). Mirroring inline here keeps Phase 3 a host-only change —
// the engine release is unchanged.
//
// Phase 4 (G7) extends this for the remaining 11 writes following the
// same pattern. If the registry grows past ~6 entries, promote
// `describeAction` to a public engine export instead.

// The client (`audric-chat-client.tsx`) parses `part.toolMetadata` with
// a small Zod schema before reading fields. AI SDK's `JSONObject` is
// `{ [key: string]: JSONValue | undefined }`; the shape below structurally
// matches but is declared with a permissive index signature so values
// constructed inline don't need an `as JSONObject` cast at the writer
// callsite.
type AudricToolMetadata = {
  description: string;
  modifiableFields: Array<{
    name: string;
    kind: string;
    asset?: string;
  }>;
  attemptId: string;
};

function buildAudricToolMetadata(
  toolName: string,
  input: unknown,
  toolCallId: string
): AudricToolMetadata | undefined {
  const description = describeAudricAction(toolName, input);
  if (!description) {
    return;
  }
  const fields = getModifiableFields(toolName) ?? [];
  // Strip `readonly` + spread to a plain object so AI SDK's structural
  // `JSONObject` check passes (readonly arrays don't satisfy `JSONValue`).
  const modifiableFields = fields.map((f) => ({
    name: f.name,
    kind: f.kind,
    ...(f.asset ? { asset: f.asset } : {}),
  }));
  return {
    description,
    modifiableFields,
    attemptId: toolCallId,
  };
}

function describeAudricAction(
  toolName: string,
  input: unknown
): string | undefined {
  const obj = (input ?? {}) as Record<string, unknown>;
  switch (toolName) {
    case "save_deposit": {
      // Mirrors `describe-action.ts` L21-28 (engine). Defaults to USDC
      // to match the SDK's `assertAllowedAsset('save', ...)` default.
      const amount = obj.amount;
      const asset = (obj.asset as string | undefined) ?? "USDC";
      return `Save ${amount} ${asset} into lending`;
    }
    case "withdraw": {
      const amount = obj.amount;
      const asset = (obj.asset as string | undefined) ?? "USDC";
      return `Withdraw ${amount} ${asset} from lending`;
    }
    case "borrow": {
      const amount = obj.amount;
      const asset = (obj.asset as string | undefined) ?? "USDC";
      return `Borrow ${amount} ${asset} against your savings`;
    }
    case "repay_debt": {
      const amount = obj.amount;
      const asset = (obj.asset as string | undefined) ?? "USDC";
      return `Repay ${amount} ${asset} of debt`;
    }
    case "send_transfer": {
      const amount = obj.amount;
      const asset = (obj.asset as string | undefined) ?? "USDC";
      const to = obj.to as string | undefined;
      const shortTo = to ? `${to.slice(0, 6)}…${to.slice(-4)}` : "recipient";
      return `Send ${amount} ${asset} to ${shortTo}`;
    }
    case "swap_execute": {
      const amount = obj.amount;
      const from = (obj.from as string | undefined) ?? "?";
      const to = (obj.to as string | undefined) ?? "?";
      return `Swap ${amount} ${from} → ${to}`;
    }
    case "claim_rewards":
      return "Claim NAVI rewards";
    case "harvest_rewards":
      return "Harvest rewards (claim → swap to USDC → save)";
    // [S.277] volo_stake / volo_unstake narration cases removed —
    // engine tools cut in 2.18.0 ("Earns Its Keep" audit).
    default:
      return;
  }
}

function safeToolPolicy(
  toolName: string
): { permissionLevel: string } | undefined {
  try {
    return getToolPolicy(toolName);
  } catch {
    // `getToolPolicy` throws for unknown tools — that's expected for
    // gateway-managed tools like `perplexity_search` (not in TOOL_POLICY).
    // Treat as auto (no approval card).
    return;
  }
}

/**
 * [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY C.3 / S.198 — 2026-05-20]
 * Extract a user-safe string from an arbitrary error value for emission
 * on the wire. Pipeline:
 *
 *   1. Coerce to string (Error.message / String() / JSON.stringify).
 *   2. `redactAddressesInText` — strip 32-byte Sui addresses (the only
 *      PII that routinely shows up in tool/SDK error bodies; tx digests
 *      are public on-chain and stay readable).
 *   3. `sanitizeStreamErrorMessage` — map known provider error shapes
 *      (Anthropic overloaded/rate-limit, Prisma errors, raw JSON
 *      payloads, network failures) to clean user-facing strings.
 *
 * The RAW error should ALWAYS be logged server-side via
 * `console.error('...', redactPII(err))` before reaching this function
 * — this function is the wire sanitizer of last resort, not the
 * primary observability path.
 */
function safeErrorText(error: unknown): string {
  let raw: string;
  if (error instanceof Error) {
    raw = error.message;
  } else if (typeof error === "string") {
    raw = error;
  } else {
    try {
      raw = JSON.stringify(error) ?? "Tool error";
    } catch {
      raw = "Tool error";
    }
  }
  return sanitizeStreamErrorMessage(redactAddressesInText(raw));
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * [v0.7c Phase 6 prep] Extract the last user-authored text from the
 * normalized UIMessage history. Used by the intent-dispatcher to
 * decide whether to pre-fire any read tools on this turn.
 *
 * Returns "" when:
 *   - The last message isn't a user turn (HITL resume turn — tail is
 *     an assistant message with tool-output-available parts; we don't
 *     re-dispatch on resume).
 *   - The user's parts contain no text (e.g. file-only message, unlikely
 *     in audric today but defensive).
 *
 * Mirrors the legacy `trimmedMessage` extraction pattern in
 * `audric/apps/web/app/api/engine/chat/route.ts` — empty string falls
 * through to `classifyReadIntents("")` which returns `[]` (zero cost,
 * zero side effects).
 */
/**
 * [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY C.2 / S.198 — 2026-05-20]
 * Count successful confirm-tier writes across the entire message
 * history. Drives `classifyEffort`'s `sessionWriteCount` arg — the
 * legacy `apps/web` path tracked this via session store; web-v2 has no
 * cross-turn session-write counter yet, so we approximate by scanning
 * the request body's message history for completed write tool parts.
 *
 * Same "is this a write?" detection as `extractWritesNeedingRefresh`
 * (POST_WRITE_REFRESH_MAP membership) — keeps the two paths
 * consistent. Denied / failed writes (`output-error` or
 * `approval.approved !== true`) are excluded.
 */
function countWriteToolsInHistory(messages: unknown[]): number {
  if (!Array.isArray(messages)) {
    return 0;
  }
  const writeToolNames = new Set(WRITE_TOOLS.map((t) => t.name));
  let count = 0;
  for (const m of messages) {
    const msg = m as { parts?: unknown[]; role?: string } | undefined;
    if (msg?.role !== "assistant" || !Array.isArray(msg.parts)) {
      continue;
    }
    for (const rawPart of msg.parts) {
      const part = rawPart as
        | {
            approval?: { approved?: boolean };
            state?: string;
            type?: string;
          }
        | undefined;
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
      if (!writeToolNames.has(toolName)) {
        continue;
      }
      if (part.approval && part.approval.approved !== true) {
        continue;
      }
      count++;
    }
  }
  return count;
}

/**
 * [Smoke 2026-05-22 V3 diagnostic] Summarise UIMessage tool-call states
 * for the "ghost permission card after refresh" investigation.
 *
 * The structural log (`llm-message-structure-v2`) is built off
 * `aiSdkMessages` — the OUTPUT of `convertToModelMessages`. By the time
 * we get a ModelMessage, tool-call state has been COLLAPSED into
 * `tool-call` (with input) + `tool-result` (with output) blocks, losing
 * the UIMessage `state` field that drives the client render
 * (`approval-requested` → card, `output-available` → receipt).
 *
 * This helper formats UIMessage[] directly so we can SEE the per-part
 * state at every save site:
 *
 *   [1] assistant: text|reasoning|tool-call(balance,state=output-available,output=Y)|tool-call(save,state=output-available,output=Y,approval=Y)
 *
 * Use at POST entry to fingerprint what the client sent, and at
 * onFinish to fingerprint what we're about to persist. A divergence
 * between those two pinpoints whether AI SDK's stream-state merge is
 * clobbering the client's post-approval state.
 */
function summariseToolStates(
  messages: ReadonlyArray<{
    id?: string;
    role: string;
    parts?: readonly unknown[];
  }>
): string {
  const trunc = (s: string) => s.slice(0, 8);
  return messages
    .map((msg, idx) => {
      const parts = Array.isArray(msg.parts) ? msg.parts : [];
      const partSummaries = parts.map((rawPart) => {
        const part = rawPart as
          | {
              type?: string;
              toolCallId?: string;
              state?: string;
              output?: unknown;
              approval?: { id?: string; approved?: boolean };
            }
          | undefined;
        if (!part || typeof part.type !== "string") {
          return "?";
        }
        if (
          part.type.startsWith("tool-") &&
          part.type !== "tool-approval-request" &&
          part.type !== "tool-approval-response"
        ) {
          const tool = part.type.slice("tool-".length);
          const callId =
            typeof part.toolCallId === "string" ? trunc(part.toolCallId) : "?";
          const state = part.state ?? "?";
          const hasOut = part.output === undefined ? "N" : "Y";
          const approval =
            part.approval === undefined
              ? ""
              : `,approval=${part.approval.approved === true ? "Y" : part.approval.approved === false ? "N" : "P"}`;
          return `${part.type}(${tool},id=${callId},state=${state},output=${hasOut}${approval})`;
        }
        return part.type;
      });
      const id = msg.id ? trunc(msg.id) : "noid";
      return `[${idx}] ${msg.role}(${id}): ${partSummaries.join("|") || "(empty)"}`;
    })
    .join(" || ");
}

function extractLatestUserText(normalized: Omit<UIMessage, "id">[]): string {
  if (normalized.length === 0) {
    return "";
  }
  const last = normalized.at(-1);
  if (!last || last.role !== "user") {
    return "";
  }
  const textPart = [...last.parts]
    .reverse()
    .find(
      (p): p is { type: "text"; text: string } =>
        (p as { type?: string }).type === "text" &&
        typeof (p as { text?: unknown }).text === "string"
    );
  return textPart ? textPart.text.trim() : "";
}

/**
 * Coarse token estimate for seeding `TurnMetrics.contextTokensStart`.
 * Not load-bearing — used only for warehouse parity with audric/web's
 * `harnessShape.contextTokensStart` field. AI SDK doesn't expose a
 * tokenizer publicly; chars-divided-by-4 matches the engine's prior
 * estimateTokens heuristic at packages/engine/src/context.ts.
 */
function estimateContextTokens(
  messages: Array<
    | { role: string; content: string }
    | { role: string; parts: Array<{ type: string; text?: string }> }
  >
): number {
  const totalChars = messages.reduce((acc, m) => {
    if ("content" in m) {
      return acc + m.content.length;
    }
    const partChars = m.parts.reduce((sum, p) => {
      if (p.type === "text" && typeof p.text === "string") {
        return sum + p.text.length;
      }
      return sum;
    }, 0);
    return acc + partChars;
  }, 0);
  return Math.ceil(totalChars / CHARS_PER_TOKEN_ESTIMATE);
}

/**
 * [Phase 3 outcome-update slice] Update Turn 1's TurnMetrics row with
 * the resolved HITL outcome from the resume turn. Mirrors the legacy
 * `/api/engine/resume` route's pattern at audric/apps/web/app/api/
 * engine/resume/route.ts (L120-150) — fire-and-forget, idempotent.
 *
 * The `where: { attemptId }` filter targets the SINGLE Turn 1 row
 * that stamped this `attemptId` when the engine emitted
 * `tool-approval-request`. Subsequent resume turns may re-run the
 * same updateMany; Prisma treats it as a noop overwrite.
 */
function persistResumeOutcome(outcome: ResumeOutcome): void {
  // [Smoke 2026-05-22 V3 fix] Wrap with `waitUntil` — same teardown
  // race as the saveMessages / TurnMetrics writes in onFinish. Without
  // it, resume-outcome rows in NeonDB intermittently keep their
  // pending=null defaults instead of confirmed / denied.
  waitUntil(
    prisma.turnMetrics
      .updateMany({
        where: { attemptId: outcome.attemptId },
        data: {
          pendingActionOutcome: outcome.outcome,
          // Only confirmed outcomes carry a populated duration. The
          // helper returns `null` for denied / failed; passing null to
          // Prisma writes SQL NULL, matching the legacy resume route's
          // contract (denied + failed rows show NULL ms in NeonDB).
          writeToolDurationMs: outcome.writeToolDurationMs,
        },
      })
      .catch((err: unknown) => {
        // [Phase 5.5 / D-17] Scrub embedded addresses from Prisma error
        // payloads. `attemptId.slice(0, 8)` is already pre-truncated;
        // `redactPII` handles any wallet address Prisma echoes back in
        // its `meta.target` or constraint violation envelope.
        console.error(
          `[web-v2 audric-chat] resume-outcome updateMany failed (non-fatal) attemptId=${outcome.attemptId.slice(0, 8)}:`,
          redactPII(err)
        );
      })
  );
}
