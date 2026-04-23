import { describe, it, expect } from 'vitest';
import * as sdk from '@t2000/sdk';
import { runSpecConsistencyChecks, assertSpecConsistency } from './spec-consistency';

/**
 * [v1.4 Item 5] Spec consistency tests.
 *
 * The runtime + CI gate is `runSpecConsistencyChecks` / `assertSpecConsistency`
 * itself; these tests guard the gate so it cannot be quietly broken.
 *
 * Deliberately small surface (per plan: 2 tests). The real coverage lives
 * in the runtime invocation paths.
 *
 * The strict assertions activate once SDK 0.40.5 (which exports
 * `SAVE_FEE_BPS`, `BORROW_FEE_BPS`, `OVERLAY_FEE_RATE`) is pinned in
 * `package.json`. While the audric repo still resolves the published 0.40.4,
 * the structural test below verifies the surface is wired (9 assertions
 * present + assertion shapes correct) without requiring the constant values
 * to be present. This is the "Day 4 → Day 5" contract from the plan.
 */
const sdkRecord = sdk as unknown as Record<string, unknown>;
const sdkV1_4Ready =
  typeof sdkRecord.SAVE_FEE_BPS === 'bigint' &&
  typeof sdkRecord.BORROW_FEE_BPS === 'bigint' &&
  typeof sdkRecord.OVERLAY_FEE_RATE === 'number';

describe('[v1.4 Item 5] spec consistency', () => {
  it('exposes 9 well-formed assertions covering fees, decimals, and tool counts', () => {
    const result = runSpecConsistencyChecks();
    expect(result.assertions).toHaveLength(9);
    const ids = result.assertions.map((a) => a.id).sort();
    expect(ids).toEqual([
      'BORROW_FEE_BPS',
      'NO_REPAY_FEE_BPS',
      'NO_SEND_FEE_BPS',
      'NO_WITHDRAW_FEE_BPS',
      'OVERLAY_FEE_RATE',
      'SAVE_FEE_BPS',
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

  it.skipIf(!sdkV1_4Ready)(
    'all 9 assertions pass once SDK 0.40.5 is pinned (post-publish gate)',
    () => {
      const result = runSpecConsistencyChecks();
      const failed = result.assertions.filter((a) => !a.pass);
      if (failed.length) {
        throw new Error(
          `Failed assertions:\n${failed.map((f) => `  - ${f.id}: ${f.message}`).join('\n')}`,
        );
      }
      expect(result.ok).toBe(true);
      expect(() => assertSpecConsistency()).not.toThrow();
    },
  );
});
