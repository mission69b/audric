import { tool } from "ai";
import { z } from "zod";
import { getMemWal } from "@/lib/memwal";

/**
 * save_memory — explicitly remember a durable fact about the user (Private
 * Memory, SPEC_AUDRIC_V3 §7c). EXPLICIT capture only (autoSave is off): call
 * this when the user says "remember that…" or states a lasting preference/goal,
 * NOT for transient chit-chat. Stored in the user's own memory namespace
 * (encrypted on Walrus); recalled automatically on future turns.
 *
 * `address` = the user's Passport address (their memory namespace). Authed-only.
 */
export const saveMemory = ({ address }: { address: string }) =>
  tool({
    description:
      "Save a durable fact about the user to their private memory (encrypted, recalled on future chats). " +
      "Use ONLY when the user asks to remember something or states a lasting preference, goal, or personal detail — never for transient conversation. State plainly what you saved.",
    inputSchema: z.object({
      fact: z
        .string()
        .describe(
          "The single durable fact, as a COMPLETE self-contained third-person sentence (fuller sentences recall far better than terse fragments). Good: 'The user is building an application on the Sui blockchain.' / 'The user prefers concise, no-fluff answers.' Bad: 'Building on Sui'."
        ),
    }),
    execute: async ({ fact }) => {
      try {
        const memwal = getMemWal(address);
        // Accept-and-go: the relayer indexes (embed → encrypt → Walrus) in the
        // background, which can exceed any sane in-turn wait. We don't need the
        // result this turn (recall is a future chat), so confirm on ACCEPTANCE
        // rather than blocking — avoids false "timed out" failures.
        await memwal.remember(fact);
        return { saved: true, fact };
      } catch (e) {
        return { saved: false, error: (e as Error).message };
      }
    },
  });
