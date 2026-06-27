/**
 * Private Inference API — the curated launch catalog (SPEC_AUDRIC_API v1).
 *
 * This is the API SURFACE, deliberately DIFFERENT from the consumer app's
 * 5-model switcher (`lib/ai/models.ts`): it adds the open / agent / coding
 * models developers run agents on (GLM #1, DeepSeek, Qwen, GPT-OSS) on top of
 * the frontier set. We curate ~10 — NOT Venice/RedPill's 250 (breadth is their
 * floor-play, not ours); add more on request.
 *
 * v1 sourcing = PURE Vercel Gateway passthrough (no custom adapters). Every id
 * below is a live Gateway model id. `/v1/models` returns the intersection of
 * this list with the live Gateway catalog, so we never advertise a model the
 * Gateway can't serve.
 *
 * Pricing reuses the in-app rule: charged = Gateway base × margin (the per-model
 * undercut-Venice rule, SPEC_AUDRIC_API). Open models carry a fatter margin
 * (Venice marks them up ~40%); frontier is thin/near-floor. Unlike the consumer
 * app, the API does NOT comp Kimi — the free tier is a consumer acquisition
 * lever, not an API feature; every API model is metered.
 */

export type ApiModelTier = "open" | "frontier";

export type ApiModel = {
  /** Live Vercel Gateway model id (provider/model). */
  id: string;
  name: string;
  tier: ApiModelTier;
  /** charged = Gateway base × margin (see meter.ts `debitMicrosForUsage`). */
  margin: number;
};

export const apiModels: ApiModel[] = [
  // ── Tier A — Open (the hero: privacy + margin + agent demand) ──────────────
  { id: "zai/glm-5.2", name: "GLM 5.2", tier: "open", margin: 1.4 },
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    tier: "open",
    margin: 1.4,
  },
  { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5", tier: "open", margin: 1.4 },
  { id: "alibaba/qwen3-max", name: "Qwen3 Max", tier: "open", margin: 1.4 },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT-OSS 120B",
    tier: "open",
    margin: 1.4,
  },
  // ── Tier B — Frontier/closed (one-key completeness; thin near-floor margin) ─
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    tier: "frontier",
    margin: 1.15,
  },
  {
    id: "anthropic/claude-opus-4.8",
    name: "Claude Opus 4.8",
    tier: "frontier",
    margin: 1.15,
  },
  { id: "openai/gpt-5.5", name: "GPT-5.5", tier: "frontier", margin: 1.2 },
  {
    id: "google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    tier: "frontier",
    margin: 1.12,
  },
  { id: "xai/grok-4.3", name: "Grok 4.3", tier: "frontier", margin: 1.1 },
];

const apiModelById = new Map(apiModels.map((m) => [m.id, m]));

/** Is this model id sold through the API? */
export function isApiModel(id: string): boolean {
  return apiModelById.has(id);
}

/** Resolve the credit margin for an API model (charged = base × margin). */
export function apiMarginFor(id: string): number {
  return apiModelById.get(id)?.margin ?? 1.4;
}

export function getApiModel(id: string): ApiModel | undefined {
  return apiModelById.get(id);
}
