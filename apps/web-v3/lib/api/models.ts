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

// Privacy posture per model:
// - "private"      → ZDR via the Vercel Gateway (provider contractually can't
//                    store/train; the v1 baseline).
// - "confidential" → GPU-TEE via Phala-direct (`phala/*`), hardware-isolated +
//                    `x-receipt-id` attestation receipt (v1.5; consumed, not
//                    yet self-verifiable — the verifier is v3).
export type ApiModelPrivacy = "private" | "confidential";

export type ApiModel = {
  /** Live model id — Vercel Gateway (provider/model) or Phala (`phala/*`). */
  id: string;
  name: string;
  tier: ApiModelTier;
  privacy: ApiModelPrivacy;
  /** charged = base × margin (see meter.ts `debitMicrosForUsage`). */
  margin: number;
};

export const apiModels: ApiModel[] = [
  // ── Tier A — Open (the hero: privacy + margin + agent demand) ──────────────
  {
    id: "zai/glm-5.2",
    name: "GLM 5.2",
    tier: "open",
    privacy: "private",
    margin: 1.4,
  },
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    tier: "open",
    privacy: "private",
    margin: 1.4,
  },
  {
    id: "moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    tier: "open",
    privacy: "private",
    margin: 1.4,
  },
  {
    id: "alibaba/qwen3-max",
    name: "Qwen3 Max",
    tier: "open",
    privacy: "private",
    margin: 1.4,
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT-OSS 120B",
    tier: "open",
    privacy: "private",
    margin: 1.4,
  },
  // ── Tier B — Frontier/closed (one-key completeness; thin near-floor margin) ─
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    tier: "frontier",
    privacy: "private",
    margin: 1.15,
  },
  {
    id: "anthropic/claude-opus-4.8",
    name: "Claude Opus 4.8",
    tier: "frontier",
    privacy: "private",
    margin: 1.15,
  },
  {
    id: "openai/gpt-5.5",
    name: "GPT-5.5",
    tier: "frontier",
    privacy: "private",
    margin: 1.2,
  },
  {
    id: "google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    tier: "frontier",
    privacy: "private",
    margin: 1.12,
  },
  {
    id: "xai/grok-4.3",
    name: "Grok 4.3",
    tier: "frontier",
    privacy: "private",
    margin: 1.1,
  },
  // ── Confidential (v1.5) — GPU-TEE via Phala-direct (`phala/*`) ──────────────
  // Open-weight models in a hardware enclave. Surfaced only when PHALA_API_KEY
  // is set AND the id is live in Phala's catalog (the route intersects both).
  {
    id: "phala/gpt-oss-120b",
    name: "GPT-OSS 120B (Confidential)",
    tier: "open",
    privacy: "confidential",
    margin: 1.4,
  },
  {
    id: "phala/glm-4.7-flash",
    name: "GLM 4.7 Flash (Confidential)",
    tier: "open",
    privacy: "confidential",
    margin: 1.4,
  },
  {
    id: "phala/qwen3.5-27b",
    name: "Qwen3.5 27B (Confidential)",
    tier: "open",
    privacy: "confidential",
    margin: 1.4,
  },
  {
    id: "phala/uncensored-24b",
    name: "Uncensored 24B (Confidential)",
    tier: "open",
    privacy: "confidential",
    margin: 1.4,
  },
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
