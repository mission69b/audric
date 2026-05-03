import { describe, expect, it } from 'vitest';
import { endsWithQuestion, deriveSuggestedActions } from './suggested-actions';
import type { ToolExecution } from '@/lib/engine-types';

// ─────────────────────────────────────────────────────────────────────
// [F15 / 2026-05-03] Question-detection heuristic
//
// Drives chip suppression when the assistant message ends with a
// question. Repro: a 6-op compound flow had the LLM emit Turn 1 = reads
// + plan ending in "Confirm to proceed?" with no pending_action yet,
// and the chip system surfaced "EXECUTE SWAP" off the last `swap_quote`
// tool — clicking it sent "Execute the swap" which the LLM read as a
// fresh swap request, NOT plan execution.
// ─────────────────────────────────────────────────────────────────────
describe('endsWithQuestion (F15)', () => {
  it('detects a plain trailing question', () => {
    expect(endsWithQuestion('Confirm to proceed?')).toBe(true);
  });

  it('survives trailing whitespace / newline', () => {
    expect(endsWithQuestion('Ready to send?  \n  ')).toBe(true);
    expect(endsWithQuestion('Ready to send?\n')).toBe(true);
  });

  it('survives markdown emphasis / punct after the "?"', () => {
    expect(endsWithQuestion('**Confirm to proceed?**')).toBe(true);
    expect(endsWithQuestion('Ready?_')).toBe(true);
    expect(endsWithQuestion('`Ready?`')).toBe(true);
    expect(endsWithQuestion('(Confirm to proceed?)')).toBe(true);
    expect(endsWithQuestion('"Ready?"')).toBe(true);
  });

  it('catches the production 6-op repro tail', () => {
    const longPlan =
      'Execution plan:\n1. Repay 2.006004 USDsui debt\n2. Swap 2 USDC → 2.174 SUI\n' +
      '… (more steps) …\n6. Send 1 SUI to funkii.sui\n\n' +
      'USDC used: 7.00 (37.67 available ✓) · USDsui used to repay: 2.006\n\n' +
      'Confirm to proceed?';
    expect(endsWithQuestion(longPlan)).toBe(true);
  });

  it('returns false on declarative messages', () => {
    expect(endsWithQuestion('Saved 100 USDC.')).toBe(false);
    expect(endsWithQuestion('All done!')).toBe(false);
  });

  it('returns false when "?" appears mid-text but tail is declarative', () => {
    expect(endsWithQuestion('Was that ok? Yes it was.')).toBe(false);
  });

  it('returns false on empty / null / undefined', () => {
    expect(endsWithQuestion('')).toBe(false);
    expect(endsWithQuestion(undefined)).toBe(false);
    expect(endsWithQuestion(null)).toBe(false);
  });
});

// Existing chip-derivation behavior — pin to make sure the F15 helper
// add-on didn't break the chip resolver.
describe('deriveSuggestedActions (regression)', () => {
  it('returns DEFAULT_ACTIONS when no tools', () => {
    const actions = deriveSuggestedActions(undefined);
    expect(actions).toHaveLength(2);
    expect(actions[0].label).toBe('CHECK BALANCE');
  });

  it('returns swap-specific chips after a swap_quote tool', () => {
    const tools: ToolExecution[] = [
      {
        toolUseId: 't1',
        toolName: 'swap_quote',
        input: {},
        result: { fromToken: 'USDC', toToken: 'SUI' },
        status: 'done',
      } as ToolExecution,
    ];
    const actions = deriveSuggestedActions(tools);
    expect(actions.find((a) => a.label === 'EXECUTE SWAP')).toBeDefined();
  });
});
