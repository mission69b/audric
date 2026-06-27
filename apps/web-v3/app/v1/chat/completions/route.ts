import { generateText, streamText } from "ai";
import { getModelPricing } from "@/lib/ai/models";
import { authenticateApiKey, openAiError } from "@/lib/api/keys";
import { apiMarginFor, isApiModel } from "@/lib/api/models";
import {
  getInferenceModel,
  getPhalaPricing,
  isConfidentialConfigured,
  isConfidentialModel,
} from "@/lib/api/providers";
import { debitMicrosForUsage } from "@/lib/credit/meter";
import { recordCredit } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";

// Web-search-class turns aside, raw inference can still run long on big outputs.
export const maxDuration = 300;

type OpenAIContentPart = { type?: string; text?: string };
type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OpenAIContentPart[];
};
type CompletionsBody = {
  model?: string;
  messages?: OpenAIMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stream_options?: { include_usage?: boolean };
};

/** OpenAI content → plain text (v1 is raw text; image parts are dropped). */
function partsToText(content: string | OpenAIContentPart[]): string {
  if (typeof content === "string") {
    return content;
  }
  return content
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

function mapFinishReason(reason: string): string {
  if (reason === "length") {
    return "length";
  }
  if (reason === "content-filter") {
    return "content_filter";
  }
  return "stop";
}

// POST /v1/chat/completions — OpenAI-compatible raw inference (SPEC_AUDRIC_API
// v1). Pure model passthrough over the Vercel Gateway (ZDR), metered per token
// against the same CreditLedger as in-app turns. No Audric tools / agent loop —
// that's the consumer product, not the raw API.
export async function POST(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth.ok) {
    return auth.response;
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

  const model = body.model;
  // Confidential (phala/*) models are only available when the Phala key is
  // configured — otherwise they're effectively not in the catalog (404, not 500).
  const modelUnavailable =
    !model ||
    !isApiModel(model) ||
    (isConfidentialModel(model) && !isConfidentialConfigured());
  if (modelUnavailable) {
    return openAiError(
      404,
      `The model \`${model ?? ""}\` does not exist or you do not have access to it. See GET /v1/models.`,
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

  // System messages → `instructions`; the rest → the model message list.
  const system = body.messages
    .filter((m) => m.role === "system")
    .map((m) => partsToText(m.content))
    .join("\n\n");
  const messages = body.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: partsToText(m.content),
    }));

  const confidential = isConfidentialModel(model);
  const maxOutputTokens = body.max_completion_tokens ?? body.max_tokens;
  const shared = {
    model: getInferenceModel(model),
    ...(system ? { instructions: system } : {}),
    messages,
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

  // Debit the same CreditLedger as in-app turns. `ref = completion id` →
  // idempotent (one debit per completion). Best-effort: a metering hiccup must
  // never fail the user's completion (recordCredit is idempotent + robust).
  const meter = async (usage: {
    inputTokens?: number;
    outputTokens?: number;
  }) => {
    try {
      if (!pricing) {
        console.warn(
          `[/v1/chat/completions] no pricing for ${model} — served UNMETERED`
        );
        return;
      }
      const debit = debitMicrosForUsage(usage, pricing, apiMarginFor(model));
      if (debit > 0) {
        await recordCredit({
          userId: auth.userId,
          amountMicros: -debit,
          type: "debit",
          description: `api · ${model} · ${usage.inputTokens ?? 0}+${usage.outputTokens ?? 0} tok`,
          ref: id,
        });
      }
    } catch (error) {
      console.error("[/v1/chat/completions] meter error", error);
    }
  };

  // ── Non-streaming ──────────────────────────────────────────────────────────
  if (!body.stream) {
    try {
      const { text, usage, finishReason, response } =
        await generateText(shared);
      await meter(usage);
      // Confidential calls return an x-receipt-id (TEE attestation receipt) —
      // pass it through so callers can later verify the run (v3 verifier).
      const receiptId = response?.headers?.["x-receipt-id"];
      return Response.json(
        {
          id,
          object: "chat.completion",
          created,
          model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: text },
              finish_reason: mapFinishReason(finishReason),
            },
          ],
          usage: {
            prompt_tokens: usage.inputTokens ?? 0,
            completion_tokens: usage.outputTokens ?? 0,
            total_tokens: usage.totalTokens ?? 0,
          },
        },
        receiptId ? { headers: { "x-receipt-id": receiptId } } : undefined
      );
    } catch (error) {
      console.error("[/v1/chat/completions] non-stream error", error);
      return openAiError(
        502,
        "Upstream model error.",
        "api_error",
        "upstream_error"
      );
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
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = streamText(shared);
        controller.enqueue(encoder.encode(chunk({ role: "assistant" }, null)));
        for await (const delta of result.textStream) {
          controller.enqueue(encoder.encode(chunk({ content: delta }, null)));
        }
        const finishReason = await result.finishReason;
        controller.enqueue(
          encoder.encode(chunk({}, mapFinishReason(finishReason)))
        );

        const usage = await result.usage;
        if (includeUsage) {
          // Streaming can't add trailing HTTP headers, so the TEE receipt rides
          // the final usage chunk (when present) for confidential calls.
          const receiptId = (await result.response)?.headers?.["x-receipt-id"];
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                id,
                object: "chat.completion.chunk",
                created,
                model,
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
                message: "Upstream model error.",
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
    },
  });
}
