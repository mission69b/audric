/**
 * Audric chat route — engine-backed POST /api/audric-chat.
 *
 * --- WHY THIS FILE EXISTS (v0.7c Phase 2) ---
 *
 * SPEC §"Phase 2 — First end-to-end round-trip":
 *   - Day 2a: replace template's default chat route with an audric route
 *     reading from `@t2000/engine.submitMessage()`; emit
 *     `result.toUIMessageStreamResponse()` instead of engine `engineToSSE`.
 *   - Day 2b: wire `balance_check` end-to-end + minimal renderer + verify
 *     TurnMetrics row shape matches production (G4 acceptance).
 *
 * **Why a new path (`/api/audric-chat`) instead of overwriting
 * `/api/chat`:** the template's `/api/chat` is wired into the existing
 * chat UI (`useChat({ api: '/api/chat' })`) AND the Day 1d baseline
 * smoke; rewiring to this route happens incrementally per phase.
 *
 * --- DAY 2b SCOPE (acceptance: G4 — first read-tool round-trip) ---
 *
 * What this route DOES:
 *  1. Auth gate via `getCurrentUser()` (verified zkLogin JWT chain).
 *  2. Parse a minimal `{ messages: [{ role, content }] }` body.
 *  3. Construct an `AISDKEngine` with `balanceCheckTool` registered +
 *     minimal `ToolContext` fields (`walletAddress`, `suiRpcUrl`,
 *     `blockvisionApiKey`, `portfolioCache`) + 5-line Day 2b system
 *     prompt mentioning `balance_check`.
 *  4. Iterate `engine.submitMessage(prompt)` and translate engine
 *     events to AI SDK v6 UIMessageStream parts:
 *      - `text_delta` → `text-delta`
 *      - `tool_start` → `tool-input-available` (audric tool surface)
 *      - `tool_result` → `tool-output-available`
 *      - `usage` → collector hook only (not user-facing)
 *      - `error` → text-delta with `[engine error]` prefix
 *  5. After `turn_complete`, build the full 41-field TurnMetrics row
 *     shape per the Day 2b (c') decision and `prisma.turnMetrics.create`.
 *
 * What this route DOES NOT do (yet):
 *  - AI Gateway routing (Day 2c).
 *  - Intent-dispatcher pre-fetch (Day 2d per D-14 spike).
 *  - `audricAgent = new Agent({...})` composition (Day 2e per D-15/D-18).
 *  - `<financial_context>` injection (Phase 4).
 *  - Real `STATIC_SYSTEM_PROMPT` port (Phase 4).
 *  - Guards / preflight / harness-metrics shape detection (Phase 4).
 *  - Other 24+ read tools — `balance_check` alone proves G4.
 *  - `ConversationLog` persistence — SPEC's Day 2b text calls out
 *    TurnMetrics only; ConversationLog is the multi-turn context
 *    history surface, not Day 2b's smoke contract.
 *  - Resume route consolidation (D-3 lock — chat+resume merge at Phase 3).
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 2 Day 2b" + tracker S.169.
 */

import {
  type AddressPortfolio,
  AISDKEngine,
  type AISDKEngineConfig,
  balanceCheckTool,
  type EngineEvent,
} from "@t2000/engine";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
import { z } from "zod";
import { ensureNaviMcpConnected } from "@/lib/audric/navi-mcp";
import { buildAudricDay2bSystemPrompt } from "@/lib/audric/system-prompt";
import { MinimalTurnMetricsCollector } from "@/lib/audric/turn-metrics";
import { getCurrentUser } from "@/lib/audric-auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getSuiRpcUrl } from "@/lib/sui-rpc";
import { Prisma } from "../../../../../web/lib/generated/prisma/client";

export const maxDuration = 60;

// -----------------------------------------------------------------------------
// Request body schema — minimal Day 2a/2b shape
// -----------------------------------------------------------------------------

const messageRoleSchema = z.enum(["user", "assistant", "system"]);

const messageSchema = z.object({
  role: messageRoleSchema,
  content: z.string().min(1, "content must be a non-empty string"),
});

const bodySchema = z.object({
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

  if (!env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "ANTHROPIC_API_KEY is not set — Day 2c will switch to AI_GATEWAY_API_KEY",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const sessionId = body.sessionId ?? `web-v2-${crypto.randomUUID()}`;
  const turnIndex =
    body.turnIndex ?? Math.max(0, Math.floor(body.messages.length / 2));
  const collector = new MinimalTurnMetricsCollector();
  const contextTokensStart = estimateContextTokens(body.messages);

  // 3. Construct engine with balance_check + minimal ToolContext
  //
  // NAVI MCP is REQUIRED for balance_check on web-v2: the tool has two
  // execution paths, and the SDK fallback requires a `T2000` agent
  // instance (= signing keypair), which we deliberately don't wire for
  // read-only Day 2b. The MCP path is what audric/web uses in
  // production anyway. `ensureNaviMcpConnected` is a module-scoped
  // singleton so subsequent requests reuse the connection.
  const mcpManager = await ensureNaviMcpConnected();

  const engineConfig: AISDKEngineConfig = {
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    tools: [balanceCheckTool],
    systemPrompt: buildAudricDay2bSystemPrompt(walletAddress),
    walletAddress,
    suiRpcUrl: getSuiRpcUrl(),
    blockvisionApiKey: env.BLOCKVISION_API_KEY,
    mcpManager,
    // Per-request portfolio cache so balance_check + future read tools
    // in the same turn share a single BlockVision response (avoids
    // 200–500ms RTT amplification per the agent-harness-spec rule).
    portfolioCache: new Map<string, AddressPortfolio>(),
  };
  const engine = new AISDKEngine(engineConfig);

  const history = body.messages
    .slice(0, -1)
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        m.role !== "system"
    )
    .map((m) => ({
      role: m.role,
      content: [{ type: "text" as const, text: m.content }],
    }));
  if (history.length > 0) {
    engine.loadMessages(history);
  }

  // 4. Translate EngineEvent generator → UIMessageStream parts
  const messageId = generateId();
  let turnCompleted = false;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start", messageId });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: messageId });

      try {
        for await (const ev of engine.submitMessage(latestUser.content)) {
          collector.observe(ev);
          translateEvent(ev, writer, messageId);
          if (ev.type === "turn_complete") {
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
      // 5. Persist TurnMetrics row (fire-and-forget; never blocks the
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
        // objects rather than class instances (production pattern at
        // audric/web/app/api/engine/chat/route.ts L1385-1387).
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
// EngineEvent → UIMessageStream translator (Day 2b: text + tools + usage)
// -----------------------------------------------------------------------------
//
// AI SDK v6 tool parts use the type `tool-<toolName>` with state-based
// payloads (`input-available`, `output-available`). The renderer in
// `components/audric/tool-part.tsx` switches on `part.type` and
// pattern-matches the `tool-` prefix.

function translateEvent(
  ev: EngineEvent,
  writer: Parameters<
    Parameters<typeof createUIMessageStream>[0]["execute"]
  >[0]["writer"],
  messageId: string
): void {
  switch (ev.type) {
    case "text_delta": {
      if (typeof ev.text === "string" && ev.text.length > 0) {
        writer.write({ type: "text-delta", id: messageId, delta: ev.text });
      }
      break;
    }
    case "tool_start": {
      // AI SDK v6 wire format: `tool-input-available` carries the
      // toolName + input; client assembler converts this into a
      // `tool-${toolName}` part on the rendered UIMessage.
      writer.write({
        type: "tool-input-available",
        toolCallId: ev.toolUseId,
        toolName: ev.toolName,
        input: ev.input,
      });
      break;
    }
    case "tool_result": {
      // `tool-output-available` is keyed by toolCallId (no toolName field)
      // — the client matches it to the prior `tool-input-available` chunk.
      if (ev.isError) {
        writer.write({
          type: "tool-output-error",
          toolCallId: ev.toolUseId,
          errorText: safeErrorText(ev.result),
        });
      } else {
        writer.write({
          type: "tool-output-available",
          toolCallId: ev.toolUseId,
          output: ev.result,
        });
      }
      break;
    }
    case "error": {
      writer.write({
        type: "text-delta",
        id: messageId,
        delta: `\n\n[engine error] ${ev.error.message}`,
      });
      break;
    }
    case "usage":
    case "turn_complete":
      // Collected by the collector; not surfaced to the UI.
      break;
    default:
      // Other engine events (`thinking_delta`, `pending_action`,
      // `canvas`, `todo_update`, `harness_shape`, `tool_progress`,
      // `pending_input`, etc.) are not yet translated. Subsequent
      // Phase 2/3/4 days wire them through.
      break;
  }
}

function safeErrorText(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  try {
    return JSON.stringify(result);
  } catch {
    return "Tool error";
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Day 2b default model — Sonnet 4.6 matches audric/web production's
 * routing for `'medium'` effort. Phase 4.5 wires real classifier-driven
 * model routing via `classifyEffort()` + `routedModel`.
 */
const DEFAULT_MODEL_USED = "claude-sonnet-4-5";

/**
 * Rough token estimate of the conversation history (4 chars/token).
 * Used for `TurnMetrics.contextTokensStart`. Production's
 * `estimateTokens()` helper does the same crude approximation.
 */
function estimateContextTokens(messages: Array<{ content: string }>): number {
  const totalChars = messages.reduce((n, m) => n + m.content.length, 0);
  return Math.ceil(totalChars / 4);
}
