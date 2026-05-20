/**
 * Audric chat route — Agent-backed POST /api/audric-chat.
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
 * **Why a new path (`/api/audric-chat`) instead of overwriting
 * `/api/chat`:** the template's `/api/chat` is wired into the existing
 * chat UI (`useChat({ api: '/api/chat' })`) AND the Day 1d baseline
 * smoke; rewiring to this route happens incrementally per phase.
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
 *  - StreamCheckpointStore / resume-on-reload (Day 2b never wired)
 *  - `pending_action` EngineEvent emission (replaced by AI SDK's native
 *    `needsApproval` round-trip via experimental_providerMetadata per D-8;
 *    Phase 3 wires the first write tool through this path — SPEC 40 Batch 3
 *    is the canonical migration of all 12 writes)
 *  - `turn_complete` semantic event (replaced by AI SDK's `finish` chunk)
 *  - `stream_started` event (Day 2b never wired)
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 2 Day 2e" + tracker S.174.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import {
  type AddressPortfolio,
  applyToolFlags,
  balanceCheckTool,
  buildInternalContext,
  composeBundleFromToolResults,
  DEFAULT_GUARD_CONFIG,
  DEFAULT_PERMISSION_CONFIG,
  getModifiableFields,
  getToolPolicy,
  isBundleableTool,
  type PendingAction,
  type PendingToolCall,
  type Tool,
  type ToolContext,
  toAISDKTools,
  WRITE_TOOLS,
} from "@t2000/engine";
import {
  Experimental_Agent as Agent,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
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
  dispatchIntentsToParts,
  synthesizeAssistantToolMessage,
} from "@/lib/audric/dispatch-intents";
import { getFinancialContextBlock } from "@/lib/audric/financial-context";
import { redactAddressesInText, redactPII } from "@/lib/audric/log-redact";
import { audricObservabilityMiddleware } from "@/lib/audric/middleware/observability";
import { ensureNaviMcpConnected } from "@/lib/audric/navi-mcp";
import {
  extractResumeOutcomes,
  type ResumeOutcome,
} from "@/lib/audric/resume-outcome";
import { buildAudricSystemPrompt } from "@/lib/audric/system-prompt";
import { TelemetryIntegration } from "@/lib/audric/telemetry-integration";
import { getCurrentUser } from "@/lib/audric-auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getSuiRpcUrl } from "@/lib/sui-rpc";
import { Prisma } from "../../../../../web/lib/generated/prisma/client";

export const maxDuration = 60;

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
  const model: LanguageModel = wrapLanguageModel({
    model: rawModel,
    middleware: audricObservabilityMiddleware,
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
  //   claim_rewards, harvest_rewards, swap_execute, volo_stake,
  //   volo_unstake, save_contact.
  //
  // **`pay_api` is intentionally EXCLUDED from the web-v2 tool set
  // (Phase 4b deferral 2026-05-19).** The legacy 3-leg services flow
  // (`/api/services/{prepare,complete,retry}` + `service-gateway.ts`)
  // is ~1.5k LoC of MPP-gateway plumbing that doesn't yet have a
  // product home in audric's 5-product taxonomy (Passport,
  // Intelligence, Finance, Pay, Store). The Agentic Commerce spec
  // (`spec/active/AGENTIC_COMMERCE_SPEC_DRAFT.md`, drafted alongside
  // this deferral) defines the use cases that justify bringing
  // pay_api back:
  //   - "Make me a beat and sell it for $5" (Audric Store creator side)
  //   - "Buy everything for my house party" (multi-vendor commerce)
  //   - "Order flowers and a card for mom" (single-intent multi-leg)
  // Until that spec ships its first phase, the LLM never sees
  // `pay_api` in web-v2 → never proposes it → no fragile fail-loud
  // surface for the user.
  //
  // Legacy `apps/web` continues to ship pay_api unchanged.
  //
  // Client-side dispatch (audric-chat-client.tsx) routes Approve
  // taps to:
  //   - sponsoredTx({type, params, session}) for the 9 sponsored
  //     writes (save / withdraw / borrow / repay / send / swap /
  //     claim-rewards / harvest / volo-stake / volo-unstake)
  //   - POST /api/contacts/save for save_contact (Prisma-only)
  const writeToolsForWebV2 = WRITE_TOOLS.filter((t) => t.name !== "pay_api");
  const engineTools = toAISDKTools([balanceCheckTool, ...writeToolsForWebV2]);
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
  const toolContext: ToolContext = {
    walletAddress,
    suiRpcUrl: getSuiRpcUrl(),
    blockvisionApiKey: env.BLOCKVISION_API_KEY,
    mcpManager,
    // Per-request portfolio cache so balance_check + future read tools
    // in the same turn share a single BlockVision response (avoids
    // 200–500ms RTT amplification per the agent-harness-spec rule).
    portfolioCache: new Map<string, AddressPortfolio>(),
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
    permissionConfig: DEFAULT_PERMISSION_CONFIG,
    priceCache: new Map<string, number>(),
    sessionSpendUsd: 0,
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

  // 7.5 [v0.7c Phase 6 prep] Fetch the daily orientation snapshot for
  // layer 2 of the F-4 5-layer system-prompt assembly. Returns "" when
  // the snapshot is missing OR older than 48h — the prompt assembly
  // drops layer 2 cleanly and the LLM falls back to fresh tool calls
  // (which the intent-dispatcher at step 9.5 helps with). Never throws.
  //
  // Pre-Phase-6-prep this layer was silently absent: web-v2 shipped
  // through Day 2c++/2e/Phase 3/4/4b/5/5.5 with the Day 2b 5-line stub
  // and no `<financial_context>` injection. Closing it before Session 5
  // cutover avoids regressing silent intelligence at the same diff that
  // retires apps/web.
  const financialContextBlock = await getFinancialContextBlock(walletAddress);

  // 7.6 [v0.7c Phase 6 prep] Assemble the F-4 5-layer system prompt.
  // Layer 5 (user message) is owned by AI SDK's `messages` argument —
  // this function never touches it. Memory (layer 3) + skill recipe
  // (layer 4) are v0.7d gates; `skillRecipeBlock: undefined` keeps
  // them empty + drop-filtered cleanly.
  const systemInstructions = buildAudricSystemPrompt({
    walletAddress,
    financialContext: financialContextBlock,
    skillRecipeBlock: undefined, // v0.7d gate — McpPromptAdapter not wired yet
  });

  // 8. Compose the Agent. Per D-15: audric-side `Agent` for clean
  // composition + native middleware mount points (Phase 5.5 wraps
  // `model` with `wrapLanguageModel(model, [audricGuardsMiddleware,
  // preflightMiddleware, piiRedactionMiddleware, telemetryMiddleware])`
  // here per D-17). Per D-6: gateway-routed when `AI_GATEWAY_API_KEY`
  // is set, direct-Anthropic otherwise.
  const audricAgent = new Agent({
    model,
    tools,
    instructions: systemInstructions,
    stopWhen: stepCountIs(DEFAULT_MAX_TURNS),
    experimental_telemetry: experimentalTelemetry,
    experimental_context: internalContext,
    // [Day 2c++ G6 F-5 / D-6 audit] Vercel AI Gateway's `caching: 'auto'`
    // auto-injects `cache_control` breakpoints for Anthropic so prompt
    // caching fires WITHOUT typed SystemBlock[] markers. Only meaningful
    // when routing through the gateway; the direct-Anthropic fallback
    // ignores this field.
    ...(useGateway
      ? {
          providerOptions: {
            gateway: { caching: "auto" as const },
          },
        }
      : {}),
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
  // Web-v2 today only wires `balance_check` as a read tool. The registry
  // lets the dispatcher gracefully skip intents whose tool isn't wired
  // (logs + continues). When later slices wire `health_check`,
  // `transaction_history`, `mpp_services`, `activity_summary`,
  // `yield_summary` as read tools, just extend this registry — the
  // dispatcher rules already cover all 8 intent patterns.
  const readToolRegistry = new Map<string, Tool>([
    [balanceCheckTool.name, balanceCheckTool],
  ]);
  const latestUserText = extractLatestUserText(normalized);
  const dispatchedReadParts = latestUserText
    ? await dispatchIntentsToParts({
        message: latestUserText,
        toolContext,
        registry: readToolRegistry,
        turnIndex,
      })
    : [];

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

  // 10. Stream the agent and translate AI SDK chunks → UIMessage parts.
  const result = await audricAgent.stream({ messages: aiSdkMessages });
  const messageId = generateId();
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
    onFinish: () => {
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
        effortLevel: "medium", // Day 2b hardcoded; Phase 4.5 wires classifier
        modelUsed: DEFAULT_MODEL_USED,
        contextTokensStart,
        sessionSpendUsd: 0, // Day 2b doesn't track session spend
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
        });
    },
  });

  return createUIMessageStreamResponse({ stream });
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
// Chunks NOT translated (silently ignored — collector consumes them):
//   - `start`, `start-step`, `finish-step` (lifecycle markers we wrap
//     our own UIMessageStream framing around).
//   - `finish` (terminal — `turnCompleted` flag is set in the loop).
//   - `text-start`/`text-end`, `tool-input-start/end/delta` (chunk-level
//     framing the UIMessage assembler doesn't need at Day 2e granularity).
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
    const N = this.toolCalls.length;
    if (N === 0) {
      // Nothing to flush. Approval requests can't arrive without a
      // prior tool-call, so this branch covers turns with no writes.
      this.reset();
      return;
    }

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
      writer.write({
        type: "text-delta",
        id: messageId,
        delta: `\n\n[engine error] ${
          chunk.error instanceof Error
            ? chunk.error.message
            : String(chunk.error)
        }`,
      });
      break;
    }
    case "reasoning-delta": {
      // [Day 2c G6] Log thinking events so the smoke can verify F-2
      // (multi-block thinking) + F-3 (signed thinking) pass through
      // the gateway. Rendering thinking to the UI is Phase 4+ scope.
      if (typeof chunk.text === "string" && chunk.text.length > 0) {
        console.log(
          `[audric-chat] reasoning_delta (+${chunk.text.length} chars)`
        );
      }
      break;
    }
    case "reasoning-end": {
      console.log(`[audric-chat] reasoning_end id=${chunk.id}`);
      break;
    }
    default:
      // Other chunks (`start`, `start-step`, `finish-step`, `finish`,
      // `text-start`, `text-end`, `tool-input-*`, `source`, `file`,
      // `raw`, `abort`, `reasoning-start`) are not translated.
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
    case "volo_stake": {
      const amount = obj.amountSui ?? obj.amount;
      return `Stake ${amount} SUI on Volo`;
    }
    case "volo_unstake": {
      const raw = obj.amountVSui ?? obj.amount;
      const display =
        raw === "all" || raw === 0 || raw === undefined
          ? "all vSUI"
          : `${raw} vSUI`;
      return `Unstake ${display} from Volo`;
    }
    case "save_contact": {
      const name = (obj.name as string | undefined) ?? "contact";
      const addr = obj.address as string | undefined;
      const shortAddr = addr
        ? `${addr.slice(0, 6)}…${addr.slice(-4)}`
        : "address";
      return `Save contact "${name}" (${shortAddr})`;
    }
    default:
      // [Phase 4b 2026-05-19] `pay_api` is intentionally EXCLUDED from
      // web-v2's tool set (see comment near `writeToolsForWebV2`).
      // No description case needed because the LLM never sees the tool.
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

function safeErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Tool error";
  }
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
    });
}
