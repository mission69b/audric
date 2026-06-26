/**
 * Video model registry + deterministic auto-select (standalone media capability;
 * AGENT_WEDGE §6a — decoupled from Audric Computer). Text→video via the Vercel AI
 * Gateway (`experimental_generateVideo` + `gateway.videoModel`), ZDR-consistent,
 * no extra key. Premium (Pro/credit) only — clips are $/sec-priced, so the free
 * 10/day image cap doesn't apply; video gates on `canUsePremium`.
 *
 * Default = Veo 3.1 Fast: the quality leader (+ native audio) at a sane price.
 * Seedance/Kling stay as cheap/fast hints. Costs = live Gateway pricing
 * (2026-06-26, /v1/models), representative 720p tier; drive the per-clip debit.
 */

import { CREDIT_MARGIN } from "@/lib/credit/meter";

export type VideoAspectRatio = "16:9" | "9:16" | "1:1";

export const VIDEO_ASPECT_RATIOS: VideoAspectRatio[] = ["16:9", "9:16", "1:1"];

export type VideoModel = {
  id: string;
  label: string;
  /** Representative USD/sec (720p) — for the per-clip credit debit. */
  costPerSecondUsd: number;
  /** Clip length used when the user doesn't specify one. */
  defaultSeconds: number;
  /** Max clip length this model supports (we clamp to it). */
  maxSeconds: number;
};

// Lean lineup (founder, 2026-06-26): Grok-only for paid + Seedance for free.
// Dropped Veo + Kling — Grok is fastest/cheapest/producer-rated, video is a
// commodity feature (not the moat), so a multi-model lineup wasn't worth the
// complexity. (Re-add Veo here in minutes IF "video with sound" becomes a real
// ask — it's the only model that generates audio.)
export const VIDEO_MODELS: VideoModel[] = [
  {
    id: "xai/grok-imagine-video",
    label: "Grok Imagine",
    costPerSecondUsd: 0.07,
    defaultSeconds: 6,
    maxSeconds: 10,
  },
  {
    id: "bytedance/seedance-v1.5-pro",
    label: "Seedance 1.5 Pro",
    costPerSecondUsd: 0.0259,
    defaultSeconds: 5,
    maxSeconds: 12,
  },
];

/** The single paid default — Grok Imagine (fastest + cheapest + producer-rated). */
export const DEFAULT_VIDEO_MODEL = "xai/grok-imagine-video";

/** Free-tier video runs on the CHEAP model (~$0.13/clip) — the cost lever that
 * makes a daily free taste viable. Premium models stay paid-only. */
export const FREE_VIDEO_MODEL = "bytedance/seedance-v1.5-pro";

/** Free (no-credit) users get 1 video/day (separate from the 10/day image cap —
 * different cost class). Derived from `video:` ledger rows; resets UTC midnight. */
export const FREE_DAILY_VIDEO_LIMIT = 1;

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

/** Clamp a requested clip length to the model's supported range (min 2s). */
export function resolveDuration(model: VideoModel, requested?: number): number {
  const secs = requested ?? model.defaultSeconds;
  return Math.min(Math.max(Math.round(secs), 2), model.maxSeconds);
}

/** Micro-USD to debit for one clip: cost/sec × seconds × margin. */
export function videoCostMicros(model: VideoModel, seconds: number): number {
  return Math.round(
    model.costPerSecondUsd * seconds * 1_000_000 * CREDIT_MARGIN
  );
}
