/**
 * Moat hydration — AdviceLog + UserMemory (incl. chain-derived) builders.
 *
 * [Phase 6.5 / SPEC_V07C_PHASE_6_5_CHAT_PARITY B.1 + B.3 + B.4 / S.198 — 2026-05-20]
 *
 * Two surfaces, one file:
 *
 *   1. `buildAdviceContext(userId)` — last 5 AdviceLog rows in last 30
 *      days, rendered as a date-prefixed block. AdviceLog stores **what
 *      Audric SAID to the user**; MemWal (v0.7d) will store **what the
 *      user said / what facts about the user are true**. Different
 *      access patterns; AdviceLog stays permanent even after MemWal
 *      lands.
 *
 *   2. `buildMemoryContext(memories)` — last 8 UserMemory rows rendered
 *      with `[memoryType]` prefix for conversation-derived rows and
 *      `[on-chain observation]` prefix for chain-classified rows
 *      (UserMemory.source === 'chain'). Same table, two prefix paths.
 *      This is the B.3 (UserMemory) + B.4 (Chain Memory) joint surface
 *      because apps/web does a single Prisma read across both via the
 *      `source` discriminator — porting that pattern verbatim.
 *
 * Both functions are direct ports from `apps/web/lib/engine/engine-context.ts`
 * (L66-100 + L716-764). Once v0.7c Phase 6 cuts audric/web over to
 * web-v2 the source module retires and this becomes the canonical
 * (per `engineering-principles.mdc` rule 6 — factor when LOGIC
 * duplicates, not just SHAPE). Today, both apps must produce
 * byte-equivalent context for the post-cutover moat-revival smoke
 * (same prompt asked to both surfaces should reference the same
 * advice/memory).
 *
 * Profile context is NOT in this module — `buildProfileContext` +
 * `UserFinancialProfile` are already exported from `@t2000/engine`
 * (B.2 reuses them directly).
 *
 * **Failure mode:** both functions fail-OPEN — a DB blip returns the
 * empty string, never throws. Moat hydration is best-effort context;
 * its absence degrades the agent's intelligence but never breaks the
 * chat turn.
 */

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// B.1 — AdviceLog hydration
// ---------------------------------------------------------------------------

/**
 * Last 5 advice rows (30-day window) for a given user, rendered as a
 * block ready to drop into the system prompt's "Session Context" area.
 *
 * Mirrors `apps/web/lib/engine/engine-context.ts:66-100` byte-for-byte
 * (modulo `prisma` import path). Returns empty string when the user
 * has no recent advice OR when the DB lookup fails — `.warn` for the
 * error but never throws.
 *
 * Why 5 × 30d: legacy lock; AdviceLog grows linearly with active days
 * and the LLM's attention budget for "what did I say last" caps out
 * around 5 entries before it starts paraphrasing the older ones.
 */
export async function buildAdviceContext(userId: string): Promise<string> {
  try {
    // [SIMPLIFICATION DAY 5] AdviceLog lost outcomeStatus, actionTaken,
    // followUp* columns when the outcome-check + follow-up cron stack
    // was retired. Context now reads pure history (last 5 in 30d)
    // without outcome filtering or "acted on / not yet acted on"
    // annotations.
    // [SPEC 17 — 2026-05-07] AdviceLog.goalId column dropped along
    // with the SavingsGoal table — the previous secondary lookup that
    // hydrated "(toward {goalName})" annotations is gone; advice
    // now renders as a pure date-prefixed line.
    const recentAdvice = await prisma.adviceLog.findMany({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    if (recentAdvice.length === 0) {
      return "";
    }

    const lines = recentAdvice.map((a) => {
      const daysAgo = Math.round(
        (Date.now() - a.createdAt.getTime()) / 86_400_000
      );
      return `- ${daysAgo}d ago: ${a.adviceText}`;
    });

    return [
      "Your recent advice to this user:",
      ...lines,
      "Reference this context naturally when relevant. If the user asks what you suggested, draw from this list.",
    ].join("\n");
  } catch (err) {
    console.warn("[web-v2 moat-context] buildAdviceContext failed:", err);
    return "";
  }
}

// ---------------------------------------------------------------------------
// B.3 + B.4 — UserMemory hydration (conversation + chain-derived)
// ---------------------------------------------------------------------------

/**
 * Single row shape consumed by `buildMemoryContext`. Mirrors the legacy
 * `MemoryEntry` interface in `apps/web/lib/engine/engine-context.ts`
 * (L716-722) — kept locally so this module doesn't have to import from
 * the apps/web cross-package path that the prisma client already takes.
 *
 * `source` discriminates conversation-derived rows ('conversation', the
 * default) from chain-classifier rows ('chain'). The renderer prefixes
 * each accordingly:
 *   - 'chain'    → `[on-chain observation]`
 *   - default    → `[<memoryType>]` (preference / fact / pattern / goal / concern)
 */
export interface MemoryEntry {
  content: string;
  extractedAt: Date;
  id: string;
  memoryType: string;
  source?: string;
}

function formatMemoryAge(extractedAt: Date): string {
  const hoursAgo = (Date.now() - extractedAt.getTime()) / 3_600_000;
  if (hoursAgo < 24) {
    return "today";
  }
  if (hoursAgo < 48) {
    return "yesterday";
  }
  const daysAgo = Math.floor(hoursAgo / 24);
  return `${daysAgo}d ago`;
}

/**
 * Build the cross-session memory block for the system prompt.
 *
 * Caps at 8 rows (Claude's attention to long lists falls off above
 * that; legacy `apps/web` enforces the same `.slice(0, 8)`). Returns
 * the empty string for the no-memories path so the F-4 layer 3 slot
 * collapses cleanly via the `.filter(l => l.length > 0)` in
 * `buildAudricSystemPrompt`.
 *
 * Renders conversation-source and chain-source memories side-by-side
 * with different prefixes. This is intentional — the LLM benefits
 * from knowing whether a fact came from the user saying it ("I hate
 * gas fees") versus the classifier inferring it from chain activity
 * ("recurring 0xabc send every Friday").
 */
export function buildMemoryContext(memories: MemoryEntry[]): string {
  if (memories.length === 0) {
    return "";
  }

  const lines: string[] = [
    "What you know about this user (remembered across sessions):",
  ];
  for (const m of memories.slice(0, 8)) {
    const age = formatMemoryAge(m.extractedAt);
    const prefix =
      m.source === "chain" ? "[on-chain observation]" : `[${m.memoryType}]`;
    lines.push(`- ${prefix} ${m.content} (${age})`);
  }
  return lines.join("\n");
}
