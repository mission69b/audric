/**
 * Audric chat route — engine-backed POST /api/audric-chat.
 *
 * --- WHY THIS FILE EXISTS (v0.7c Phase 2 Day 2a) ---
 *
 * SPEC §"Phase 2 — First end-to-end round-trip":
 *   "Replace template's default chat route with audric chat route
 *    reading from `@t2000/engine.submitMessage()`; emit
 *    `result.toUIMessageStreamResponse()` instead of engine `engineToSSE`."
 *
 * Day 2a is the MINIMUM round-trip — JWT in → engine.submitMessage →
 * text streams back through AI SDK v6's native `createUIMessageStream`.
 * Tools, guards, persistence, harness-metrics, intent-dispatcher, AI
 * Gateway routing, and Agent composition all land in subsequent days
 * (2b through 2e).
 *
 * **Why a new path (`/api/audric-chat`) instead of overwriting
 * `/api/chat`:** the template's `/api/chat` is wired into the existing
 * chat UI (`useChat({ api: '/api/chat' })`) AND into the Day 1d smoke
 * baseline (POST /api/chat returns 400 without a JWT-shaped body,
 * verifying auth + validation). Day 2b will swap the UI over to this
 * new route once a minimal renderer can consume the
 * `result.toUIMessageStream()` parts; until then the template route
 * stays intact to preserve baseline behavior.
 *
 * --- DAY 2a SCOPE (acceptance: curl POST returns streaming text delta) ---
 *
 * What this route DOES:
 *  1. Auth gate via `getCurrentUser()` (verified zkLogin JWT chain;
 *     no JWT → 401, invalid JWT → 401, valid JWT → Sui address bound
 *     to `session.user.id`).
 *  2. Parse a minimal `{ messages: [{ role, content }] }` body.
 *  3. Construct a minimal `AISDKEngine` (no tools, no system prompt,
 *     no MCP, no portfolioCache — just Anthropic + the engine's bare
 *     submitMessage path).
 *  4. Iterate `engine.submitMessage(prompt)` and translate engine
 *     events to AI SDK v6 UIMessageStream parts via
 *     `createUIMessageStream({ execute })`.
 *  5. Return `createUIMessageStreamResponse({ stream })`.
 *
 * What this route DOES NOT do (yet):
 *  - Persistence: no `saveChat` / `saveMessages` calls. Day 2b adds
 *    TurnMetrics emission; chat / message persistence comes when we
 *    rewire the UI to this path (later in Phase 2 / Phase 3).
 *  - Tools: no `getDefaultTools()` wired. Day 2b first read-tool
 *    round-trip wires `balance_check`.
 *  - System prompt: no `<financial_context>` block; LLM responds with
 *    its bare model knowledge. Day 2b / Day 2c add the audric system
 *    prompt + AI Gateway routing.
 *  - Guards / preflight / harness-metrics: all engine pipeline pieces
 *    that the legacy `apps/web/app/api/engine/chat/route.ts` wires
 *    over ~1700 LoC. We add them incrementally per Phase 2 days; the
 *    audricAgent composition in Day 2e brings them in via the new
 *    `Agent` interface + middleware (D-15 / D-17 locks).
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 2 Day 2a" + audric-build-tracker.md row 7t.
 */

import { AISDKEngine, type AISDKEngineConfig } from "@t2000/engine";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
import { z } from "zod";
import { getCurrentUser } from "@/lib/audric-auth";
import { env } from "@/lib/env";

export const maxDuration = 60;

// -----------------------------------------------------------------------------
// Request body schema — minimal Day 2a shape
// -----------------------------------------------------------------------------
// The template's full shape carries id / message / messages / model / etc.
// Day 2a accepts the AI-SDK-native useChat() POST shape (`{ messages: [...] }`)
// so a future Day 2b UI rewire can use `useChat({ api: '/api/audric-chat' })`
// with zero body adapter.

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

  // The latest user-authored message becomes the prompt the engine
  // consumes via submitMessage(). Prior assistant/user turns get loaded
  // into engine history so multi-turn context works.
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

  // 3. Construct minimal engine
  const engineConfig: AISDKEngineConfig = {
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    // Intentionally empty: no tools, no system prompt, no MCP, no
    // portfolioCache. Subsequent Phase 2 days wire each piece.
  };
  const engine = new AISDKEngine(engineConfig);

  // Load prior context so multi-turn works. Engine's `Message` only
  // accepts `'user' | 'assistant'`; system messages live in the
  // engine config's `systemPrompt` field (Day 2b wires that). Drop
  // any client-supplied system entries for Day 2a — accepting them
  // would be a security smell anyway (clients should never inject
  // their own system prompt).
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
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // `start` opens an assistant message in the AI SDK UI ledger.
      writer.write({ type: "start", messageId });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: messageId });

      try {
        for await (const ev of engine.submitMessage(latestUser.content)) {
          switch (ev.type) {
            case "text_delta":
              if (typeof ev.text === "string" && ev.text.length > 0) {
                writer.write({
                  type: "text-delta",
                  id: messageId,
                  delta: ev.text,
                });
              }
              break;
            case "error":
              // Surface engine errors to the UI as a recoverable
              // text-delta line so the user sees what failed. Phase 2
              // post-Day-2a can elevate to a typed error part.
              writer.write({
                type: "text-delta",
                id: messageId,
                delta: `\n\n[engine error] ${ev.error.message}`,
              });
              break;
            case "turn_complete":
              // Engine signals end-of-turn; let the AI SDK finish
              // helpers close the stream via the finally block.
              break;
            // All other event types (thinking_delta, tool_start,
            // tool_result, pending_action, canvas, todo_update,
            // harness_shape, transition_state, stream_started, etc.)
            // are intentionally NOT translated yet — Day 2a is text-
            // only. Subsequent days wire them through.
            default:
              break;
          }
        }
      } finally {
        writer.write({ type: "text-end", id: messageId });
        writer.write({ type: "finish-step" });
        writer.write({ type: "finish" });
      }
    },
    generateId,
  });

  return createUIMessageStreamResponse({ stream });
}
