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
// every chat — prompts never stored/trained on). `anon` is the legacy
// "may retain anonymized" label, kept for any model without a ZDR provider.
export type ModelPrivacyTier = "anon" | "private" | "local";

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
  /** Reads images. Used by the router to send image attachments to a capable
   * model on Auto, and by the composer to gate image (not PDF) uploads.
   * (Live capabilities are fetched from the Gateway; this is the routing hint.) */
  vision?: boolean;
  /** Per-model credit margin (charged = Gateway base × margin). Set to land the
   * model a few % UNDER Venice's retail while keeping ≥10% margin (the per-model
   * undercut-Venice rule — SPEC_AUDRIC_API). Falls back to `CREDIT_MARGIN` (1.4)
   * when unset. Margin-based (not absolute) so the price auto-tracks our cost. */
  margin?: number;
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
    id: "xai/grok-4.3",
    name: "Grok 4.3",
    provider: "xai",
    description: "Fast, capable model with tool use & vision",
    gatewayOrder: ["xai"],
    privacy: "private",
    tier: "smart",
    vision: true,
    margin: 1.1,
    bestFor: "Fast & capable",
  },
  {
    id: "anthropic/claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "anthropic",
    description: "Balanced Claude — fast, strong writing & tools",
    gatewayOrder: ["anthropic", "bedrock"],
    privacy: "private",
    tier: "smart",
    vision: true,
    margin: 1.3,
    bestFor: "Balanced & fast",
  },
  {
    id: "anthropic/claude-fable-5",
    name: "Claude Fable 5",
    provider: "anthropic",
    description: "Frontier model — top-tier coding & writing",
    // Cross-provider fallback (gateway `order`): if Anthropic errors/rate-limits,
    // the gateway retries the same model on Bedrock. Resilience, not a bandaid.
    gatewayOrder: ["anthropic", "bedrock"],
    privacy: "private",
    tier: "smart",
    frontier: true,
    vision: true,
    margin: 1.3,
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
    margin: 1.2,
    bestFor: "All-round + vision",
  },
  // Gemini 3 Pro removed from the chat lineup: unreliable on multi-step / multi-
  // turn TOOL conversations on this stack (intermittent "empty parts" stream
  // crashes after a tool result, esp. on replayed history) despite the ai@6.0.208
  // upgrade + thought-signature handling + provider fallback. Opus + GPT-5.5
  // cover the frontier tier. (The separate google/gemini-2.5-flash-image model
  // used for image editing is unaffected — different model, works fine.)
];

/** Every selectable GATEWAY (ZDR) model. NOTE: the Confidential/TEE tier is NOT a
 * gateway model here — it shipped 2026-07-01 (S.593) as a separate path: the
 * composer "Confidential" toggle routes to a `phala/*` GPU-TEE model via
 * `lib/api/providers.ts` `getInferenceModel` + `lib/api/confidential-chat.ts`
 * (catalog in `lib/api/models.ts`, distinct from this gateway list). This
 * `ModelPrivacyTier` union stays anon|private|local by design — confidential is a
 * mode toggle, not a gateway privacy tier. */
export const allChatModels: ChatModel[] = [...chatModels];

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
