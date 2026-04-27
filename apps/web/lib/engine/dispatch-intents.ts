// ---------------------------------------------------------------------------
// [v0.48] Pure helper that dedups the classifier-driven read-intent list
// before the chat route pre-dispatches them. Pulled out of `chat/route.ts`
// so the dedup semantics can be unit-tested without booting the full SSE
// handler.
//
// History:
//
//   - v1.4 introduced this helper to merge two sources: a synthetic
//     "resumed-session pre-fetch" set (balance_check + savings_info,
//     unconditionally fired on every turn of a returning auth session)
//     and the classifier output. The synthetic set was meant to cover
//     bare-message resumes ("hey", "what should I do") that wouldn't
//     classify to anything, so the LLM still saw fresh balance/savings
//     state.
//
//   - v0.48 deletes the synthetic set. Three independent context
//     sources already cover the freshness gap:
//       1. `<financial_context>` system-prompt block (daily snapshot of
//          balance / savings / debt / HF / APY / recent activity).
//       2. `READ_INTENT_RULES` for explicit balance/savings questions.
//       3. `EngineConfig.postWriteRefresh` for after-action freshness.
//     The unconditional pre-fetch was leaking — asking "what's <contact>'s
//     address" rendered two cards of the USER's own data before the LLM
//     ever saw the message — so we removed it.
//
// The helper now degenerates to "dedup classified intents by
// (toolName, argsFingerprint)". The function signature is preserved
// (still takes an input object) so callers can be migrated independently
// and so future synthetic sources can be added back in a structured way
// if a real need surfaces.
// ---------------------------------------------------------------------------

import { argsFingerprint, type ReadIntent } from './intent-dispatcher';

export interface DispatchIntentsInput {
  /** Output of `classifyReadIntents(message)` — never null. */
  classified: readonly ReadIntent[];
}

export function buildDispatchIntents(input: DispatchIntentsInput): ReadIntent[] {
  const seen = new Set<string>();
  const intents: ReadIntent[] = [];

  for (const intent of input.classified) {
    const key = `${intent.toolName}:${argsFingerprint(intent.args)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    intents.push(intent);
  }

  return intents;
}
