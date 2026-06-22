import { tool } from "ai";
import { z } from "zod";
import { getMemWal } from "@/lib/memwal";

/**
 * save_memory — remember a durable fact about the user (Private Memory,
 * SPEC_AUDRIC_V3 §7c). PROACTIVE capture: call it whenever the user volunteers a
 * lasting fact about themselves (preference, goal, ongoing project, personal
 * detail) — NOT only when they say "remember". Skip transient chit-chat + guesses
 * you're unsure about. Stored in the user's own memory namespace (encrypted on
 * Walrus); recalled automatically on future turns. (autoSave stays off — this
 * tool is the capture path; the model decides when to call it.)
 *
 * `address` = the user's Passport address (their memory namespace). Authed-only.
 */
export const saveMemory = ({ address }: { address: string }) =>
  tool({
    description:
      "Save a durable fact about the user to their private memory (encrypted, recalled on future chats). " +
      "Capture PROACTIVELY — call this whenever the user volunteers a lasting fact about themselves (a preference, goal, ongoing project, or personal detail), without waiting for them to say 'remember'. " +
      "Skip transient conversation, one-off task details, and speculative inferences you're not sure about. State plainly what you saved.",
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
