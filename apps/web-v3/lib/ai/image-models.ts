/**
 * Image model registry + deterministic auto-select (SPEC_AUDRIC_IMAGE_PIPELINE
 * §2.2). SFW set is ALL on the Vercel AI Gateway (no extra provider/key). The
 * selector is a small deterministic function (NOT an LLM call) keyed on the
 * prompt style + an optional model hint. The mature/uncensored set (fal.ai) is
 * Phase 3 and intentionally NOT here yet.
 */

export type ImageStrength =
  | "photoreal"
  | "fast"
  | "illustration"
  | "design"
  | "art";

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export type ImageModel = {
  id: string;
  label: string;
  provider: string;
  strengths: ImageStrength[];
  /** Adult/uncensored model (paid-only). All SFW for now (Phase 3 adds mature). */
  mature: boolean;
  /** Approximate USD per image (for metering/cost awareness). */
  costPerImage: number;
  /** Aspect ratios this model supports (validates the request; see §2.2). */
  aspectRatios: AspectRatio[];
};

const ALL_RATIOS: AspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "3:4"];

/** SFW lineup — all served natively by the Vercel AI Gateway. */
export const IMAGE_MODELS: ImageModel[] = [
  {
    id: "openai/gpt-image-2",
    label: "GPT Image 2",
    provider: "openai",
    strengths: ["photoreal", "art"],
    mature: false,
    costPerImage: 0.04,
    aspectRatios: ALL_RATIOS,
  },
  {
    id: "prodia/flux-fast-schnell",
    label: "Flux Schnell",
    provider: "prodia",
    strengths: ["fast"],
    mature: false,
    costPerImage: 0.003,
    aspectRatios: ["1:1", "16:9", "9:16"],
  },
  {
    id: "bfl/flux-2-pro",
    label: "Flux 2 Pro",
    provider: "bfl",
    strengths: ["photoreal", "art"],
    mature: false,
    costPerImage: 0.05,
    aspectRatios: ALL_RATIOS,
  },
  {
    id: "google/imagen-4.0-generate-001",
    label: "Imagen 4",
    provider: "google",
    strengths: ["photoreal"],
    mature: false,
    costPerImage: 0.04,
    aspectRatios: ALL_RATIOS,
  },
  {
    id: "recraft/recraft-v4",
    label: "Recraft v4",
    provider: "recraft",
    strengths: ["illustration", "design"],
    mature: false,
    costPerImage: 0.04,
    aspectRatios: ["1:1", "16:9", "9:16"],
  },
  {
    id: "xai/grok-imagine-image-pro",
    label: "Grok Imagine",
    provider: "xai",
    strengths: ["art", "photoreal"],
    mature: false,
    costPerImage: 0.05,
    aspectRatios: ["1:1", "16:9", "9:16"],
  },
];

/** Default model (quality; used for all tiers — free users get the good models
 * too, bounded by the daily cap, not a downgraded model). */
export const DEFAULT_IMAGE_MODEL = "openai/gpt-image-2";

/** Free-tier images/day (signed-in, no credits). Derived from image Documents;
 * resets at UTC midnight. Paid/credit users are not capped here. */
export const FREE_DAILY_IMAGE_LIMIT = 10;

export function getImageModel(id?: string): ImageModel | undefined {
  return id ? IMAGE_MODELS.find((m) => m.id === id) : undefined;
}

const DESIGN_RE =
  /\b(logo|icon|vector|poster|sticker|infographic|typography|text|flat design|app icon|banner|brand)\b/i;
const ART_RE =
  /\b(anime|manga|comic|cartoon|illustration|painting|concept art|stylized|sketch|watercolou?r|oil painting)\b/i;

/**
 * Pick the best SFW model for a prompt. Deterministic: explicit hint wins (if a
 * valid SFW model), then style cues, else the quality default.
 */
export function selectImageModel({
  prompt,
  hint,
}: {
  prompt: string;
  hint?: string;
}): ImageModel {
  const fallback =
    getImageModel(DEFAULT_IMAGE_MODEL) ?? (IMAGE_MODELS[0] as ImageModel);
  const hinted = getImageModel(hint);
  if (hinted && !hinted.mature) {
    return hinted;
  }
  if (DESIGN_RE.test(prompt)) {
    return getImageModel("recraft/recraft-v4") ?? fallback;
  }
  if (ART_RE.test(prompt)) {
    return getImageModel("xai/grok-imagine-image-pro") ?? fallback;
  }
  return fallback;
}

/** Clamp a requested aspect ratio to one the model supports (default 1:1). */
export function resolveAspectRatio(
  model: ImageModel,
  requested?: string
): AspectRatio | undefined {
  if (!requested) {
    return;
  }
  return model.aspectRatios.includes(requested as AspectRatio)
    ? (requested as AspectRatio)
    : "1:1";
}
