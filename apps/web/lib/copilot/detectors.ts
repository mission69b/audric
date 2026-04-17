// Pure detector functions for Audric Copilot one-shot suggestions
// (Journeys C/D from audric-copilot-smart-confirmations.plan.md).
//
// Each detector is a pure function: given a user snapshot, return a list of
// `DetectedSuggestion` rows that the run-detectors endpoint can hand off to
// the surface-suggestion path. No DB writes here — keeps the detectors easy
// to unit test and lets the orchestration layer manage throttling.
//
// Recurring income detection is intentionally NOT in V1 — we don't yet have
// a clean source of inbound transfer events in AppEvent (only swap/payment
// link receipts). That will land in a follow-up once we wire an inbound
// transfer indexer.

import type { WalletBalances, PositionSummary } from "@/lib/portfolio-data";

// Threshold tuning — picked from the existing dashboard banner copy
// ("$79 idle USDC in your wallet"). Goals:
//   - Quiet for users with normal small operating balances ($5-15)
//   - Surface for anyone meaningfully sitting on idle stables/SUI
//   - Don't double-suggest if the user already has matching savings
const IDLE_USDC_THRESHOLD = 20;       // USDC sitting in wallet
const IDLE_SUI_THRESHOLD = 5;         // SUI sitting in wallet (≈ $20-30)
const SAVINGS_DOMINANCE_RATIO = 0.5;  // wallet idle <= 50% of existing savings → suppress

export type DetectedSuggestionType = "idle_action" | "income_action";

export interface DetectedSuggestion {
  type: DetectedSuggestionType;
  patternKey: string; // throttle key — surface-suggestion uses (userId, type) by default
  payload: Record<string, unknown>;
}

export interface DetectorContext {
  wallet: WalletBalances;
  positions: PositionSummary;
}

/**
 * idle_usdc — user has meaningful USDC sitting in wallet, suggest saving it
 * into NAVI. Suppressed when:
 *   - balance below threshold
 *   - existing NAVI USDC supply already covers >2x what they're holding
 *     (they're already deep in savings — re-prompting is noise)
 */
function detectIdleUsdc(ctx: DetectorContext): DetectedSuggestion | null {
  const usdc = ctx.wallet.USDC;
  if (usdc < IDLE_USDC_THRESHOLD) return null;

  const usdcSupplied = ctx.positions.supplies
    .filter((s) => s.asset.toUpperCase() === "USDC")
    .reduce((sum, s) => sum + s.amount, 0);

  // If they already have multiples of the idle balance saved, skip.
  if (usdcSupplied > 0 && usdc < usdcSupplied * SAVINGS_DOMINANCE_RATIO) {
    return null;
  }

  const projectedApy = ctx.positions.savingsRate || null;

  return {
    type: "idle_action",
    patternKey: "idle_action",
    payload: {
      action: "save",
      asset: "USDC",
      amountUsd: usdc,
      projectedApy,
    },
  };
}

/**
 * idle_sui — user has meaningful SUI in wallet beyond gas needs, suggest
 * staking via Volo (vSUI). Suppressed when:
 *   - balance below threshold
 *   - we can't determine staking is even useful for them (skipped via prefs upstream)
 */
function detectIdleSui(ctx: DetectorContext): DetectedSuggestion | null {
  const sui = ctx.wallet.SUI;
  if (sui < IDLE_SUI_THRESHOLD) return null;

  // Reserve ~1 SUI for gas — only suggest staking the surplus.
  const stakeable = Math.floor((sui - 1) * 100) / 100;
  if (stakeable < IDLE_SUI_THRESHOLD - 1) return null;

  return {
    type: "idle_action",
    patternKey: "idle_action_sui", // distinct throttle key from USDC variant
    payload: {
      action: "stake",
      asset: "SUI",
      amount: stakeable,
      // amountUsd left unset — confirm screen falls back to amount when missing
    },
  };
}

/**
 * Run all detectors on a user snapshot. Caller is responsible for filtering
 * by user opt-in flags + applying throttles (handled server-side by
 * surface-suggestion's per-(userId,type) 24h window).
 */
export function runAllDetectors(ctx: DetectorContext): DetectedSuggestion[] {
  const out: DetectedSuggestion[] = [];

  const idleUsdc = detectIdleUsdc(ctx);
  if (idleUsdc) out.push(idleUsdc);

  const idleSui = detectIdleSui(ctx);
  if (idleSui) out.push(idleSui);

  return out;
}
