import { tool } from "ai";
import { z } from "zod";
import { setCustomInstructions } from "@/lib/db/queries";

const MAX_LEN = 2000;

/**
 * set_preferences — write the user's STANDING custom instructions (behavioral
 * directives applied to EVERY response: language to reply in, tone, persona,
 * what to call them, response format). Distinct from save_memory: memory holds
 * facts recalled when relevant; this holds behavior injected unconditionally
 * every turn, which is why "always answer in German" works here but not in
 * relevance-gated memory.
 *
 * The tool REPLACES the full instruction set (the agent sees the current value
 * in the <custom_instructions> block, so it reconciles changes + removals
 * itself). Pass an empty string to clear. Authed-only.
 */
export const setPreferences = ({ userId }: { userId: string }) =>
  tool({
    description:
      "Set the user's standing custom instructions — behavior to apply on EVERY future response (e.g. 'Always respond in German', 'Be concise', 'Call me Phil'). " +
      "Use this (NOT save_memory) whenever the user states a lasting directive about HOW you should respond. This REPLACES the existing instructions, which are shown to you in the <custom_instructions> block — include everything that should still apply, drop what they removed, and pass an empty string to clear all. State plainly what you set.",
    inputSchema: z.object({
      instructions: z
        .string()
        .describe(
          "The COMPLETE standing instructions after this change (not a diff). Concise, imperative lines, e.g. 'Always respond in German.\\nKeep answers short.' Empty string clears them."
        ),
    }),
    execute: async ({ instructions }) => {
      try {
        const trimmed = instructions.trim().slice(0, MAX_LEN);
        await setCustomInstructions(
          userId,
          trimmed.length > 0 ? trimmed : null
        );
        return { saved: true, instructions: trimmed };
      } catch (e) {
        return { saved: false, error: (e as Error).message };
      }
    },
  });
