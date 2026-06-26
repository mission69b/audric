import { experimental_generateVideo, gateway, tool } from "ai";
import { z } from "zod";
import type { Session } from "@/app/(auth)/auth";
import { selectVideoModel, videoCostMicros } from "@/lib/ai/video-models";
import { putBlob } from "@/lib/blob";
import { recordCredit } from "@/lib/db/queries";
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
      "Generate a short (~5s) VIDEO clip from a text description. Use WHENEVER the user wants a video / clip / animation — 'make a video of …', 'animate …', 'create a clip'. Put the full scene + motion description in `prompt`. This is a Pro/credit feature (free users get an upgrade prompt). For a still image use generate_image instead.",
    inputSchema: z.object({
      prompt: z
        .string()
        .describe("Full description of the video scene + motion."),
      aspectRatio: z
        .enum(["16:9", "9:16", "1:1"])
        .optional()
        .describe("Aspect ratio; defaults to 16:9."),
      model: z
        .string()
        .optional()
        .describe(
          "Optional model id override (e.g. 'klingai/kling-v2.5-turbo-t2v'). Omit to auto-select."
        ),
    }),
    execute: async ({ prompt, aspectRatio, model }) => {
      if (!session?.user) {
        return {
          signInRequired: true as const,
          message:
            "Generating videos needs a (free) Audric account — sign in and I'll create it.",
        };
      }
      if (!canUsePremium) {
        return {
          upgradeRequired: true as const,
          message:
            "Video generation is a Pro feature. Add credits or upgrade to Pro to create clips.",
        };
      }

      const selected = selectVideoModel(model);
      const ratio = aspectRatio ?? "16:9";
      const id = generateUUID();

      let base64Data: string | undefined;
      let mediaType = "video/mp4";
      try {
        const result = await experimental_generateVideo({
          model: gateway.videoModel(selected.id),
          prompt,
          aspectRatio: ratio,
        });
        const clip = result.videos?.[0];
        base64Data = clip?.base64;
        mediaType = clip?.mediaType ?? "video/mp4";
      } catch (e) {
        // TEMP (diagnosis): surface the real gateway reason — prod logs aren't
        // reachable via the CLI. Revert to the clean message once root-caused.
        const reason = e instanceof Error ? e.message : String(e);
        console.error("[generate_video] failed:", e);
        return {
          error: `Video generation failed — ${reason.slice(0, 240)}`,
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

      // Credit debit (premium). Flat per-clip estimate; idempotent by ref.
      await recordCredit({
        userId: session.user.id,
        amountMicros: videoCostMicros(selected),
        type: "debit",
        description: `video: ${selected.label}`,
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
