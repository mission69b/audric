export const DEFAULT_CHAT_MODEL = "moonshotai/kimi-k2.5";

// "Auto" — the intelligent default. Not a real model: when selected, the server
// router (lib/ai/intelligence/router.ts) classifies the turn and picks the best
// model the user is entitled to. Kept OUT of `chatModels` so it never hits the
// gateway capability/pricing fetches; injected into the switcher + allow-list.
export const AUTO_MODEL_ID = "auto";
export const AUTO_MODEL: ChatModel = {
  id: AUTO_MODEL_ID,
  name: "Auto",
  provider: "audric",
  description: "Picks the best model for each task",
  tier: "smart",
  bestFor: "Smartest default",
};

export const titleModel = {
  id: "moonshotai/kimi-k2.5",
  name: "Kimi K2.5",
  provider: "moonshotai",
  description: "Fast model for title generation",
  gatewayOrder: ["fireworks", "bedrock"],
};

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

// Audric v3 (SPEC_AUDRIC_V3 §5/§5c + SPEC_AUDRIC_MODEL_SWITCHER): the switcher
// is the "privacy storefront". Every model carries an HONEST privacy badge and
// a tier. At launch every model rides the Vercel AI Gateway, so the only honest
// label is `anon` (gateway-routed; upstream may retain anonymized prompts) —
// NEVER overclaim "private". The `private` (zero-retention partner) + `local`
// (self-hosted) tiers are fast-follows; the type carries them now so the badge
// UI is forward-compatible.
// Privacy ladder (§5c). `private` = Zero Data Retention via the Gateway (ON for
// every chat — prompts never stored/trained on). `confidential` = the coming
// TEE rung (even the provider can't read it; verifiable). `anon` is the legacy
// "may retain anonymized" label, kept for any model without a ZDR provider.
export type ModelPrivacyTier = "anon" | "private" | "confidential" | "local";

// `fast` = the zero-credit acquisition model (Kimi); `smart` = premium,
// per-1k-token credit-metered (the metering itself lands in Phase 5 — here the
// tier only drives labeling + the free/cost display).
export type ModelTier = "fast" | "smart";

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  gatewayOrder?: string[];
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  /** Honest privacy label shown as a badge in the switcher. */
  privacy?: ModelPrivacyTier;
  /** Fast (free) vs Smart (metered) — drives the free/cost display. */
  tier?: ModelTier;
  /** Zero-credit model (the free acquisition tier). Only Kimi at launch. */
  free?: boolean;
  /** Short "which model for which task" hint shown in the switcher. */
  bestFor?: string;
  /** Premium frontier model — gated to credit/paid tiers. */
  frontier?: boolean;
  /** Routes DIRECTLY to the TEE provider (RedPill/Phala), not the Gateway.
   * Confidential models are inert until REDPILL_API_KEY is set — see
   * `isConfidentialConfigured()` in providers.ts. */
  confidential?: boolean;
  /** Reads images. Used by the router to send image attachments to a capable
   * model on Auto, and by the composer to gate image (not PDF) uploads.
   * (Live capabilities are fetched from the Gateway; this is the routing hint.) */
  vision?: boolean;
};

export const chatModels: ChatModel[] = [
  {
    id: "moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    provider: "moonshotai",
    description: "Fast, uncensored open model — free",
    gatewayOrder: ["fireworks", "bedrock"],
    privacy: "private",
    tier: "fast",
    free: true,
    bestFor: "Fast & free",
  },
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "deepseek",
    description: "Fast and capable model with tool use",
    gatewayOrder: ["bedrock", "deepinfra"],
    privacy: "private",
    tier: "smart",
    bestFor: "Capable & cheap",
  },
  {
    id: "xai/grok-4.1-fast-non-reasoning",
    name: "Grok 4.1 Fast",
    provider: "xai",
    description: "Fast non-reasoning model with tool use",
    gatewayOrder: ["xai"],
    privacy: "private",
    tier: "smart",
    bestFor: "Quick answers",
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    provider: "openai",
    description: "Open-source 120B reasoning model",
    gatewayOrder: ["fireworks", "bedrock"],
    reasoningEffort: "low",
    privacy: "private",
    tier: "smart",
    bestFor: "Open reasoning",
  },
  {
    id: "anthropic/claude-opus-4.8",
    name: "Claude Opus 4.8",
    provider: "anthropic",
    description: "Frontier model — top-tier coding & writing",
    // Cross-provider fallback (gateway `order`): if Anthropic errors/rate-limits,
    // the gateway retries the same model on Bedrock. Resilience, not a bandaid.
    gatewayOrder: ["anthropic", "bedrock"],
    privacy: "private",
    tier: "smart",
    frontier: true,
    vision: true,
    bestFor: "Code & writing",
  },
  {
    id: "openai/gpt-5.5",
    name: "GPT-5.5",
    provider: "openai",
    description: "Frontier all-round model with vision",
    privacy: "private",
    tier: "smart",
    frontier: true,
    vision: true,
    bestFor: "All-round + vision",
  },
  // Gemini 3 Pro removed from the chat lineup: unreliable on multi-step / multi-
  // turn TOOL conversations on this stack (intermittent "empty parts" stream
  // crashes after a tool result, esp. on replayed history) despite the ai@6.0.208
  // upgrade + thought-signature handling + provider fallback. Opus + GPT-5.5
  // cover the frontier tier. (The separate google/gemini-2.5-flash-image model
  // used for image editing is unaffected — different model, works fine.)
];

// Confidential (TEE) tier — the 3rd privacy rung (SPEC_AUDRIC_V3 §5c). These run
// ENTIRELY inside a Phala GPU TEE via RedPill's OpenAI-compatible API: even the
// provider can't read the prompt, and every response is TEE-signed (verifiable
// per request). They route directly to RedPill — NOT the Gateway — so they're
// inert until REDPILL_API_KEY is set (the switcher only surfaces them when the
// /api/models route reports `confidentialEnabled`). Model ids are the live
// RedPill catalog ids (`GET https://api.redpill.ai/v1/models`).
export const confidentialModels: ChatModel[] = [
  {
    id: "phala/qwen3.5-27b",
    name: "Qwen 3.5 27B",
    provider: "phala",
    description: "Capable multimodal model — runs entirely in a TEE",
    privacy: "confidential",
    tier: "smart",
    confidential: true,
    bestFor: "Capable + vision",
  },
  {
    id: "phala/glm-4.7-flash",
    name: "GLM 4.7 Flash",
    provider: "phala",
    description: "Fast confidential model in a TEE (attestation-verified)",
    privacy: "confidential",
    tier: "smart",
    confidential: true,
    bestFor: "Fast & private",
  },
  {
    id: "phala/gpt-oss-20b",
    name: "GPT-OSS 20B",
    provider: "phala",
    description: "Open reasoning model in a TEE (attestation-verified)",
    privacy: "confidential",
    tier: "smart",
    confidential: true,
    bestFor: "Open reasoning",
  },
];

const confidentialModelIds = new Set(confidentialModels.map((m) => m.id));

/** True when `id` is a confidential (TEE) model — routes to RedPill, not the
 * Gateway. Pure + client-safe (no env read). */
export function isConfidentialModel(id: string): boolean {
  return confidentialModelIds.has(id);
}

/** Every selectable model — gateway lineup + the confidential (TEE) lineup. */
export const allChatModels: ChatModel[] = [
  ...chatModels,
  ...confidentialModels,
];

export async function getCapabilities(): Promise<
  Record<string, ModelCapabilities>
> {
  const results = await Promise.all(
    chatModels.map(async (model) => {
      try {
        const res = await fetch(
          `https://ai-gateway.vercel.sh/v1/models/${model.id}/endpoints`,
          { next: { revalidate: 86_400 } }
        );
        if (!res.ok) {
          return [model.id, { tools: false, vision: false, reasoning: false }];
        }

        const json = await res.json();
        const endpoints = json.data?.endpoints ?? [];
        const params = new Set(
          endpoints.flatMap(
            (e: { supported_parameters?: string[] }) =>
              e.supported_parameters ?? []
          )
        );
        const inputModalities = new Set(
          json.data?.architecture?.input_modalities ?? []
        );

        return [
          model.id,
          {
            tools: params.has("tools"),
            vision: inputModalities.has("image"),
            reasoning: params.has("reasoning"),
          },
        ];
      } catch {
        return [model.id, { tools: false, vision: false, reasoning: false }];
      }
    })
  );

  return Object.fromEntries(results);
}

export type ModelPricing = {
  /** USD per 1M input tokens (Gateway `pricing.input` × 1e6). */
  inputPer1M: number;
  /** USD per 1M output tokens. */
  outputPer1M: number;
  /** Total context window (tokens) — Gateway `context_window`. */
  contextWindow?: number;
};

/**
 * Per-model pricing from the Gateway `/v1/models` endpoint (USD per token,
 * normalized to per-1M). Cached 24h like the capability fetch. The switcher
 * shows this as the honest, indicative per-1k/1M cost (§5c). Returns {} on any
 * failure so the UI degrades to no-price — never throws.
 */
export async function getModelPricing(): Promise<Record<string, ModelPricing>> {
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      return {};
    }
    const json = await res.json();
    const out: Record<string, ModelPricing> = {};
    for (const m of (json.data ?? []) as Array<{
      id: string;
      context_window?: number;
      pricing?: { input?: string; output?: string };
    }>) {
      const input = Number(m.pricing?.input);
      const output = Number(m.pricing?.output);
      if (Number.isFinite(input) && Number.isFinite(output)) {
        out[m.id] = {
          inputPer1M: input * 1_000_000,
          outputPer1M: output * 1_000_000,
          contextWindow:
            typeof m.context_window === "number" ? m.context_window : undefined,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export const isDemo = process.env.IS_DEMO === "1";

type GatewayModel = {
  id: string;
  name: string;
  type?: string;
  tags?: string[];
};

export type GatewayModelWithCapabilities = ChatModel & {
  capabilities: ModelCapabilities;
};

export async function getAllGatewayModels(): Promise<
  GatewayModelWithCapabilities[]
> {
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      return [];
    }

    const json = await res.json();
    return (json.data ?? [])
      .filter((m: GatewayModel) => m.type === "language")
      .map((m: GatewayModel) => ({
        id: m.id,
        name: m.name,
        provider: m.id.split("/")[0],
        description: "",
        capabilities: {
          tools: m.tags?.includes("tool-use") ?? false,
          vision: m.tags?.includes("vision") ?? false,
          reasoning: m.tags?.includes("reasoning") ?? false,
        },
      }));
  } catch {
    return [];
  }
}

export function getActiveModels(): ChatModel[] {
  return chatModels;
}

export const allowedModelIds = new Set([
  AUTO_MODEL_ID,
  ...allChatModels.map((m) => m.id),
]);

export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);
