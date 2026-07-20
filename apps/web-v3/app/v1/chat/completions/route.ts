import {
  generateText,
  jsonSchema,
  type ModelMessage,
  streamText,
  type ToolChoice,
  type ToolSet,
  tool,
} from "ai";
import { after } from "next/server";
import { getModelPricing } from "@/lib/ai/models";
import { anchorAndStore } from "@/lib/api/anchor";
import {
  isAttestationEnforced,
  verifyConfidentialUpstream,
} from "@/lib/api/attestation";
import {
  FREE_TIER_MODEL,
  recordFreeSpend,
  tryFreeAllowance,
} from "@/lib/api/free-tier";
import { authenticateApiKey, ensureCredit, openAiError } from "@/lib/api/keys";
import { apiMarginFor, getApiModel, isApiModel } from "@/lib/api/models";
import {
  getInferenceModel,
  getPhalaPricing,
  isConfidentialConfigured,
  isConfidentialModel,
} from "@/lib/api/providers";
import { isRouterModel, resolveRouterModel } from "@/lib/api/router";
import { debitMicrosForUsage } from "@/lib/credit/meter";
import { recordApiUsage, recordCredit } from "@/lib/db/queries";
import { checkApiRateLimit } from "@/lib/ratelimit";
import { maybeAutoRecharge } from "@/lib/stripe";
import { generateUUID } from "@/lib/utils";

// Web-search-class turns aside, raw inference can still run long on big outputs.
export const maxDuration = 300;

type OpenAIContentPart = { type?: string; text?: string };
type OpenAIToolCall = {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};
type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | OpenAIContentPart[] | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
};
type OpenAIFunctionTool = {
  type?: string;
  function?: {
    name?: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};
type OpenAIToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type?: string; function?: { name?: string } };
type CompletionsBody = {
  model?: string;
  messages?: OpenAIMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stream_options?: { include_usage?: boolean };
  tools?: OpenAIFunctionTool[];
  tool_choice?: OpenAIToolChoice;
};

/** OpenAI content → plain text (image parts are dropped). */
function partsToText(
  content: string | OpenAIContentPart[] | null | undefined
): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

function safeParseJson(raw: string | undefined): unknown {
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * OpenAI message list → AI SDK ModelMessage list, preserving the tool-call
 * loop (assistant `tool_calls` → tool-call parts; `tool` role → tool-result
 * parts). Coding agents (zero, aider, Codebuff…) are tool-loop clients — a
 * text-only conversion silently breaks them (the model narrates "I'll run
 * that" and no tool call ever arrives).
 */
function toModelMessages(input: OpenAIMessage[]): ModelMessage[] {
  // OpenAI `tool` messages carry only tool_call_id; the SDK wants toolName.
  const toolNames = new Map<string, string>();
  const out: ModelMessage[] = [];
  for (const m of input) {
    if (m.role === "system") {
      continue; // handled via `instructions`
    }
    if (m.role === "user") {
      out.push({ role: "user", content: partsToText(m.content) });
      continue;
    }
    if (m.role === "assistant") {
      const text = partsToText(m.content);
      const calls = (m.tool_calls ?? []).filter((c) => c.function?.name);
      for (const c of calls) {
        if (c.id) {
          toolNames.set(c.id, c.function?.name ?? "");
        }
      }
      if (calls.length === 0) {
        out.push({ role: "assistant", content: text });
        continue;
      }
      out.push({
        role: "assistant",
        content: [
          ...(text ? [{ type: "text" as const, text }] : []),
          ...calls.map((c) => ({
            type: "tool-call" as const,
            toolCallId: c.id ?? generateUUID(),
            toolName: c.function?.name ?? "",
            input: safeParseJson(c.function?.arguments),
          })),
        ],
      });
      continue;
    }
    out.push({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: m.tool_call_id ?? "",
          toolName: toolNames.get(m.tool_call_id ?? "") ?? m.name ?? "tool",
          output: { type: "text", value: partsToText(m.content) },
        },
      ],
    });
  }
  return out;
}

/**
 * OpenAI function tools → AI SDK ToolSet. No `execute` — v1 is passthrough,
 * the caller runs its own tools; the SDK returns the tool calls unexecuted.
 */
function toToolSet(
  tools: OpenAIFunctionTool[] | undefined
): ToolSet | undefined {
  if (!Array.isArray(tools) || tools.length === 0) {
    return;
  }
  const set: ToolSet = {};
  for (const t of tools) {
    const name = t.function?.name;
    if (!name) {
      continue;
    }
    set[name] = tool({
      ...(t.function?.description
        ? { description: t.function.description }
        : {}),
      inputSchema: jsonSchema(
        t.function?.parameters ?? { type: "object", properties: {} }
      ),
    });
  }
  return Object.keys(set).length > 0 ? set : undefined;
}

function toToolChoice(
  choice: OpenAIToolChoice | undefined
): ToolChoice<ToolSet> | undefined {
  if (choice === "auto" || choice === "none" || choice === "required") {
    return choice;
  }
  const name = typeof choice === "object" ? choice?.function?.name : undefined;
  return name ? { type: "tool", toolName: name } : undefined;
}

/** AI SDK tool calls → OpenAI response `tool_calls` array. */
function toOpenAiToolCalls(
  toolCalls: readonly { toolCallId: string; toolName: string; input: unknown }[]
) {
  return toolCalls.map((c) => ({
    id: c.toolCallId,
    type: "function" as const,
    function: {
      name: c.toolName,
      arguments: JSON.stringify(c.input ?? {}),
    },
  }));
}

function mapFinishReason(reason: string): string {
  if (reason === "length") {
    return "length";
  }
  if (reason === "content-filter") {
    return "content_filter";
  }
  if (reason === "tool-calls") {
    return "tool_calls";
  }
  return "stop";
}

/**
 * Map an AI SDK call error to its real upstream status + message instead of a
 * generic 502 — better DX for a developer API (and self-diagnosing: an upstream
 * 401 surfaces as 401 "Invalid API key", not an opaque "Upstream model error").
 */
function upstreamError(error: unknown): {
  status: number;
  message: string;
} {
  const e = error as { statusCode?: number; message?: string };
  const status =
    typeof e?.statusCode === "number" &&
    e.statusCode >= 400 &&
    e.statusCode < 600
      ? e.statusCode
      : 502;
  return {
    status,
    message: e?.message?.slice(0, 500) || "Upstream model error.",
  };
}

// POST /v1/chat/completions — OpenAI-compatible raw inference (SPEC_AUDRIC_API
// v1). Pure model passthrough over the Vercel Gateway (ZDR), metered per token
// against the same CreditLedger as in-app turns. No Audric tools / agent loop —
// that's the consumer product, not the raw API.
export async function POST(request: Request) {
  // Credit gate deferred: the free tier needs the MODEL before it can tell
  // "402" from "free allowance ride" — every non-free path below MUST pass
  // ensureCredit before serving.
  const auth = await authenticateApiKey(request, { skipCreditCheck: true });
  if (!auth.ok) {
    return auth.response;
  }

  // Per-key RPM abuse cap (M4.10). Fails open if Redis is unavailable.
  if (!(await checkApiRateLimit(auth.keyId))) {
    return openAiError(
      429,
      "Rate limit exceeded — slow down (max 120 requests/minute per key).",
      "rate_limit_error",
      "rate_limit_exceeded"
    );
  }

  let body: CompletionsBody;
  try {
    body = (await request.json()) as CompletionsBody;
  } catch {
    return openAiError(
      400,
      "Invalid JSON body.",
      "invalid_request_error",
      "invalid_body"
    );
  }

  const requested = body.model;
  // Confidential (phala/*) models are only available when the Phala key is
  // configured — otherwise they're effectively not in the catalog (404, not 500).
  const modelUnavailable =
    !requested ||
    !(isApiModel(requested) || isRouterModel(requested)) ||
    (isConfidentialModel(requested) && !isConfidentialConfigured());
  if (modelUnavailable) {
    return openAiError(
      404,
      `The model \`${requested ?? ""}\` does not exist or you do not have access to it. See GET /v1/models.`,
      "invalid_request_error",
      "model_not_found"
    );
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return openAiError(
      400,
      "`messages` must be a non-empty array.",
      "invalid_request_error",
      "invalid_messages"
    );
  }

  // System messages → `instructions`; the rest → the model message list
  // (tool-call loop preserved — see toModelMessages).
  const system = body.messages
    .filter((m) => m.role === "system")
    .map((m) => partsToText(m.content))
    .join("\n\n");
  const messages = toModelMessages(body.messages);
  // Plain-text view for the router heuristics (context size + phrasing).
  const routerMessages = body.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: partsToText(m.content),
    }));

  // `t2000/auto` / `t2000/auto-open` — the coding-profile router
  // (SPEC_INFERENCE_DEMAND §2b). Resolve to the concrete model BEFORE the
  // pipeline: serving, pricing, margin, and the usage ledger all follow the
  // SERVED model (billed at the price of the model that actually ran — no
  // blended rates). The response echoes the requested router id (OpenAI-client
  // convention) and exposes the served model via `x-t2000-served-model` + the
  // usage records (the console's open-vs-frontier split reads those).
  const routed = isRouterModel(requested)
    ? resolveRouterModel({
        modelId: requested,
        messages: routerMessages,
        system,
      })
    : undefined;
  const model = routed?.served ?? requested;

  // FREE TIER (SPEC_INFERENCE_DEMAND Step-1 item 4): the free-tier model,
  // requested DIRECTLY (never via router ids / frontier / confidential), may
  // ride the per-account daily allowance instead of the credit ledger. Every
  // other path pays — the deferred credit gate runs here.
  const freeEligible = requested === FREE_TIER_MODEL;
  const free = freeEligible ? await tryFreeAllowance(auth.userId) : undefined;
  const isFree = free?.ok === true;
  if (free && !free.ok && free.reason === "rpm") {
    return openAiError(
      429,
      "Free-tier rate limit exceeded — slow down, or add credit at agents.t2000.ai/manage for full-speed access.",
      "rate_limit_error",
      "free_tier_rate_limit"
    );
  }
  if (!isFree) {
    const credit = await ensureCredit(auth.userId);
    if (credit) {
      if (free && free.reason === "exhausted") {
        // The spec'd upgrade path: exhaustion names the next step, never a
        // bare "no credit".
        return openAiError(
          402,
          "Free daily allowance used up (resets daily, UTC). Add credit at agents.t2000.ai/manage to keep coding — `t2000/auto` routes each step to the right model at open-tier prices.",
          "insufficient_quota",
          "free_tier_exhausted"
        );
      }
      return credit;
    }
  }

  const confidential = isConfidentialModel(model);
  const maxOutputTokens = body.max_completion_tokens ?? body.max_tokens;
  // Client-executed tools: no `execute` on any tool, so the SDK returns the
  // tool calls unexecuted and the caller's own loop runs them (OpenAI
  // convention — finish_reason "tool_calls").
  const toolSet = toToolSet(body.tools);
  const toolChoice = toolSet ? toToolChoice(body.tool_choice) : undefined;
  const shared = {
    model: getInferenceModel(model),
    ...(system ? { instructions: system } : {}),
    messages,
    ...(toolSet ? { tools: toolSet } : {}),
    ...(toolChoice ? { toolChoice } : {}),
    ...(typeof body.temperature === "number"
      ? { temperature: body.temperature }
      : {}),
    ...(typeof body.top_p === "number" ? { topP: body.top_p } : {}),
    ...(typeof maxOutputTokens === "number" ? { maxOutputTokens } : {}),
    // "Private" rung = ZDR via the Gateway. The "confidential" rung (phala/*)
    // is hardware-isolated by construction, so the Gateway ZDR flag doesn't
    // apply (and would be meaningless to a non-Gateway provider).
    ...(confidential
      ? {}
      : { providerOptions: { gateway: { zeroDataRetention: true } } }),
  };

  const id = `chatcmpl-${generateUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  // Resolve the CHARGED price ONCE before generating — confidential (phala/*)
  // from Phala's catalog, everything else from the Vercel Gateway, both per-1M.
  const pricing = confidential
    ? (await getPhalaPricing())[model]
    : (await getModelPricing())[model];

  // Fail CLOSED for confidential when unpriceable (units-guard drop / not live)
  // — `/v1/models` already omits it, so serving it would be silent free
  // inference. Private models stay resilient: a Gateway-pricing blip is
  // transient, so we serve + warn rather than 503 the whole API.
  if (confidential && !pricing) {
    return openAiError(
      503,
      "This model is temporarily unavailable.",
      "api_error",
      "model_unavailable"
    );
  }

  // v3.0 Phase A — verify the confidential upstream is a genuine, freshly-
  // attested Phala GPU-TEE BEFORE forwarding the prompt. Observe-mode by
  // default (verify + log, still serve); fail-closed only when
  // CONFIDENTIAL_ATTESTATION_ENFORCE=true (flip on after a real attestation
  // response confirms the verification — see SPEC_CONFIDENTIAL_API §5 Phase A).
  if (confidential && model) {
    const upstream = getApiModel(model)?.upstream ?? model;
    const att = await verifyConfidentialUpstream(model, upstream);
    if (!att.verified) {
      if (isAttestationEnforced()) {
        return openAiError(
          503,
          "Confidential attestation could not be verified — request refused (fail-closed).",
          "api_error",
          "attestation_failed"
        );
      }
      console.warn(
        `[/v1/chat/completions] confidential attestation NOT verified for ${model} (observe-mode, served): ${att.reason}`
      );
    }
  }

  // Debit the same CreditLedger as in-app turns. `ref = completion id` →
  // idempotent (one debit per completion). Best-effort: a metering hiccup must
  // never fail the user's completion (recordCredit is idempotent + robust).
  const meter = async (usage: {
    inputTokens?: number;
    outputTokens?: number;
  }) => {
    try {
      if (!pricing) {
        // No pricing entry → we can't debit, but the tokens still happened.
        // Record a $0 usage event so the request is visible in usage
        // aggregates (and the warning below is auditable against rows).
        console.warn(
          `[/v1/chat/completions] no pricing for ${model} — served UNMETERED`
        );
        await recordApiUsage({
          userId: auth.userId,
          keyId: auth.keyId,
          model: model ?? "",
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          costMicros: 0,
          privacyTier: confidential ? "confidential" : "private",
          ref: id,
        });
        return;
      }
      const debit = debitMicrosForUsage(usage, pricing, apiMarginFor(model));
      if (isFree) {
        // Free ride: no ledger debit — the NOTIONAL debit settles the daily
        // allowance counter instead (the cost-envelope accounting).
        await recordFreeSpend(auth.userId, debit);
      } else if (debit > 0) {
        await recordCredit({
          userId: auth.userId,
          amountMicros: -debit,
          type: "debit",
          description: `api · ${model} · ${usage.inputTokens ?? 0}+${usage.outputTokens ?? 0} tok`,
          ref: id,
        });
        // Refill from a saved card if auto-recharge is on + balance fell below
        // the threshold. The Audric chat path does this too; without it an
        // API-only user could hit $0 with no top-up. Self-gates cheaply (no-op
        // unless enabled + below threshold); never throws. Awaited so it runs
        // before the serverless function can freeze post-response.
        await maybeAutoRecharge(auth.userId);
      }
      // Structured usage event (My-usage screen) — idempotent on the completion
      // id, mirrors the debit. Written even for $0 debits (token counts matter;
      // free rides record $0 charged — the tokens still show).
      await recordApiUsage({
        userId: auth.userId,
        keyId: auth.keyId,
        model: model ?? "",
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        costMicros: isFree ? 0 : debit,
        privacyTier: confidential ? "confidential" : "private",
        ref: id,
      });
    } catch (error) {
      console.error("[/v1/chat/completions] meter error", error);
    }
  };

  // ── Non-streaming ──────────────────────────────────────────────────────────
  if (!body.stream) {
    try {
      const { text, usage, finishReason, response, toolCalls } =
        await generateText(shared);
      await meter(usage);
      // Confidential calls return an x-receipt-id (TEE attestation receipt) —
      // pass it through so callers can later verify the run (v3 verifier).
      const receiptId = response?.headers?.["x-receipt-id"];
      // Anchor-every + store: every confidential response is auto-anchored on
      // Sui + its signed receipt persisted for durable verify, async
      // (post-response, no added latency).
      if (confidential && typeof receiptId === "string" && receiptId) {
        after(() => anchorAndStore(receiptId));
      }
      const headers: Record<string, string> = {};
      if (typeof receiptId === "string" && receiptId) {
        headers["x-receipt-id"] = receiptId;
      }
      if (routed) {
        headers["x-t2000-served-model"] = model;
        headers["x-t2000-route-reason"] = routed.reason;
      }
      return Response.json(
        {
          id,
          object: "chat.completion",
          created,
          // Echo the REQUESTED id (router ids stay stable across round-trips);
          // the served model rides the x-t2000-served-model header + usage.
          model: requested,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: text || null,
                ...(toolCalls.length > 0
                  ? { tool_calls: toOpenAiToolCalls(toolCalls) }
                  : {}),
              },
              finish_reason:
                toolCalls.length > 0
                  ? "tool_calls"
                  : mapFinishReason(finishReason),
            },
          ],
          usage: {
            prompt_tokens: usage.inputTokens ?? 0,
            completion_tokens: usage.outputTokens ?? 0,
            total_tokens: usage.totalTokens ?? 0,
          },
        },
        Object.keys(headers).length > 0 ? { headers } : undefined
      );
    } catch (error) {
      console.error("[/v1/chat/completions] non-stream error", error);
      const { status, message } = upstreamError(error);
      return openAiError(status, message, "api_error", "upstream_error");
    }
  }

  // ── Streaming (SSE, OpenAI chat.completion.chunk) ───────────────────────────
  const includeUsage = body.stream_options?.include_usage === true;
  const encoder = new TextEncoder();

  const chunk = (delta: Record<string, unknown>, finish: string | null) =>
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model: requested,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = streamText(shared);
        controller.enqueue(encoder.encode(chunk({ role: "assistant" }, null)));
        // fullStream (not textStream) — tool-call parts must reach the client
        // as OpenAI `tool_calls` deltas or tool-loop callers hang on text-only
        // narration. Each complete tool call ships as one delta (full
        // arguments string; standard OpenAI clients accept that shape).
        let toolCallIndex = 0;
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            controller.enqueue(
              encoder.encode(chunk({ content: part.text }, null))
            );
          } else if (part.type === "tool-call") {
            controller.enqueue(
              encoder.encode(
                chunk(
                  {
                    tool_calls: [
                      {
                        index: toolCallIndex++,
                        id: part.toolCallId,
                        type: "function",
                        function: {
                          name: part.toolName,
                          arguments: JSON.stringify(part.input ?? {}),
                        },
                      },
                    ],
                  },
                  null
                )
              )
            );
          }
        }
        const finishReason = await result.finishReason;
        controller.enqueue(
          encoder.encode(
            chunk(
              {},
              toolCallIndex > 0 ? "tool_calls" : mapFinishReason(finishReason)
            )
          )
        );

        const usage = await result.usage;
        // Confidential: capture the receipt id for anchor-every (regardless of
        // include_usage) + the final usage chunk when present. Anchor + store
        // async, post-response — no added latency.
        const receiptId = confidential
          ? (await result.response)?.headers?.["x-receipt-id"]
          : undefined;
        if (typeof receiptId === "string" && receiptId) {
          after(() => anchorAndStore(receiptId));
        }
        if (includeUsage) {
          // Streaming can't add trailing HTTP headers, so the TEE receipt rides
          // the final usage chunk (when present) for confidential calls.
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                id,
                object: "chat.completion.chunk",
                created,
                model: requested,
                choices: [],
                usage: {
                  prompt_tokens: usage.inputTokens ?? 0,
                  completion_tokens: usage.outputTokens ?? 0,
                  total_tokens: usage.totalTokens ?? 0,
                },
                ...(receiptId ? { x_receipt_id: receiptId } : {}),
              })}\n\n`
            )
          );
        }
        // Meter BEFORE closing — the serverless function may freeze once the
        // response stream ends, so the debit must be written inside the request.
        await meter(usage);
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        console.error("[/v1/chat/completions] stream error", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              error: {
                message: upstreamError(error).message,
                type: "api_error",
                code: "upstream_error",
              },
            })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // The served model is resolved before streaming starts, so router
      // transparency headers can ride the response head.
      ...(routed
        ? {
            "x-t2000-served-model": model,
            "x-t2000-route-reason": routed.reason,
          }
        : {}),
    },
  });
}
