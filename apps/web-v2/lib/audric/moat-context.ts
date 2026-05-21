/**
 * AdviceLog hydration — single surface.
 *
 * [v0.7d Phase 6 Block A — 2026-05-21 / S.221] Reduced from two
 * surfaces (advice + memory) to one. `buildMemoryContext` was deleted
 * along with the UserMemory Prisma model; MemWal `<memory_recall>`
 * (injected via `prepareStep` — see `lib/audric/memwal-prepare-step.ts`)
 * is now the canonical cross-session memory surface.
 *
 * Why AdviceLog stays:
 *
 *   - AdviceLog stores **what Audric SAID to the user**; MemWal stores
 *     **what the user said / facts about the user**. Orthogonal access
 *     patterns; both survive.
 *   - The `record_advice` write tool keeps its lifecycle here — Audric
 *     proactively logs nontrivial recommendations so it doesn't
 *     contradict itself across sessions.
 *
 * **Failure mode:** fail-OPEN — a DB blip returns the empty string,
 * never throws. Moat hydration is best-effort context; its absence
 * degrades the agent's intelligence but never breaks the chat turn.
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

// [v0.7d Phase 6 Block A — 2026-05-21 / S.221] `MemoryEntry` interface +
// `buildMemoryContext` function deleted alongside the UserMemory Prisma
// model. MemWal `<memory_recall>` (injected via `prepareStep` —
// see `lib/audric/memwal-prepare-step.ts`) replaces both.
