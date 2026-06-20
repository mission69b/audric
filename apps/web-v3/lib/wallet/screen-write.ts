/**
 * Host pre-dispatch wrapper for wallet writes (SPEC_AUDRIC_V3 §7, S.443).
 *
 * The tap-to-confirm card is the PRIMARY hard gate (the user sees the exact
 * recipient + amount and taps Allow). This wrapper adds the deterministic gates
 * the card alone doesn't catch, run at the dispatch moment (in the card's
 * onAllow) BEFORE the Passport signs:
 *
 *   1. preflight   — SDK `preflightSend` (pure input sanity: positive/finite
 *                    amount, gasless min, valid 0x address).
 *   2. retry-dedup  — block an identical (to+amount) re-dispatch inside a short
 *                    window (guards an LLM emitting the write twice, or a
 *                    double-tap), so the user isn't double-charged.
 *
 * Audric sends gasless stables (USDC + USDsui). The asset is part of the intent
 * key, so the dedup gate treats "5 USDC" and "5 USDsui" to the same address as
 * distinct sends. Pure + deterministic by design (the human tap is the other
 * gate). Reused by the Recipes `payService` path.
 */

import { preflightSend } from "@t2000/sdk/browser";

export type SendAsset = "USDC" | "USDsui";
export type ScreenResult = { ok: true } | { ok: false; reason: string };

type SendIntent = { to: string; amount: number; asset: SendAsset };

// Recently-dispatched intents (client session, in-memory). Keyed on the exact
// intent; entries expire so a deliberate repeat send later is never blocked.
const RETRY_DEDUP_WINDOW_MS = 60_000;
const recentDispatches = new Map<string, number>();

function intentKey(input: SendIntent): string {
  return `${input.asset}:${input.amount}:${input.to.toLowerCase()}`;
}

/** True if an identical transfer was dispatched within the dedup window. */
export function isDuplicateSend(input: SendIntent): boolean {
  const at = recentDispatches.get(intentKey(input));
  return at !== undefined && Date.now() - at < RETRY_DEDUP_WINDOW_MS;
}

/** Record a dispatch so an immediate identical re-send is caught. */
export function markSendDispatched(input: SendIntent): void {
  recentDispatches.set(intentKey(input), Date.now());
}

/**
 * Run the full pre-dispatch screen for a stable send. Call in onAllow before
 * signing; on `{ ok: false }`, settle the tool with the reason (the agent
 * re-asks) instead of dispatching. Does NOT mark the intent dispatched — call
 * {@link markSendDispatched} only once you actually submit.
 */
export function screenSend(input: SendIntent): ScreenResult {
  const pf = preflightSend(input);
  if (!pf.valid) {
    return { ok: false, reason: pf.error };
  }

  if (isDuplicateSend(input)) {
    return {
      ok: false,
      reason: `You just sent ${input.amount} ${input.asset} to this address moments ago — I won't repeat it automatically. Ask again if you really want to send it twice.`,
    };
  }

  return { ok: true };
}
