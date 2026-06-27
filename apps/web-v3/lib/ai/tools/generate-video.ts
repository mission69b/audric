import { experimental_generateVideo, gateway, tool } from "ai";
import { z } from "zod";
import type { Session } from "@/app/(auth)/auth";
import {
  FREE_DAILY_VIDEO_LIMIT,
  FREE_VIDEO_MODEL,
  resolveDuration,
  selectVideoModel,
  videoCostMicros,
} from "@/lib/ai/video-models";
import { putBlob } from "@/lib/blob";
import { countUserVideosToday, recordCredit } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";

type GenerateVideoProps = {
  // Nullable: anon users get a sign-in gate (no generation).
  session: Session | null;
  // Video is a Pro/credit capability (clips are $/sec). Free → upgrade gate.
  canUsePremium: boolean;
};

/**
 * Generate a short text→video clip (standalone media capability; AGENT_WEDGE §6a).
 * Mirrors generate_image: `experimental_generateVideo` + `gateway.videoModel`
 * through the Vercel Gateway (no extra key). The ~8MB mp4 is stored as a PRIVATE
 * blob (not a DB row) and rendered inline via the session-gated read URL. Premium
 * only; debits a flat per-clip credit charge on success. Runs on the existing
 * serverless route (maxDuration=300) — short clips finish well inside it.
 */
export const generateVideo = ({ session, canUsePremium }: GenerateVideoProps) =>
  tool({
    description:
      "Generate a short VIDEO clip from a text description. Use WHENEVER the user wants a video / clip / animation — 'make a video of …', 'animate …', 'create a clip'. Put a vivid SCENE + MOTION + mood description in `prompt`. CRITICAL: video models CANNOT render legible text, words, logos, UI, or taglines — they come out as garbled gibberish. NEVER ask for on-screen text/logos/captions, and do NOT promise the user any readable words in the clip; describe only the visual scene, subjects, camera motion, lighting, and style. (For a still image use generate_image; for text-on-image use generate_image too.) Free users get 1 video/day; Pro/credit users get more (their video credit covers it). Just call it — the tool handles the gate.",
    inputSchema: z.object({
      prompt: z
        .string()
        .describe(
          "Vivid description of the video SCENE, subjects, camera motion, lighting, and mood — NO text/words/logos to display (they garble)."
        ),
      aspectRatio: z
        .enum(["16:9", "9:16", "1:1"])
        .optional()
        .describe("Aspect ratio; defaults to 16:9."),
      durationSeconds: z
        .number()
        .optional()
        .describe(
          "Clip length in seconds (default ~6, clamped to the model max)."
        ),
      model: z
        .string()
        .optional()
        .describe(
          "Optional model id override (e.g. 'bytedance/seedance-v1.5-pro' for faster/cheaper). Omit for the default (Grok Imagine — fast + high quality)."
        ),
    }),
    execute: async ({ prompt, aspectRatio, durationSeconds, model }) => {
      if (!session?.user) {
        return {
          signInRequired: true as const,
          message:
            "Generating videos needs a (free) Audric account — sign in and I'll create it.",
        };
      }

      // Free tier: 1 video/day on the CHEAP model (Seedance); Veo stays paid.
      const isFree = !canUsePremium;
      if (isFree) {
        const usedToday = await countUserVideosToday(session.user.id);
        if (usedToday >= FREE_DAILY_VIDEO_LIMIT) {
          return {
            upgradeRequired: true as const,
            message: `You've used your free video for today. Upgrade to Pro for more videos — or try again after midnight UTC.`,
          };
        }
      }

      // Free → forced to the cheap model; paid → their pick (default Veo).
      const selected = isFree
        ? selectVideoModel(FREE_VIDEO_MODEL)
        : selectVideoModel(model);
      const ratio = aspectRatio ?? "16:9";
      const seconds = resolveDuration(selected, durationSeconds);
      const id = generateUUID();

      // Server-side no-text backstop. Video models (esp. Veo) hallucinate
      // GARBLED on-screen text whenever the prompt mentions brand names /
      // concepts ("Audric", "Sui", "AI") — even when no text was requested. The
      // agent guidance alone can't stop it, so actively steer the model away from
      // rendering ANY text. This is the single biggest video-quality lever.
      const NO_TEXT =
        " Clean cinematic footage with absolutely NO text, NO words, NO letters, NO captions, NO subtitles, NO logos, and NO writing of any kind anywhere in the frame.";

      let base64Data: string | undefined;
      let mediaType = "video/mp4";
      try {
        const result = await experimental_generateVideo({
          model: gateway.videoModel(selected.id),
          prompt: `${prompt}${NO_TEXT}`,
          aspectRatio: ratio,
          // `duration` is model-specific (not in the base options type).
          ...({ duration: seconds } as { duration: number }),
        });
        const clip = result.videos?.[0];
        base64Data = clip?.base64;
        mediaType = clip?.mediaType ?? "video/mp4";
      } catch (e) {
        // Log the real reason server-side (e.g. the Gateway's "$10 minimum
        // balance" video gate — an infra/ops signal for us), but NEVER leak
        // internal billing detail to the user — show a clean message.
        const reason = e instanceof Error ? e.message : String(e);
        console.error("[generate_video] failed:", reason);
        return {
          error:
            "I couldn't generate that video right now — video is briefly unavailable. Please try again shortly.",
        };
      }

      if (!base64Data) {
        return {
          error:
            "The video didn't generate this time — please try again or rephrase the scene.",
        };
      }

      const bytes = Buffer.from(base64Data, "base64");
      const { url, pathname } = await putBlob(`video/${id}.mp4`, bytes, {
        contentType: mediaType,
      });

      // Ledger row per clip (idempotent by ref). Paid → real per-clip debit;
      // free → a $0 marker that the 1/day cap counts (countUserVideosToday).
      // Written only on SUCCESS, so a failed gen doesn't burn the free allowance.
      await recordCredit({
        userId: session.user.id,
        // Debits MUST be negative (balance = SUM(amountMicros)); videoCostMicros
        // returns a positive cost, so negate it — mirrors the chat route's `-debit`.
        amountMicros: isFree ? 0 : -videoCostMicros(selected, seconds),
        type: "debit",
        description: `${isFree ? "video (free)" : "video"}: ${selected.label} ${seconds}s`,
        ref: `video:${id}`,
      });

      return {
        id,
        url,
        pathname,
        prompt,
        model: selected.label,
        content:
          "The video is generated and now shown to the user. Reply with a 1-sentence confirmation. Do NOT call generate_video again for it.",
      };
    },
  });
