/**
 * [v1.4 Item 6] Pure helpers for the pending-action modification protocol.
 *
 * The same overlay logic is needed in three places: the resume API route
 * (server-side, before re-driving the engine), the unified timeline (client,
 * before invoking on-chain execution), and tests. Extracting it here avoids
 * subtle drift between those copies.
 */
import type { PendingAction } from '@t2000/engine';

/**
 * Apply user-edited fields onto an action's input. Returns the original
 * input untouched when no modifications are present so callers can keep
 * referential equality on the no-op path.
 */
export function applyModifications(
  input: unknown,
  modifications: Record<string, unknown> | undefined,
): unknown {
  if (!modifications || Object.keys(modifications).length === 0) return input;
  if (input && typeof input === 'object') {
    return { ...(input as Record<string, unknown>), ...modifications };
  }
  return modifications;
}

/**
 * Coerce the original boolean + optional outcome into the canonical
 * `TurnMetrics.pendingActionOutcome` value. `outcome` (when sent by the
 * client) wins; otherwise we infer `modified` from the presence of any
 * modifications, falling back to approved/declined.
 */
export function resolveOutcome(
  approved: boolean,
  modifications: Record<string, unknown> | undefined,
  explicitOutcome?: 'approved' | 'declined' | 'modified',
): 'approved' | 'declined' | 'modified' {
  if (explicitOutcome) return explicitOutcome;
  if (modifications && Object.keys(modifications).length > 0) return 'modified';
  return approved ? 'approved' : 'declined';
}

/**
 * Apply modifications to a `PendingAction` shallowly, returning a new
 * action object. Used by the resume route to ensure the engine reconstructs
 * the turn from the actually-approved values.
 */
export function applyModificationsToAction(
  action: PendingAction,
  modifications: Record<string, unknown> | undefined,
): PendingAction {
  if (!modifications || Object.keys(modifications).length === 0) return action;
  return {
    ...action,
    input: applyModifications(action.input, modifications),
  };
}
