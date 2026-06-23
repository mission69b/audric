/**
 * Audric Intelligence — the per-turn ROUTER (SPEC_AUDRIC_INTELLIGENCE §3a, P1).
 *
 * When the user is on "Auto", this classifies the turn (fast, on the free model)
 * and picks the best model + reasoning-effort + step budget the user is entitled
 * to. It runs ONCE per turn, before `streamText` — no Agent-class migration; the
 * route keeps its HITL/resumable/metering wrapper.
 *
 * Rules (binding, from the spec):
 * - Entitlement: only route among models the user can actually use right now
 *   (free models always; premium only when `canUsePremium`). Never route to a
 *   model the credit/anon gate would then block.
 * - When there's only one candidate (anon / free-no-credit), SKIP the classify
 *   entirely — no cost, no latency. Routing intelligence is a funded-tier perk.
 * - Model selection derives from `chatModels` metadata (free / tier / frontier),
 *   so adding a model never strands the router (single source of truth).
 */
import { generateObject } from "ai";
import { z } from "zod";
import {
  type ChatModel,
  chatModels,
  DEFAULT_CHAT_MODEL,
} from "@/lib/ai/models";
import { getLanguageModel } from "@/lib/ai/providers";

/**
 * The classifier model — cheap, fast, and RELIABLE at structured output.
 * NOT the free model (Kimi): it can't do `generateObject` via the gateway ("No
 * object generated"), which would fail-closed the router every turn. DeepSeek
 * V3.2 is cheap + reliable (9/10 on `scripts/router-eval.mts`). The classify
 * runs only for funded users (single-candidate turns short-circuit) and is a
 * tiny un-metered platform cost (~$0.0001/turn), not charged to the user.
 */
const CLASSIFIER_MODEL = "deepseek/deepseek-v3.2";

export type RouteDecision = {
  /** Concrete model id to run the turn on. */
  modelId: string;
  /** Reasoning effort to apply (openai-family models only). */
  reasoningEffort?: "low" | "medium" | "high";
  /** Loop step budget for `stopWhen`. */
  stepBudget: number;
  /** True iff the classifier actually ran (vs a single-candidate shortcut). */
  routed: boolean;
  classification?: {
    intent: string;
    complexity: string;
    needsDeepResearch: boolean;
  };
};

const classificationSchema = z.object({
  intent: z
    .enum(["chat", "research", "money", "code", "image"])
    .describe("The user's primary goal this turn."),
  complexity: z
    .enum(["trivial", "standard", "hard"])
    .describe(
      "trivial = greeting / one-liner / lookup. standard = normal Q&A or a single tool call. hard = genuine multi-step reasoning, analysis, non-trivial coding, or research."
    ),
  needsDeepResearch: z
    .boolean()
    .describe(
      "True only if it needs gathering AND synthesizing multiple live sources."
    ),
});

/** Models the user may be routed to right now (entitlement-aware). */
function candidatePool(canUsePremium: boolean): ChatModel[] {
  return chatModels.filter((m) => m.free || canUsePremium);
}

/** Pick the best candidate for a complexity tier, derived from model metadata. */
function pickModel(complexity: string, pool: ChatModel[]): ChatModel {
  const free = pool.find((m) => m.free) ?? pool[0];
  if (complexity === "trivial") {
    return free;
  }
  if (complexity === "hard") {
    return (
      pool.find((m) => m.frontier) ??
      pool.find((m) => m.tier === "smart") ??
      free
    );
  }
  // standard → a capable non-frontier "smart" model; fall back gracefully.
  return (
    pool.find((m) => m.tier === "smart" && !m.frontier) ??
    pool.find((m) => m.tier === "smart") ??
    free
  );
}

function stepBudgetFor(complexity: string, needsDeepResearch: boolean): number {
  if (needsDeepResearch) {
    return 12;
  }
  if (complexity === "hard") {
    return 6;
  }
  if (complexity === "trivial") {
    return 3;
  }
  return 5;
}

export async function routeTurn({
  userText,
  canUsePremium,
  hasImage,
}: {
  userText: string;
  canUsePremium: boolean;
  /** The turn includes an image attachment → must route to a vision model. */
  hasImage?: boolean;
}): Promise<RouteDecision> {
  const pool = candidatePool(canUsePremium);
  const free = pool.find((m) => m.free) ?? pool[0];

  // Image attached → route to a vision-capable model regardless of the text
  // (the classifier reads text only). If none is available to this user
  // (free/anon — vision models are premium), fall through; the composer warns
  // and the image arrives as a note via prepareAttachments.
  if (hasImage) {
    const vision = pool.find((m) => m.vision);
    if (vision) {
      return { modelId: vision.id, stepBudget: 5, routed: true };
    }
  }

  // Single candidate (anon / free-no-credit) → no classify (no cost / latency).
  if (pool.length <= 1) {
    return {
      modelId: pool[0]?.id ?? DEFAULT_CHAT_MODEL,
      stepBudget: 5,
      routed: false,
    };
  }

  const text = userText.trim().slice(0, 2000);
  if (!text) {
    return { modelId: free.id, stepBudget: 5, routed: false };
  }

  try {
    const { object } = await generateObject({
      model: getLanguageModel(CLASSIFIER_MODEL),
      schema: classificationSchema,
      system:
        "You are a routing classifier for an AI assistant. Classify ONLY the user's latest message so the system can pick the right model, effort, and step budget. Be decisive. Most everyday messages are 'standard'. Reserve 'hard' for genuine multi-step reasoning, analysis, non-trivial coding, or research. Do not answer the message.",
      prompt: text,
    });
    // Note: research turns get their model from the host (route.ts overrides to
    // a reasoning model for the visible research trace) — the router just picks
    // by complexity here.
    const model = pickModel(object.complexity, pool);
    const reasoningEffort =
      object.complexity === "hard" && model.provider === "openai"
        ? ("high" as const)
        : undefined;
    return {
      modelId: model.id,
      reasoningEffort,
      stepBudget: stepBudgetFor(object.complexity, object.needsDeepResearch),
      routed: true,
      classification: object,
    };
  } catch {
    // Classify failed → a safe, capable standard default (route up, not down).
    return {
      modelId: pickModel("standard", pool).id,
      stepBudget: 5,
      routed: false,
    };
  }
}
