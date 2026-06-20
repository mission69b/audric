import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { customProvider, gateway } from "ai";
import { isTestEnvironment } from "../constants";
import { env } from "../env";
import {
  confidentialModels,
  isConfidentialModel,
  type ModelPricing,
  titleModel,
} from "./models";

export const myProvider = isTestEnvironment
  ? (() => {
      const { chatModel, titleModel } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": titleModel,
        },
      });
    })()
  : null;

const REDPILL_BASE_URL = "https://api.redpill.ai/v1";

/** Confidential (TEE) tier is live only when the RedPill key is set. Server-only
 * (reads a server-only env var) — surface to the client via /api/models. */
export function isConfidentialConfigured(): boolean {
  return Boolean(env.REDPILL_API_KEY);
}

// Lazily constructed so an unset key (the default) never touches the provider.
let redpillProvider:
  | ReturnType<typeof createOpenAICompatible>
  | null
  | undefined;
function getRedpill() {
  if (redpillProvider === undefined) {
    redpillProvider = env.REDPILL_API_KEY
      ? createOpenAICompatible({
          name: "redpill",
          baseURL: REDPILL_BASE_URL,
          apiKey: env.REDPILL_API_KEY,
        })
      : null;
  }
  return redpillProvider;
}

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  // Confidential models route DIRECTLY to the TEE provider (not the Gateway).
  const redpill = getRedpill();
  if (redpill && isConfidentialModel(modelId)) {
    return redpill.chatModel(modelId);
  }

  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return gateway.languageModel(titleModel.id);
}

type RedpillCatalogModel = {
  id: string;
  context_length?: number;
  pricing?: { prompt?: string | number; completion?: string | number };
};

/**
 * Per-token pricing for the confidential lineup, from RedPill's live catalog
 * (`GET /v1/models`, OpenAI-style `pricing.prompt`/`completion` per token →
 * normalized to per-1M). Returns {} when the tier is unconfigured or on any
 * failure — never throws, so the switcher degrades to no-price. Cached 24h.
 */
export async function getConfidentialPricing(): Promise<
  Record<string, ModelPricing>
> {
  if (!isConfidentialConfigured()) {
    return {};
  }
  try {
    const res = await fetch(`${REDPILL_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${env.REDPILL_API_KEY}` },
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      return {};
    }
    const json = await res.json();
    const wanted = new Set(confidentialModels.map((m) => m.id));
    const out: Record<string, ModelPricing> = {};
    for (const m of (json.data ?? []) as RedpillCatalogModel[]) {
      if (!wanted.has(m.id)) {
        continue;
      }
      const input = Number(m.pricing?.prompt);
      const output = Number(m.pricing?.completion);
      if (Number.isFinite(input) && Number.isFinite(output)) {
        out[m.id] = {
          inputPer1M: input * 1_000_000,
          outputPer1M: output * 1_000_000,
          contextWindow:
            typeof m.context_length === "number" ? m.context_length : undefined,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export type TeeReceipt = {
  /** TEE signing address / public key that signed this response. */
  signingAddress: string;
  /** Signature over `text` (request_hash:response_hash). */
  signature: string;
  /** Signature algorithm (e.g. `ecdsa`). */
  signingAlgo: string;
};

/**
 * Fetch the TEE-signed receipt for a confidential completion (RedPill
 * `GET /v1/signature/{request_id}`). The signature proves the response was
 * produced + signed inside the attested TEE — bind `signingAddress` to a fresh
 * attestation report (`/v1/attestation/report`) for production-grade proof.
 * Returns null on any failure (no key, provider error, unexpected shape) so the
 * caller simply shows no receipt — never throws.
 */
export async function fetchTeeReceipt(
  requestId: string,
  model: string
): Promise<TeeReceipt | null> {
  if (!(isConfidentialConfigured() && requestId)) {
    return null;
  }
  try {
    const url = `${REDPILL_BASE_URL}/signature/${encodeURIComponent(
      requestId
    )}?model=${encodeURIComponent(model)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.REDPILL_API_KEY}` },
    });
    if (!res.ok) {
      return null;
    }
    const json = (await res.json()) as {
      signature?: string;
      signing_address?: string;
      signing_algo?: string;
    };
    if (!(json.signature && json.signing_address)) {
      return null;
    }
    return {
      signingAddress: json.signing_address,
      signature: json.signature,
      signingAlgo: json.signing_algo ?? "ecdsa",
    };
  } catch {
    return null;
  }
}
