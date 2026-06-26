/**
 * Video model registry + deterministic auto-select (standalone media capability;
 * AGENT_WEDGE §6a — decoupled from Audric Computer). Text→video via the Vercel AI
 * Gateway (`experimental_generateVideo` + `gateway.videoModel`), ZDR-consistent,
 * no extra key. Premium (Pro/credit) only — clips are $/sec-priced, so the free
 * 10/day image cap doesn't apply; video gates on `canUsePremium`.
 *
 * Costs = live Gateway pricing (2026-06-26, /v1/models), representative tier
 * (720p, no audio). Used to debit a flat per-clip credit charge on success.
 */

import { CREDIT_MARGIN } from "@/lib/credit/meter";

export type VideoAspectRatio = "16:9" | "9:16" | "1:1";

export const VIDEO_ASPECT_RATIOS: VideoAspectRatio[] = ["16:9", "9:16", "1:1"];

export type VideoModel = {
  id: string;
  label: string;
  /** Representative USD/sec (720p, no audio) — for the per-clip credit debit. */
  costPerSecondUsd: number;
};

/** Assumed clip length for the flat per-clip cost estimate (v1 doesn't expose a
 * duration control; models emit a short default ~5s). Refine from
 * providerMetadata if we later surface duration. */
export const VIDEO_CLIP_SECONDS = 5;

/** v1 lineup — all via the Gateway. Seedance = the cheap fast default; Kling +
 * Veo-fast are quality step-ups via an explicit model hint. */
export const VIDEO_MODELS: VideoModel[] = [
  {
    id: "bytedance/seedance-v1.5-pro",
    label: "Seedance 1.5 Pro",
    costPerSecondUsd: 0.0259,
  },
  {
    id: "klingai/kling-v2.5-turbo-t2v",
    label: "Kling 2.5 Turbo",
    costPerSecondUsd: 0.042,
  },
  {
    id: "google/veo-3.1-fast-generate-001",
    label: "Veo 3.1 Fast",
    costPerSecondUsd: 0.1,
  },
];

/** Cheap, fast, verified text→video default. */
export const DEFAULT_VIDEO_MODEL = "bytedance/seedance-v1.5-pro";

export function getVideoModel(id?: string): VideoModel | undefined {
  return id ? VIDEO_MODELS.find((m) => m.id === id) : undefined;
}

/** Explicit valid hint wins, else the default. Deterministic (no LLM call). */
export function selectVideoModel(hint?: string): VideoModel {
  return (
    getVideoModel(hint) ??
    getVideoModel(DEFAULT_VIDEO_MODEL) ??
    (VIDEO_MODELS[0] as VideoModel)
  );
}

/** Micro-USD to debit for one clip: cost/sec × clip seconds × margin. */
export function videoCostMicros(model: VideoModel): number {
  return Math.round(
    model.costPerSecondUsd * VIDEO_CLIP_SECONDS * 1_000_000 * CREDIT_MARGIN
  );
}
