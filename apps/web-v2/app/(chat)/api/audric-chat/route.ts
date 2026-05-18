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
  balanceCheckTool,
  buildInternalContext,
  type ToolContext,
  toAISDKTools,
} from "@t2000/engine";
import {
  Experimental_Agent as Agent,
  createUIMessageStream,
  createUIMessageStreamResponse,
  gateway,
  generateId,
  type LanguageModel,
  stepCountIs,
  type TelemetrySettings,
  type TextStreamPart,
  type ToolSet,
  type UIMessageStreamWriter,
} from "ai";
import { z } from "zod";
import { ensureNaviMcpConnected } from "@/lib/audric/navi-mcp";
import { buildAudricDay2bSystemPrompt } from "@/lib/audric/system-prompt";
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
// `{role, content}` shape. The route's downstream code is written
// against `{role, content: string}`, so we accept both shapes at the
// edge and normalise to the legacy shape before it hits anything
// internal.
const partSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
  })
  .passthrough();

const legacyMessageSchema = z.object({
  role: messageRoleSchema,
  content: z.string().min(1, "content must be a non-empty string"),
});

const uiMessageSchema = z
  .object({
    id: z.string().optional(),
    role: messageRoleSchema,
    parts: z.array(partSchema).min(1, "parts must contain at least one entry"),
  })
  .transform((m) => ({
    role: m.role,
    content: m.parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join(""),
  }))
  .refine(
    (m) => m.content.length > 0,
    "message must contain at least one non-empty text part"
  );

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

  const latestUser = [...body.messages]
    .reverse()
    .find((m) => m.role === "user");
  if (!latestUser) {
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

  // 3. NAVI MCP singleton — same as Day 2b. Required for `balance_check`
  // since its SDK fallback wants a signing keypair (read-only Day 2b
  // doesn't wire one); the MCP path is what audric/web production uses.
  const mcpManager = await ensureNaviMcpConnected();

  // 4. Resolve the language model (gateway preferred; direct-Anthropic
  // fallback when AI_GATEWAY_API_KEY is absent).
  const useGateway = Boolean(env.AI_GATEWAY_API_KEY);
  const model: LanguageModel = useGateway
    ? gateway(`anthropic/${DEFAULT_MODEL_USED}`)
    : createAnthropic({ apiKey: env.ANTHROPIC_API_KEY ?? "" })(
        DEFAULT_MODEL_USED
      );
  console.log(
    `[audric-chat] sessionId=${sessionId} turn=${turnIndex} model=${
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
  const engineTools = toAISDKTools([balanceCheckTool]);
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
  };
  const internalContext = buildInternalContext({
    toolContext,
    walletAddress,
    // No guards / no contacts / no callbacks in Day 2e scope.
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

  // 8. Compose the Agent. Per D-15: audric-side `Agent` for clean
  // composition + native middleware mount points (Phase 5.5 wraps
  // `model` with `wrapLanguageModel(model, [audricGuardsMiddleware,
  // preflightMiddleware, piiRedactionMiddleware, telemetryMiddleware])`
  // here per D-17). Per D-6: gateway-routed when `AI_GATEWAY_API_KEY`
  // is set, direct-Anthropic otherwise.
  const audricAgent = new Agent({
    model,
    tools,
    instructions: buildAudricDay2bSystemPrompt(walletAddress),
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

  // 9. Build the messages array for agent.stream(). AI SDK accepts
  // `{role, content}` directly (no need for the engine's prior
  // `loadMessages([{role, content: [{type, text}]}])` shape — Agent
  // does that normalization internally).
  const aiSdkMessages = body.messages
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        m.role !== "system" && m.content.length > 0
    )
    .map((m) => ({ role: m.role, content: m.content }));

  // 10. Stream the agent and translate AI SDK chunks → UIMessage parts.
  const result = await audricAgent.stream({ messages: aiSdkMessages });
  const messageId = generateId();
  let turnCompleted = false;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start", messageId });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: messageId });

      try {
        for await (const chunk of result.fullStream) {
          collector.observeChunk(chunk);
          translateChunk(chunk, writer, messageId);
          if (chunk.type === "finish") {
            turnCompleted = true;
          }
        }
      } finally {
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
          console.error(
            "[web-v2 audric-chat] TurnMetrics write failed (non-fatal):",
            err
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
// payloads (`input-available`, `output-available`). The client renderer
// (`app/audric-chat/audric-chat-client.tsx`) switches on `part.type` and
// hands tool parts to AI Elements `<Tool>` (S.172) — unchanged by Day 2e.
//
// AI SDK chunk semantics:
//   - `text-delta` → write `text-delta` part (assistant prose).
//   - `tool-call` → write `tool-input-available` (the validated input is
//     available; tool-input-start/end/delta are streaming-input events
//     we don't surface in Day 2e).
//   - `tool-result` → write `tool-output-available` (the tool's
//     successful return value).
//   - `tool-error` → write `tool-output-error` (the tool threw / guard
//     blocked / preflight rejected).
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
//   - `source`/`file`/`raw`/`tool-output-denied`/`tool-approval-request`/
//     `abort` — wired through in Phase 3+ as needed.

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
      writer.write({
        type: "tool-input-available",
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        input: chunk.input,
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
      // `raw`, `tool-output-denied`, `tool-approval-request`, `abort`,
      // `reasoning-start`) are not translated. Subsequent Phase 3+
      // wires them through (especially `tool-approval-request` →
      // PendingAction transport per D-8).
      break;
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
 * Coarse token estimate for seeding `TurnMetrics.contextTokensStart`.
 * Not load-bearing — used only for warehouse parity with audric/web's
 * `harnessShape.contextTokensStart` field. AI SDK doesn't expose a
 * tokenizer publicly; chars-divided-by-4 matches the engine's prior
 * estimateTokens heuristic at packages/engine/src/context.ts.
 */
function estimateContextTokens(
  messages: Array<{ role: string; content: string }>
): number {
  const totalChars = messages.reduce((acc, m) => acc + m.content.length, 0);
  return Math.ceil(totalChars / CHARS_PER_TOKEN_ESTIMATE);
}
