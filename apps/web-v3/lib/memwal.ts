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
import { withMemWal } from "@mysten-incubation/memwal/ai";
import type { LanguageModel } from "ai";
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
 * Wrap a model with recall-before-generation for one user. autoSave is OFF —
 * capture is explicit-only (the saveMemory tool), per the privacy-by-default
 * decision. The namespace scopes recall to this user's memories.
 */
export function withUserMemory(
  model: LanguageModel,
  passportAddress: string
): LanguageModel {
  return withMemWal(model, {
    ...memwalConfig(passportAddress),
    autoSave: false,
    maxMemories: 6,
    // SDK default similarity floor (0.3). Stricter values (e.g. 0.45) drop
    // short facts against a verbose query — too aggressive for recall.
    minRelevance: 0.3,
  }) as LanguageModel;
}
