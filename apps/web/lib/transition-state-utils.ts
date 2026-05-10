// ───────────────────────────────────────────────────────────────────────────
// SPEC 21.1 — Transition-state mutation helper (pure, testable)
//
// Extracted from `useEngine.setLatestTransitionState` so the search-and-
// mutate logic can be unit-tested without spinning up the entire
// `useEngine` hook (which requires auth, address, jwt, SSE mocks, etc).
//
// Contract:
//   - Walk from the end of the messages array to find the most recent
//     assistant message.
//   - If it already has the target state → return the prev array unchanged
//     (referential equality preserved → no React re-render).
//   - Otherwise return a new array with that message updated immutably.
//   - If there is no assistant message → return prev unchanged.
//
// Why "latest assistant message" specifically: the active `pending_action`
// owned by the most recent assistant message is by definition the one being
// confirmed by the user, and the chip should animate on that message's
// surface. Older assistant messages keep whatever state they had (typically
// `done` or undefined).
// ───────────────────────────────────────────────────────────────────────────

import type { EngineChatMessage } from './engine-types';

export type AudricTransitionState =
  | 'routing'
  | 'quoting'
  | 'confirming'
  | 'settling'
  | 'done'
  | null;

export function applyTransitionStateToLatest(
  messages: EngineChatMessage[],
  state: AudricTransitionState,
): EngineChatMessage[] {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role !== 'assistant') continue;
    if (messages[i].transitionState === state) return messages;
    const next = [...messages];
    next[i] = { ...messages[i], transitionState: state };
    return next;
  }
  return messages;
}
