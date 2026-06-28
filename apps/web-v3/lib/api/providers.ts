import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { ModelPricing } from "@/lib/ai/models";
import { getLanguageModel } from "@/lib/ai/providers";
import { apiModels, getApiModel } from "@/lib/api/models";
import { env } from "@/lib/env";

/**
 * Private API inference provider resolver (SPEC_AUDRIC_API v1.5).
 *
 * v1 routes every model through the Vercel AI Gateway (ZDR). v1.5 adds a SECOND
 * provider — Phala-direct confidential inference (GPU-TEE, OpenAI-compatible) —
 * for the `phala/*` model tier. Everything else stays on the Gateway. This is
 * the per-model direct-source pattern (consume Phala-direct, no own gateway —
 * the v3 attested-gateway is a separate, later build).
 */

const PHALA_BASE_URL = "https://inference.phala.com/v1";

/** A model id served by Phala's confidential (GPU-TEE) endpoint. */
export function isConfidentialModel(id: string): boolean {
  return id.startsWith("phala/");
}

/** Is the confidential tier available (Phala key configured)? */
export function isConfidentialConfigured(): boolean {
  return Boolean(env.PHALA_API_KEY);
}

let phalaProvider: ReturnType<typeof createOpenAICompatible> | null = null;
function getPhalaProvider() {
  if (!phalaProvider) {
    phalaProvider = createOpenAICompatible({
      name: "phala",
      baseURL: PHALA_BASE_URL,
      apiKey: env.PHALA_API_KEY,
    });
  }
  return phalaProvider;
}

/**
 * Resolve a model id to its serving language model:
 * - `phala/*` → Phala-direct confidential endpoint (GPU-TEE).
 * - everything else → the Vercel AI Gateway (ZDR applied by the caller).
 */
export function getInferenceModel(modelId: string): LanguageModel {
  if (isConfidentialModel(modelId)) {
    // Translate our `phala/*` alias → the real Phala upstream slug.
    const upstream = getApiModel(modelId)?.upstream ?? modelId;
    return getPhalaProvider().chatModel(upstream);
  }
  return getLanguageModel(modelId);
}

// A per-1M price above this is implausible for the open-weight confidential
// catalog (the priciest is ~$2.40/1M) → it signals a units mismatch in the
// upstream response (per-1K vs per-token). We IGNORE such a live value (keep the
// vetted fallback) rather than risk a ~1000× overcharge (financial-amounts rule).
const PHALA_MAX_PLAUSIBLE_PER_1M = 100;

// Vetted fallback prices (USD per 1M tokens), keyed by OUR `phala/*` alias id,
// from Phala's live catalog (2026-06). The live fetch overrides these, but they
// guarantee confidential calls NEVER meter at $0 (revenue leak) and never vanish
// from `/v1/models` if the live fetch fails. Keep in sync with the confidential
// entries in `lib/api/models.ts`.
const PHALA_FALLBACK_PRICING: Record<string, ModelPricing> = {
  "phala/glm-5.2": { inputPer1M: 1.4, outputPer1M: 4.4 },
  "phala/gpt-oss-120b": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "phala/deepseek-v3.2": { inputPer1M: 1.0, outputPer1M: 1.0 },
  "phala/qwen3.5-27b": { inputPer1M: 0.3, outputPer1M: 2.4 },
  "phala/uncensored-24b": { inputPer1M: 0.2, outputPer1M: 0.9 },
};

/**
 * Per-model pricing for the confidential (Phala) catalog (USD per 1M tokens),
 * keyed by OUR `phala/*` alias id. Seeded with vetted fallbacks (so metering is
 * NEVER $0), then overridden by a live fetch of `inference.phala.com/v1/models`
 * (`pricing.{prompt,completion}` as USD-per-token), matched by each model's
 * UPSTREAM slug. Cached 24h. Returns {} only when the key is unset; on any fetch
 * failure the fallbacks remain — never throws, never zeroes.
 */
export async function getPhalaPricing(): Promise<Record<string, ModelPricing>> {
  if (!env.PHALA_API_KEY) {
    return {};
  }
  const out: Record<string, ModelPricing> = { ...PHALA_FALLBACK_PRICING };
  // upstream slug → our alias id (only confidential models have `upstream`).
  const upstreamToAlias = new Map(
    apiModels.filter((m) => m.upstream).map((m) => [m.upstream as string, m.id])
  );
  try {
    const res = await fetch(`${PHALA_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${env.PHALA_API_KEY}` },
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      return out;
    }
    const json = await res.json();
    for (const m of (json.data ?? []) as Array<{
      id: string;
      context_length?: number;
      context_window?: number;
      pricing?: { prompt?: string; completion?: string };
    }>) {
      const alias = upstreamToAlias.get(m.id);
      if (!alias) {
        continue;
      }
      const input = Number(m.pricing?.prompt) * 1_000_000;
      const output = Number(m.pricing?.completion) * 1_000_000;
      // Only override the fallback with a live price that is present AND sane.
      if (
        !(Number.isFinite(input) && Number.isFinite(output)) ||
        input > PHALA_MAX_PLAUSIBLE_PER_1M ||
        output > PHALA_MAX_PLAUSIBLE_PER_1M
      ) {
        continue;
      }
      out[alias] = {
        inputPer1M: input,
        outputPer1M: output,
        contextWindow: m.context_window ?? m.context_length,
      };
    }
    return out;
  } catch {
    return out;
  }
}
