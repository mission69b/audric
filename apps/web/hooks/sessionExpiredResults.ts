import type { PendingAction } from '@/lib/engine-types';
import { SESSION_EXPIRED_USER_MESSAGE } from '@/hooks/executeToolAction';

/**
 * [S.125 Tier 4.3] Single source of truth for the "session expired" tool-result
 * shape that the dashboard's pre-flight gate AND the SDK error-catch path
 * both produce.
 *
 * Why split this out:
 * - `executeToolAction` has its own catch wrapper that synthesizes the same
 *   shape when the SDK throws `EnokiSessionExpiredError` (executeToolAction.ts
 *   ~line 71-86 for single-write, ~line 575-592 for bundle).
 * - Tier 4.3's pre-flight gate in `dashboard-content.tsx` synthesizes the same
 *   shape WITHOUT calling the SDK at all (because it knows the session is dead
 *   from `useZkLogin().status === 'expired'`, no point round-tripping to Enoki).
 * - If those two shapes drift, `BundleReceiptBlockView`'s "session expired"
 *   render path silently breaks for one of them. Centralizing the construction
 *   here is the single defence against that drift.
 *
 * Both consumers should import from THIS file (and `executeToolAction.ts`'s
 * inline synthesis should be migrated to use these in a follow-up — leaving
 * intact for now because the in-place catch is in the canonical SDK error
 * path and any change there needs a careful re-test).
 */

export interface SessionExpiredSingleResult {
  success: false;
  data: {
    success: false;
    error: string;
    _sessionExpired: true;
  };
}

export interface SessionExpiredStepResult {
  toolUseId: string;
  attemptId: string;
  result: {
    success: false;
    error: string;
    _sessionExpired: true;
  };
  isError: true;
}

export interface SessionExpiredBundleResult {
  success: false;
  error: string;
  sessionExpired: true;
  stepResults: SessionExpiredStepResult[];
}

export function makeExpiredSingleResult(): SessionExpiredSingleResult {
  return {
    success: false,
    data: {
      success: false,
      error: SESSION_EXPIRED_USER_MESSAGE,
      _sessionExpired: true,
    },
  };
}

export function makeExpiredBundleResult(action: PendingAction): SessionExpiredBundleResult {
  const stepResults = (action.steps ?? []).map((step) => ({
    toolUseId: step.toolUseId,
    attemptId: step.attemptId,
    result: {
      success: false as const,
      error: SESSION_EXPIRED_USER_MESSAGE,
      _sessionExpired: true as const,
    },
    isError: true as const,
  }));
  return {
    success: false,
    error: SESSION_EXPIRED_USER_MESSAGE,
    sessionExpired: true,
    stepResults,
  };
}
