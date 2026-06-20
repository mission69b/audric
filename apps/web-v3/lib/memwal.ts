import "server-only";

/**
 * Private Memory (Walrus Memory / MemWal) — server-only wiring.
 * SPEC_AUDRIC_V3 §6/§7c. Model (B): ONE Audric-owned MemWal account, with
 * per-user isolation by `namespace = passport address` (the relayer enforces
 * owner+namespace isolation in SQL). Opt-in / OFF by default (`useMemWal` flag);
 * autoSave OFF (explicit `saveMemory` only). Honest label: encrypted at rest on
 * Walrus + on-chain enforced + deletable — NOT end-to-end (the relayer TEE sees
 * plaintext transiently). The Passport-owned per-user upgrade (true sovereignty)
 * is a post-launch fast-follow (needs the MemWal mainnet package/registry IDs).
 */

import { MemWal } from "@mysten-incubation/memwal";
import { env } from "@/lib/env";

const DEFAULT_RELAYER = "https://relayer.memory.walrus.xyz";

/** Memory is available only when the Audric account creds are configured. */
export function isMemoryConfigured(): boolean {
  return Boolean(env.MEMWAL_PRIVATE_KEY && env.MEMWAL_ACCOUNT_ID);
}

function memwalConfig(namespace: string) {
  return {
    key: env.MEMWAL_PRIVATE_KEY as string,
    accountId: env.MEMWAL_ACCOUNT_ID as string,
    serverUrl: env.MEMWAL_SERVER_URL ?? DEFAULT_RELAYER,
    namespace,
  };
}

/** Direct client for explicit save/recall (the saveMemory tool). */
export function getMemWal(namespace: string): MemWal {
  return MemWal.create(memwalConfig(namespace));
}

/**
 * Recall this user's relevant memories for `query` and format them as a
 * `<memory_recall>` block to inject at the START of the system prompt.
 *
 * Why not the `withMemWal` model wrapper? It splices the recall as a system
 * message BEFORE the last user message (mid-conversation), which Vertex/Gemini
 * rejects ("system messages are only supported at the beginning"). Injecting
 * into the leading system prompt instead is model-agnostic — it works for every
 * provider in the lineup, Gemini included.
 *
 * autoSave stays OFF (capture is explicit-only via the saveMemory tool). The
 * namespace scopes recall to this user. Returns null when memory is
 * unconfigured, the query is empty, or nothing relevant is found. Never throws
 * — a recall failure must not break the turn.
 */
export async function recallMemoryBlock(
  passportAddress: string,
  query: string
): Promise<string | null> {
  if (!(isMemoryConfigured() && query.trim())) {
    return null;
  }
  try {
    const { results } = await getMemWal(passportAddress).recall({
      query,
      topK: 6,
      // distance = 1 − similarity; 0.7 mirrors the prior 0.3 similarity floor.
      maxDistance: 0.7,
    });
    if (results.length === 0) {
      return null;
    }
    const lines = results.map((m) => `- ${m.text}`).join("\n");
    return `<memory_recall>\nKnown facts about this user, from their private memory. Use them naturally; never invent facts not listed here:\n${lines}\n</memory_recall>`;
  } catch {
    return null;
  }
}
