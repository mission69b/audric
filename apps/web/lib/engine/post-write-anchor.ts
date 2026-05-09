/**
 * Post-Write Balance Anchor (SPEC 21.2.b — 2026-05-10)
 *
 * Production smoke 2026-05-09 (session s_1778362657811_c0ed9009a5fb,
 * msg-dump turn=4 entry-point):
 *
 *   [22] user: tool_result:ce_check, tool_result:ngs_info  ← PWR balance fresh
 *   [23] assistant: "Bundle executed. Swapped 0.50 USDC..."
 *   [24] user: "swap 0.50 USDC to SUI"                     ← new prompt
 *   [25] assistant: thinking + swap_quote                  ← SKIPS balance_check
 *   [26] user: tool_result:swap_quote
 *   [27] assistant: thinking + swap_execute (with stale 10.31 figure)
 *   [28] user: tool_result (FAILED — 0 USDC in wallet)
 *   [29] assistant: "You have 0 USDC ... your 10.31 USDC is all in NAVI savings"
 *
 * The PWR balance_check at [22] reflected the actual post-bundle state
 * ($0 USDC). The LLM saw it, narrated correctly at [23], but on the new
 * user turn at [24] anchored on the 10.31 figure from its own
 * `<eval_summary>` text earlier in the conversation (turn [25]'s
 * thinking burst cited the prior swap context where 10.31 was
 * available). System prompt rules (engine-context.ts lines 195-207) are
 * already very directive about post-write balance trust — the LLM
 * ignores them in this specific "follow-up write after a write" pattern.
 *
 * Fix shape: mirror H1's canonical_route pattern but on the chat
 * (forward) path instead of the resume (backward) path. Walk the
 * conversation history; if we detect any successful write since session
 * start, prepend a `<post_write_anchor>` system-instruction block to
 * the next user message. The block is short, directive, and points the
 * LLM at the freshest balance_check tool_result by turn index.
 *
 * Why this should work where the system prompt didn't: the prompt
 * lives at the top of context (~24k cached tokens deep) and the LLM
 * activates rules opportunistically. The anchor block lives RIGHT
 * BEFORE the user's prompt — same shape as canonical_route which we
 * already proved works for grounding (see H1 smoke v4: LLM correctly
 * cited the on-chain route over a stale prior swap_quote because
 * canonical_route was inline in the resume's user message).
 *
 * What this is NOT: a guard. The bundle still settles even when this
 * fires; the LLM still has full agency to call/skip balance_check. We
 * are bias-shifting, not enforcing. Engine-side enforcement (the
 * Insufficient Balance guard at packages/engine/src/guards.ts) remains
 * the safety net — and DID catch the failed swap at [28] in the broken
 * smoke. This anchor is the UX-cleanup layer: stop the LLM from
 * proposing a write that's about to fail.
 */

import type { Message } from '@t2000/engine';

/**
 * Tools whose `tool_use` blocks unambiguously indicate a write executed.
 * `prepare_bundle` is intentionally NOT in this list — it's a planning
 * tool whose execution doesn't move funds. The actual bundle write
 * happens via the chat-route's fast-path-bundle and shows up in history
 * as plain text ("Confirmed. Compiled into one atomic Payment Intent…")
 * + a `<canonical_route>` injection in the next user message; we detect
 * THAT instead via the canonical_route check.
 */
const WRITE_TOOL_NAMES = new Set<string>([
  'save_deposit',
  'withdraw',
  'send_transfer',
  'borrow',
  'repay_debt',
  'swap_execute',
  'claim_rewards',
  'harvest_rewards',
  'pay_api',
  'volo_stake',
  'volo_unstake',
]);

/**
 * Audric's PWR (post-write refresh) emits `balance_check` and
 * `savings_info` tool_use blocks AFTER every successful write. The
 * tool_use IDs use stable prefixes (`ce_check` / `ngs_info`) but we
 * don't depend on the prefix — any successful balance_check tool_result
 * counts, regardless of who initiated the call (PWR, the LLM directly,
 * or the session bootstrap).
 */
const FRESH_BALANCE_TOOLS = new Set<string>(['balance_check', 'savings_info']);

interface AnchorWalkResult {
  /** Index of the most recent message containing a write indicator (write tool_use OR canonical_route text). -1 if none. */
  lastWriteIndex: number;
  /** Index of the most recent message containing a successful balance_check or savings_info tool_result. -1 if none. */
  lastFreshBalanceIndex: number;
  /** Approximate "turn number" of the freshest balance_check (= history index, 0-based). */
  freshBalanceTurnLabel: number;
}

/**
 * Walk the engine's message ledger once and capture the two indices we
 * need to decide whether to inject the anchor + what turn to point the
 * LLM at. Linear in history length; O(N) where N is typically < 50
 * messages per session.
 */
export function walkForAnchorState(history: readonly Message[]): AnchorWalkResult {
  let lastWriteIndex = -1;
  let lastFreshBalanceIndex = -1;

  // Build a lookup of toolUseId → toolName so tool_result blocks (which
  // only carry the toolUseId, not the name) can be classified.
  const toolNameById = new Map<string, string>();
  for (const msg of history) {
    if (msg.role !== 'assistant') continue;
    for (const block of msg.content) {
      if (block.type === 'tool_use') {
        toolNameById.set(block.id, block.name);
      }
    }
  }

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    for (const block of msg.content) {
      // Write detection — assistant tool_use of a write tool. We don't
      // require a successful tool_result here because the write either
      // (a) yielded `pending_action` and was confirmed (success
      // surfaced via canonical_route below), or (b) ran auto-tier and
      // produced a tool_result we can't easily classify here. Either
      // way, the LLM proposed a write and the conversation has moved
      // past it.
      if (
        msg.role === 'assistant' &&
        block.type === 'tool_use' &&
        WRITE_TOOL_NAMES.has(block.name)
      ) {
        lastWriteIndex = i;
      }

      // Bundle / single-write success indicator — engine injects
      // `<canonical_route>` text in the post-write resume's user
      // message ONLY when at least one write leg succeeded (H1 gate).
      // Presence of canonical_route is the most reliable "a write
      // settled" signal we have for bundles, where the write itself
      // doesn't generate a tool_use in LLM-visible history.
      if (
        msg.role === 'user' &&
        block.type === 'text' &&
        typeof block.text === 'string' &&
        block.text.includes('<canonical_route>')
      ) {
        lastWriteIndex = i;
      }

      // Fresh balance read — any balance_check / savings_info
      // tool_result that wasn't an error. PWR-initiated and
      // LLM-initiated calls both count.
      if (msg.role === 'user' && block.type === 'tool_result') {
        const toolName = toolNameById.get(block.toolUseId);
        if (toolName && FRESH_BALANCE_TOOLS.has(toolName) && !block.isError) {
          lastFreshBalanceIndex = i;
        }
      }
    }
  }

  return {
    lastWriteIndex,
    lastFreshBalanceIndex,
    freshBalanceTurnLabel: lastFreshBalanceIndex,
  };
}

/**
 * Build the `<post_write_anchor>` text block to prepend to the next
 * user message. Returns null when no anchor is needed:
 *
 *   - No write in history yet → no anchor (the session-bootstrap
 *     balance is still the freshest source; LLM has no reason to drift)
 *   - Last write older than the last fresh balance_check → no anchor
 *     ONLY IF the last fresh balance check is also AFTER any write
 *     (this is the always-true case in production today: PWR fires
 *     after every write, so PWR's balance_check is always the freshest
 *     reference. The anchor still fires to point the LLM at it
 *     explicitly because the smoke proved the LLM doesn't reliably
 *     consult it without an inline directive.)
 *
 * The anchor is intentionally short (~70 tokens). It tells the LLM
 * three things:
 *   1. A write recently executed in this session.
 *   2. The freshest balance_check is at history turn N — use it.
 *   3. Forbidden: citing balance figures from prior `<eval_summary>` /
 *      thinking / text. Re-derive every per-turn balance from the
 *      pointed-at result.
 */
export function buildPostWriteAnchorBlock(history: readonly Message[]): string | null {
  const { lastWriteIndex, lastFreshBalanceIndex, freshBalanceTurnLabel } =
    walkForAnchorState(history);

  // No write has happened yet in this session. The session bootstrap
  // balance is still the source of truth and the LLM hasn't had a
  // chance to drift on stale post-write data — skip injection.
  if (lastWriteIndex < 0) return null;

  // Defensive: a write happened but we can't find any fresh balance
  // result in history (shouldn't happen in production — PWR is
  // guaranteed to fire after every write). When it does happen, we
  // STILL fire the anchor but reframe the directive to "call
  // balance_check yourself before any new write" since there's
  // nothing concrete to point at.
  if (lastFreshBalanceIndex < 0) {
    return [
      '<post_write_anchor>',
      'A write tool executed earlier in this session. There is no balance_check result in your visible history to anchor on. Before proposing any new write that involves wallet funds (swap_execute, save_deposit, send_transfer, withdraw, borrow, repay_debt, harvest_rewards, etc.), you MUST call balance_check FIRST in this turn. Do NOT cite balance figures from prior `<eval_summary>`, prior text, or prior `thinking` — they are stale.',
      '</post_write_anchor>',
    ].join('\n');
  }

  return [
    '<post_write_anchor>',
    `A write executed earlier in this session. The freshest balance_check / savings_info result in your conversation history is at turn ${freshBalanceTurnLabel} (most recent in your context). For ANY new write you propose this turn, derive the wallet balance from THAT result, not from prior \`<eval_summary>\`, prior text, prior \`thinking\`, or your own running tally. If the freshest balance result is more than 2 turns old AND the user is asking for a new write, call balance_check FIRST in this turn before composing the eval_summary or proposing the write.`,
    '</post_write_anchor>',
  ].join('\n');
}
