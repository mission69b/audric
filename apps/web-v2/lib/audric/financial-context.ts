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
// FinancialContextSnapshot — vendored from
//   `audric/apps/web/lib/redis/user-financial-context.ts` L49-67.
//
// Keep aligned with `prisma.userFinancialContext` columns minus the
// dual-key (`userId` / `address`) and audit columns (`generatedAt` /
// `updatedAt`).
// ---------------------------------------------------------------------------
export interface FinancialContextSnapshot {
  currentApy: number | null;
  daysSinceLastSession: number;
  debtUsdc: number;
  healthFactor: number | null;
  pendingAdvice: string | null;
  recentActivity: string;
  savingsUsdc: number;
  /**
   * [Bug 1c / 2026-04-27] USDsui breakouts. Both fields are nullable in
   * the DB for backfill compatibility; the cron writer populates them
   * from the latest `PortfolioSnapshot.allocations` (wallet) and a
   * fresh `fetchPositions` call (savings). The block builder renders
   * them as separate "$X USDsui" lines when present.
   */
  savingsUsdsui: number | null;
  walletUsdc: number;
  walletUsdsui: number | null;
}

// ---------------------------------------------------------------------------
// buildFinancialContextBlock — ported byte-for-byte from
//   `audric/apps/web/lib/engine/engine-context.ts` L551-604
//
// Renders the cached daily orientation snapshot as an XML-tagged block
// so the LLM can lean on it for greeting / "where did we leave off?"
// continuity. Returns empty string when no snapshot is available — the
// caller drops layer 2 from the prompt entirely (mirrors the layer
// `.filter(l => l.length > 0)` contract).
// ---------------------------------------------------------------------------
export function buildFinancialContextBlock(
  snapshot: FinancialContextSnapshot | null | undefined
): string {
  if (!snapshot) {
    return "";
  }

  // [Bug 1c / 2026-04-27] Render per-asset stable lines when USDsui
  // breakouts are present. The pre-fix block hardcoded "USDC" labels and
  // silently rolled USDsui into the USDC aggregate, which let the LLM
  // answer "what are my assets" without ever mentioning USDsui.
  const usdsuiSavings = snapshot.savingsUsdsui ?? 0;
  const usdsuiWallet = snapshot.walletUsdsui ?? 0;
  const lines: string[] = ["<financial_context>"];
  if (usdsuiSavings > 0) {
    const totalSavings = snapshot.savingsUsdc + usdsuiSavings;
    lines.push(
      `Savings (NAVI): $${snapshot.savingsUsdc.toFixed(2)} USDC + $${usdsuiSavings.toFixed(2)} USDsui = $${totalSavings.toFixed(2)} total stables`
    );
  } else {
    lines.push(`Savings: $${snapshot.savingsUsdc.toFixed(2)} USDC`);
  }
  if (usdsuiWallet > 0) {
    const totalWalletStables = snapshot.walletUsdc + usdsuiWallet;
    lines.push(
      `Wallet stables (non-savings): $${snapshot.walletUsdc.toFixed(2)} USDC + $${usdsuiWallet.toFixed(2)} USDsui = $${totalWalletStables.toFixed(2)} total`
    );
  } else {
    lines.push(
      `Wallet (non-savings): $${snapshot.walletUsdc.toFixed(2)} USDC equiv`
    );
  }
  lines.push(`Debt: $${snapshot.debtUsdc.toFixed(2)} USDC`);
  if (snapshot.healthFactor !== null) {
    lines.push(`Health factor: ${snapshot.healthFactor.toFixed(2)}`);
  }
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
    'The block above is a daily orientation snapshot (at most 24h old) — use it for greetings and "where did we leave off?" continuity. It is NOT a substitute for tool calls when the user explicitly asks for balance / savings / net worth / health figures (see the "Rich-card rendering on direct read questions" rule above — those questions ALWAYS require the corresponding read tool so the rich card renders).'
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

  const snapshot: FinancialContextSnapshot = {
    savingsUsdc: row.savingsUsdc,
    savingsUsdsui: row.savingsUsdsui ?? null,
    debtUsdc: row.debtUsdc,
    walletUsdc: row.walletUsdc,
    walletUsdsui: row.walletUsdsui ?? null,
    healthFactor: row.healthFactor,
    currentApy: row.currentApy,
    recentActivity: row.recentActivity,
    pendingAdvice: row.pendingAdvice,
    daysSinceLastSession: row.daysSinceLastSession,
  };

  return buildFinancialContextBlock(snapshot);
}
