import type { ModelMessage } from "ai";

/**
 * Gemini 3 thought-signature handling.
 *
 * Gemini 3 returns an opaque `thoughtSignature` on assistant tool-call (and
 * reasoning) parts that encodes its reasoning state. When the conversation is
 * REPLAYED on a later turn, that signature must be sent back on the same part —
 * Google requires it for tool-call replays (a missing one → HTTP 400) and warns
 * for reasoning parts otherwise. The real signature round-trips through
 * `providerOptions.google.thoughtSignature`; but any time a part is
 * reconstructed without it (lossy DB persistence, provider failover Vertex↔︎
 * Google, synthetic/seed turns), the next Gemini call breaks or warns.
 *
 * Fix (matches Google's documented escape hatch + vercel/ai #15550): for
 * Gemini 3, ensure every assistant tool-call/reasoning part carries a
 * thoughtSignature on the way to the model — KEEP the real one when present
 * (preserves true reasoning continuity), else inject Google's sentinel
 * `"skip_thought_signature_validator"` so the request is accepted and the
 * warning is silenced. No-op for non-Gemini-3 models; never overwrites a real
 * signature.
 */

const GEMINI_SENTINEL = "skip_thought_signature_validator";

/** Gemini 3 family (`google/gemini-3-pro-preview`, etc.) — the models that
 * enforce thought-signature replay. */
export function isGemini3(modelId: string): boolean {
  return /gemini-3/i.test(modelId);
}

export function ensureGeminiThoughtSignatures(
  messages: ModelMessage[]
): ModelMessage[] {
  return messages.map((message) => {
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      return message;
    }
    return {
      ...message,
      content: message.content.map((part) => {
        if (part.type !== "tool-call" && part.type !== "reasoning") {
          return part;
        }
        const google = part.providerOptions?.google as
          | { thoughtSignature?: unknown }
          | undefined;
        if (google?.thoughtSignature) {
          return part; // real signature present — preserve it untouched
        }
        return {
          ...part,
          providerOptions: {
            ...part.providerOptions,
            google: {
              ...part.providerOptions?.google,
              thoughtSignature: GEMINI_SENTINEL,
            },
          },
        };
      }),
    };
  });
}
