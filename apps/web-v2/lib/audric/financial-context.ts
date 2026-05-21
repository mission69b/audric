/**
 * Daily orientation snapshot — `<financial_context>` block builder.
 *
 * --- WHY THIS FILE EXISTS (v0.7c Phase 6 Prep) ---
 *
 * Legacy `apps/web` renders the cached daily `UserFinancialContext`
 * snapshot as an XML-tagged `<financial_context>` block at the top of
 * the dynamic system context. The block lets the LLM lean on it for
 * greeting / "where did we leave off?" / "what's pending?" questions
 * WITHOUT spending tool calls re-deriving state.
 *
 * Layer 2 of the F-4 5-layer prompt assembly per
 * `.cursor/rules/memory-injection-architecture.mdc`. Skipped when the
 * snapshot is missing or older than 48h — the LLM falls back to fresh
 * tool calls (which the intent-dispatcher then helps with). Mirrors the
 * BlockVision sticky-positive degradation pattern: never throw, always
 * return a string (possibly empty), let the caller decide whether to
 * include or drop the layer.
 *
 * --- PORT NOTES ---
 *
 *   - `buildFinancialContextBlock` is ported byte-for-byte from
 *     `audric/apps/web/lib/engine/engine-context.ts` L551-604. Field
 *     names, formatting, and trailing instruction line all match.
 *
 *   - The reader is simplified vs legacy: no Redis layer, direct Prisma
 *     read. Web-v2 doesn't have Upstash wired into the chat route yet
 *     (cross-package coupling is a v0.7d concern); the Prisma lookup is
 *     ~10-20ms p50 against NeonDB which is acceptable for the silent
 *     intelligence layer. When web-v2 wires Upstash post-v0.7c, this
 *     module becomes a thin shim over the same cache.
 *
 *   - 48h staleness gate is NEW vs legacy (legacy returns whatever the
 *     snapshot row contains regardless of age). The 02:00 UTC cron
 *     guarantees ≤24h freshness; a 48h cap surfaces cron failures
 *     instead of feeding the LLM week-old balances. When a snapshot is
 *     too old, we return empty string — the system prompt's layer 2
 *     drops, and the dispatcher/LLM fall back to fresh tool calls.
 *
 *   - Snapshot wire shape matches the legacy `FinancialContextSnapshot`
 *     from `apps/web/lib/redis/user-financial-context.ts`. We don't
 *     import it directly because that module pulls in Upstash + the
 *     Prisma client from `apps/web`; vendoring the type keeps web-v2
 *     standalone and side-steps the cross-package import (consistent
 *     with the Session 4.6 identity helpers pattern).
 */

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// FinancialContextSnapshot — slimmed to 4 stable fields per S.242
//   (V07E_STALE_FINCONTEXT_WRITE_REFUSAL Path 6, 2026-05-22).
//
// Pre-S.242 this carried 10 fields including 6 VOLATILE balance/debt/HF
// values that the daily cron baked in. The volatile fields caused a P1
// bug: LLM trusted the snapshot (up to 24h stale) over fresh tool calls
// and refused write actions like "Save $5 USDC" when the snapshot
// showed $0 even though the real wallet had funds. The 6 volatile
// fields are now READ ONLY via fresh tool calls (`balance_check`,
// `savings_info`, `health_check`) — never via this block.
//
// The 4 retained fields are inherently stable at daily cadence:
//   - currentApy:           pool rate changes are slow (hour+ scale)
//   - daysSinceLastSession: naturally daily
//   - pendingAdvice:        text narrative from AdviceLog, daily-ish churn
//   - recentActivity:       text narrative summary, daily churn
//
// The 6 dropped fields (walletUsdc / walletUsdsui / savingsUsdc /
// savingsUsdsui / debtUsdc / healthFactor) are still WRITTEN by the
// 02:30 UTC `financial-context-snapshot` cron — the Prisma schema isn't
// touched in Phase 1. Phase 2 (per Q2 lock) will simplify the cron +
// drop the columns. See `spec/active/V07E_STALE_FINCONTEXT_WRITE_REFUSAL.md`.
// ---------------------------------------------------------------------------
export interface FinancialContextSnapshot {
  currentApy: number | null;
  daysSinceLastSession: number;
  pendingAdvice: string | null;
  recentActivity: string;
}

// ---------------------------------------------------------------------------
// buildFinancialContextBlock — renders the 4-field stable snapshot
// as an XML-tagged block. Returns empty string when no snapshot is
// available — the caller drops layer 2 from the prompt entirely
// (mirrors the layer `.filter(l => l.length > 0)` contract).
//
// Per S.242: this block intentionally does NOT carry wallet / savings /
// debt / HF figures. Those are too volatile for a daily snapshot —
// stale values would let the LLM refuse writes pre-tool (the bug
// class this slimming eliminates by construction). The closing
// instruction line now explicitly directs the LLM to fresh tools for
// any balance-aware decision, including write-action gating.
// ---------------------------------------------------------------------------
export function buildFinancialContextBlock(
  snapshot: FinancialContextSnapshot | null | undefined
): string {
  if (!snapshot) {
    return "";
  }

  const lines: string[] = ["<financial_context>"];
  if (snapshot.currentApy !== null) {
    lines.push(`Current savings APY: ${snapshot.currentApy.toFixed(2)}%`);
  }
  if (snapshot.pendingAdvice) {
    lines.push(`Last advice (not yet acted on): ${snapshot.pendingAdvice}`);
  }
  lines.push(`Recent activity: ${snapshot.recentActivity}`);
  const sessionPhrase =
    snapshot.daysSinceLastSession === 0
      ? "Today"
      : snapshot.daysSinceLastSession === 1
        ? "Yesterday"
        : `${snapshot.daysSinceLastSession} days ago`;
  lines.push(`Last session: ${sessionPhrase}`);
  lines.push("</financial_context>");
  lines.push(
    "The block above is a daily orientation snapshot (at most 24h old) covering APY / advice / activity / session continuity ONLY. It intentionally does NOT carry live wallet, savings, debt, or health-factor figures. For ANY balance / savings / debt / health-factor question, AND for ANY write action (save / send / swap / borrow / repay / withdraw), ALWAYS call the corresponding read tool first (`balance_check`, `savings_info`, `health_check`) — never refuse or proceed with a write based on assumed balance values, because no balance values are present in this block."
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// getFinancialContextBlock — high-level reader used by the chat route.
//
// Pipeline:
//   1. Read `prisma.userFinancialContext.findUnique({ where: { address } })`.
//   2. If absent → return "" (brand-new user; cron hasn't ticked yet).
//   3. If `updatedAt` is older than 48h → return "" (cron likely
//      stuck; surface via empty layer 2 instead of feeding stale data).
//   4. Otherwise render via `buildFinancialContextBlock(snapshot)`.
//
// HONEST DEGRADATION CONTRACT (mirrors BlockVision sticky-positive
// caching pattern): NEVER throws. Every failure path returns "" so the
// caller can drop layer 2 cleanly. The 02:00 UTC `financial-context-
// snapshot` cron is the source-of-truth writer; this reader stays
// passive.
//
// Stale staleness threshold of 48h is intentional: the cron runs every
// 24h, so 48h is "exactly one cron tick missed" — close enough to be a
// blip we ignore, far enough that we don't expose 3+ day-old snapshots.
// ---------------------------------------------------------------------------

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

export async function getFinancialContextBlock(
  walletAddress: string
): Promise<string> {
  if (!walletAddress) {
    return "";
  }

  let row: Awaited<ReturnType<typeof prisma.userFinancialContext.findUnique>> =
    null;
  try {
    row = await prisma.userFinancialContext.findUnique({
      where: { address: walletAddress },
    });
  } catch (err) {
    console.warn(
      "[web-v2 financial-context] Prisma read failed (fail-open, layer 2 dropped):",
      err instanceof Error ? err.message : String(err)
    );
    return "";
  }

  if (!row) {
    return "";
  }

  // Stale-gate: 48h is one missed cron tick + headroom. Beyond that we
  // bias toward fresh tool calls.
  const ageMs = Date.now() - row.updatedAt.getTime();
  if (ageMs > STALE_THRESHOLD_MS) {
    console.warn(
      `[web-v2 financial-context] snapshot stale (${Math.floor(ageMs / 3_600_000)}h old) — layer 2 dropped, LLM falls back to fresh tools`
    );
    return "";
  }

  // [S.242 Path 6, 2026-05-22] Only the 4 stable fields are read from the
  // row. The 6 volatile columns (walletUsdc, walletUsdsui, savingsUsdc,
  // savingsUsdsui, debtUsdc, healthFactor) are still written by the cron
  // until Phase 2 simplification — they're ignored here.
  const snapshot: FinancialContextSnapshot = {
    currentApy: row.currentApy,
    daysSinceLastSession: row.daysSinceLastSession,
    pendingAdvice: row.pendingAdvice,
    recentActivity: row.recentActivity,
  };

  return buildFinancialContextBlock(snapshot);
}
