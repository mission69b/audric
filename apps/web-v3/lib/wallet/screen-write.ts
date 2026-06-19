/**
 * Host pre-dispatch wrapper for wallet writes (SPEC_AUDRIC_V3 §7, S.443).
 *
 * The tap-to-confirm card is the PRIMARY hard gate (the user sees the exact
 * recipient / amount / asset and taps Allow). This wrapper adds the few
 * deterministic, LLM-behavior gates the card alone doesn't catch, run at the
 * dispatch moment (in the card's onAllow) BEFORE the Passport signs:
 *
 *   1. preflight   — SDK `preflightSend` (pure input sanity: asset allow-list,
 *                    positive/finite amount, gasless min, valid 0x address).
 *   2. asset-intent — block a currency SUBSTITUTION: if the user clearly named
 *                    a different supported asset than the tool chose, re-ask
 *                    rather than silently send the wrong one.
 *   3. retry-dedup  — block an identical (to+amount+asset) re-dispatch inside a
 *                    short window (guards an LLM emitting the write twice, or a
 *                    double-tap), so the user isn't double-charged.
 *
 * Pure + deterministic by design — NOT an LLM opinion (money-path checkers must
 * be deterministic; the human tap is the other gate). Reused by the Recipes
 * `payService` path in Phase 4b.
 */

import { preflightSend } from "@t2000/sdk/browser";
import type { SendableAsset } from "./send";

export type ScreenResult = { ok: true } | { ok: false; reason: string };

const SUPPORTED_ASSETS: SendableAsset[] = ["USDC", "USDsui", "SUI"];

// Which supported assets does the user's text explicitly name? Returns the
// distinct set actually mentioned. The bare-"SUI" match deliberately excludes
// "usdsui" AND SuiNS domains like "alice.sui" (lookbehind rejects a preceding
// word char or dot) so a recipient name never reads as an asset intent.
function assetsMentioned(text: string): Set<SendableAsset> {
  const found = new Set<SendableAsset>();
  if (/\busdsui\b/i.test(text)) {
    found.add("USDsui");
  }
  if (/\busdc\b/i.test(text)) {
    found.add("USDC");
  }
  if (/(?<![\w.])sui\b/i.test(text)) {
    found.add("SUI");
  }
  return found;
}

/**
 * Asset-intent gate: only blocks on an UNAMBIGUOUS mismatch — the user named
 * exactly one supported asset and it differs from the tool's choice. Silent on
 * "no asset named" (default applies) or "several named" (can't infer intent),
 * to avoid false positives on a human-confirmed action.
 */
function screenAssetIntent(
  asset: SendableAsset,
  recentUserText: string | undefined
): ScreenResult {
  if (!recentUserText) {
    return { ok: true };
  }
  const mentioned = assetsMentioned(recentUserText);
  if (mentioned.size === 1 && !mentioned.has(asset)) {
    const [wanted] = [...mentioned];
    return {
      ok: false,
      reason: `You asked to send ${wanted}, but this transfer is set to ${asset}. I'll redo it as ${wanted}.`,
    };
  }
  return { ok: true };
}

// Recently-dispatched intents (client session, in-memory). Keyed on the exact
// intent; entries expire so a deliberate repeat send later is never blocked.
const RETRY_DEDUP_WINDOW_MS = 60_000;
const recentDispatches = new Map<string, number>();

function intentKey(input: {
  to: string;
  amount: number;
  asset: SendableAsset;
}): string {
  return `${input.asset}:${input.amount}:${input.to.toLowerCase()}`;
}

/** True if an identical transfer was dispatched within the dedup window. */
export function isDuplicateSend(input: {
  to: string;
  amount: number;
  asset: SendableAsset;
}): boolean {
  const at = recentDispatches.get(intentKey(input));
  return at !== undefined && Date.now() - at < RETRY_DEDUP_WINDOW_MS;
}

/** Record a dispatch so an immediate identical re-send is caught. */
export function markSendDispatched(input: {
  to: string;
  amount: number;
  asset: SendableAsset;
}): void {
  recentDispatches.set(intentKey(input), Date.now());
}

/**
 * Run the full pre-dispatch screen for a send. Call in onAllow before signing;
 * on `{ ok: false }`, settle the tool with the reason (the agent re-asks)
 * instead of dispatching. Does NOT mark the intent dispatched — call
 * {@link markSendDispatched} only once you actually submit.
 */
export function screenSend(
  input: { to: string; amount: number; asset: SendableAsset },
  ctx: { recentUserText?: string } = {}
): ScreenResult {
  const pf = preflightSend(input);
  if (!pf.valid) {
    return { ok: false, reason: pf.error };
  }

  const intent = screenAssetIntent(input.asset, ctx.recentUserText);
  if (!intent.ok) {
    return intent;
  }

  if (isDuplicateSend(input)) {
    return {
      ok: false,
      reason: `You just sent ${input.amount} ${input.asset} to this address moments ago — I won't repeat it automatically. Ask again if you really want to send it twice.`,
    };
  }

  return { ok: true };
}

export const SUPPORTED_SEND_ASSETS = SUPPORTED_ASSETS;
