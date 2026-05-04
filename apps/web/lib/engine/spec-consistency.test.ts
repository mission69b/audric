import { describe, it, expect } from 'vitest';
import { runSpecConsistencyChecks, assertSpecConsistency } from './spec-consistency';

/**
 * [v1.4 Item 5] Spec consistency tests.
 *
 * The runtime + CI gate is `runSpecConsistencyChecks` / `assertSpecConsistency`
 * itself; these tests guard the gate so it cannot be quietly broken.
 *
 * Deliberately small surface (per plan: 2 tests). The real coverage lives
 * in the runtime invocation paths.
 */
describe('[v1.4 Item 5] spec consistency', () => {
  it('exposes 17 well-formed assertions covering fees, decimals, tool counts, caption-fidelity prompt rules, canonical portfolio exports, and plan-context promotion', () => {
    const result = runSpecConsistencyChecks();
    expect(result.assertions).toHaveLength(17);
    const ids = result.assertions.map((a) => a.id).sort();
    expect(ids).toEqual([
      'BORROW_FEE_BPS',
      'CANONICAL_GET_PORTFOLIO',
      'CANONICAL_GET_RATES',
      'CANONICAL_GET_TOKEN_PRICES',
      'CANONICAL_GET_TRANSACTION_HISTORY',
      'CONFIRM_DETECTION_PLAN_CONTEXT',
      'NO_REPAY_FEE_BPS',
      'NO_SEND_FEE_BPS',
      'NO_WITHDRAW_FEE_BPS',
      'OVERLAY_FEE_RATE',
      'SAVE_FEE_BPS',
      'STATIC_SYSTEM_PROMPT_DEFI_UNAVAILABLE_RULE',
      'STATIC_SYSTEM_PROMPT_FAILED_WRITE_NARRATION_RULE',
      'STATIC_SYSTEM_PROMPT_NEVER_CONTRADICT_CARD',
      'STATIC_SYSTEM_PROMPT_TOOL_COUNTS',
      'SUI_DECIMALS',
      'USDC_DECIMALS',
    ]);
    for (const a of result.assertions) {
      expect(typeof a.id).toBe('string');
      expect(typeof a.pass).toBe('boolean');
      expect(typeof a.message).toBe('string');
    }
  });

  it('all 17 assertions pass against the live SDK + engine packages and canonical exports', () => {
    const result = runSpecConsistencyChecks();
    const failed = result.assertions.filter((a) => !a.pass);
    if (failed.length) {
      throw new Error(
        `Failed assertions:\n${failed.map((f) => `  - ${f.id}: ${f.message}`).join('\n')}`,
      );
    }
    expect(result.ok).toBe(true);
    expect(() => assertSpecConsistency()).not.toThrow();
  });
});
