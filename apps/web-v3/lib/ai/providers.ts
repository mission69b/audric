import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { customProvider, gateway } from "ai";
import { isTestEnvironment } from "../constants";
import { env } from "../env";
import {
  confidentialModels,
  isConfidentialModel,
  type ModelCapabilities,
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
  is_tee?: boolean;
  input_modalities?: string[];
  supported_parameters?: string[];
  pricing?: { prompt?: string | number; completion?: string | number };
};

export type ConfidentialCatalog = {
  pricing: Record<string, ModelPricing>;
  capabilities: Record<string, ModelCapabilities>;
};

const EMPTY_CATALOG: ConfidentialCatalog = { pricing: {}, capabilities: {} };

/**
 * Pricing + capabilities for the confidential lineup, derived from RedPill's
 * live catalog (`GET /v1/models`) — the single source of truth, so we never
 * hardcode a model's modalities/tools. Pricing: OpenAI-style
 * `pricing.prompt`/`completion` per token → per-1M. Capabilities: tools +
 * reasoning from `supported_parameters`, vision from `input_modalities`.
 * Returns empties when unconfigured or on any failure — never throws (the
 * switcher degrades to no-price / no-cap-icons). Cached 24h.
 */
export async function getConfidentialCatalog(): Promise<ConfidentialCatalog> {
  if (!isConfidentialConfigured()) {
    return EMPTY_CATALOG;
  }
  try {
    const res = await fetch(`${REDPILL_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${env.REDPILL_API_KEY}` },
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      return EMPTY_CATALOG;
    }
    const json = await res.json();
    const wanted = new Set(confidentialModels.map((m) => m.id));
    const pricing: Record<string, ModelPricing> = {};
    const capabilities: Record<string, ModelCapabilities> = {};
    for (const m of (json.data ?? []) as RedpillCatalogModel[]) {
      if (!wanted.has(m.id)) {
        continue;
      }
      const input = Number(m.pricing?.prompt);
      const output = Number(m.pricing?.completion);
      if (Number.isFinite(input) && Number.isFinite(output)) {
        pricing[m.id] = {
          inputPer1M: input * 1_000_000,
          outputPer1M: output * 1_000_000,
          contextWindow:
            typeof m.context_length === "number" ? m.context_length : undefined,
        };
      }
      const params = new Set(m.supported_parameters ?? []);
      const modalities = new Set(m.input_modalities ?? []);
      capabilities[m.id] = {
        tools: params.has("tools"),
        vision: modalities.has("image"),
        reasoning: params.has("reasoning"),
      };
    }
    return { pricing, capabilities };
  } catch {
    return EMPTY_CATALOG;
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
