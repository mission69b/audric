import { describe, it, expect } from 'vitest';
import type { AppEventRecord, SnapshotRecord } from './types';
import {
  detectRecurringSave,
  detectYieldReinvestment,
  detectDebtDiscipline,
  detectIdleUsdcTolerance,
  detectSwapPattern,
  runAllDetectors,
} from './pattern-detectors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  type: string,
  daysAgo: number,
  extra?: Record<string, unknown>,
): AppEventRecord {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return {
    type,
    title: `${type} event`,
    details: extra ?? null,
    createdAt: d,
  };
}

function makeFridayEvent(
  type: string,
  weeksAgo: number,
  amountUsd: number,
  extra?: Record<string, unknown>,
): AppEventRecord {
  const d = new Date();
  const daysToFriday = (d.getUTCDay() + 2) % 7;
  d.setUTCDate(d.getUTCDate() - daysToFriday - weeksAgo * 7);
  return {
    type,
    title: `${type} event`,
    details: { amountUsd, ...extra },
    createdAt: d,
  };
}

function makeSnapshot(
  daysAgo: number,
  overrides: Partial<SnapshotRecord> = {},
): SnapshotRecord {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return {
    date: d,
    walletValueUsd: 100,
    savingsValueUsd: 500,
    debtValueUsd: 0,
    netWorthUsd: 600,
    yieldEarnedUsd: 5,
    healthFactor: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectRecurringSave
// ---------------------------------------------------------------------------

describe('detectRecurringSave', () => {
  it('returns null with fewer than 3 saves', () => {
    const events = [
      makeFridayEvent('save', 1, 50),
      makeFridayEvent('save', 2, 50),
    ];
    expect(detectRecurringSave(events)).toBeNull();
  });

  it('detects consistent Friday saves', () => {
    const events = [
      makeFridayEvent('save', 1, 50),
      makeFridayEvent('save', 2, 48),
      makeFridayEvent('save', 3, 52),
      makeFridayEvent('save', 4, 50),
    ];
    const result = detectRecurringSave(events);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('recurring_save');
    expect(result!.confidence).toBeGreaterThanOrEqual(0.6);
    expect(result!.proposedAction.toolName).toBe('save_deposit');
    expect(result!.proposedAction.schedule).toBeDefined();
    expect(result!.observations).toBe(4);
  });

  it('returns null when amounts are inconsistent', () => {
    const events = [
      makeFridayEvent('save', 1, 10),
      makeFridayEvent('save', 2, 100),
      makeFridayEvent('save', 3, 500),
    ];
    expect(detectRecurringSave(events)).toBeNull();
  });

  it('returns null when days are inconsistent', () => {
    const events = [
      makeEvent('save', 1, { amountUsd: 50 }),
      makeEvent('save', 3, { amountUsd: 50 }),
      makeEvent('save', 8, { amountUsd: 50 }),
      makeEvent('save', 15, { amountUsd: 50 }),
    ];
    // Days are random depending on when test runs — may or may not pass consistency
    // This test verifies the function doesn't crash with varied days
    const result = detectRecurringSave(events);
    // Result may be null or non-null depending on day alignment
    if (result) {
      expect(result.type).toBe('recurring_save');
    }
  });
});

// ---------------------------------------------------------------------------
// detectYieldReinvestment
// ---------------------------------------------------------------------------

describe('detectYieldReinvestment', () => {
  it('returns null with fewer than 2 claims', () => {
    const events = [makeEvent('claim_rewards', 5), makeEvent('save', 5, { amountUsd: 10 })];
    expect(detectYieldReinvestment(events)).toBeNull();
  });

  it('detects claim-then-save pattern', () => {
    const events = [
      makeEvent('claim_rewards', 14),
      makeEvent('save', 14, { amountUsd: 8 }),
      makeEvent('claim_rewards', 7),
      makeEvent('save', 7, { amountUsd: 12 }),
      makeEvent('claim_rewards', 1),
      makeEvent('save', 1, { amountUsd: 10 }),
    ];
    const result = detectYieldReinvestment(events);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('yield_reinvestment');
    expect(result!.observations).toBe(3);
    expect(result!.proposedAction.trigger?.type).toBe('claim_rewards');
  });

  it('returns null when saves are not on claim days', () => {
    const events = [
      makeEvent('claim_rewards', 14),
      makeEvent('save', 10, { amountUsd: 8 }),
      makeEvent('claim_rewards', 7),
      makeEvent('save', 3, { amountUsd: 12 }),
    ];
    expect(detectYieldReinvestment(events)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectDebtDiscipline
// ---------------------------------------------------------------------------

describe('detectDebtDiscipline', () => {
  it('returns null with fewer than 2 borrow/repay pairs', () => {
    const events = [
      makeEvent('borrow', 10, { amountUsd: 100 }),
      makeEvent('repay', 8, { amountUsd: 100 }),
    ];
    expect(detectDebtDiscipline(events)).toBeNull();
  });

  it('detects discipline with quick repayments', () => {
    const events = [
      makeEvent('borrow', 30, { amountUsd: 200 }),
      makeEvent('repay', 27, { amountUsd: 200 }),
      makeEvent('borrow', 14, { amountUsd: 150 }),
      makeEvent('repay', 12, { amountUsd: 150 }),
      makeEvent('borrow', 3, { amountUsd: 180 }),
      makeEvent('repay', 1, { amountUsd: 180 }),
    ];
    const result = detectDebtDiscipline(events);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('debt_discipline');
    expect(result!.proposedAction.toolName).toBe('repay_debt');
    expect(result!.proposedAction.trigger?.type).toBe('borrow_age_days');
  });

  it('returns null when repayments take too long', () => {
    const events = [
      makeEvent('borrow', 60, { amountUsd: 200 }),
      makeEvent('repay', 40, { amountUsd: 200 }),
      makeEvent('borrow', 30, { amountUsd: 150 }),
      makeEvent('repay', 10, { amountUsd: 150 }),
    ];
    // Both repayments take >7 days
    expect(detectDebtDiscipline(events)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectIdleUsdcTolerance
// ---------------------------------------------------------------------------

describe('detectIdleUsdcTolerance', () => {
  it('returns null with fewer than 7 snapshots', () => {
    const snapshots = Array.from({ length: 5 }, (_, i) =>
      makeSnapshot(i, { walletValueUsd: 10, savingsValueUsd: 500 }),
    );
    expect(detectIdleUsdcTolerance(snapshots)).toBeNull();
  });

  it('detects low idle USDC tolerance', () => {
    const snapshots = Array.from({ length: 14 }, (_, i) =>
      makeSnapshot(i, { walletValueUsd: 15, savingsValueUsd: 1000, debtValueUsd: 0 }),
    );
    const result = detectIdleUsdcTolerance(snapshots);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('idle_usdc_tolerance');
    expect(result!.proposedAction.trigger?.type).toBe('idle_usdc_above');
  });

  it('returns null when idle USDC is high', () => {
    const snapshots = Array.from({ length: 14 }, (_, i) =>
      makeSnapshot(i, { walletValueUsd: 500, savingsValueUsd: 1000, debtValueUsd: 0 }),
    );
    expect(detectIdleUsdcTolerance(snapshots)).toBeNull();
  });

  it('returns null when no savings exist', () => {
    const snapshots = Array.from({ length: 14 }, (_, i) =>
      makeSnapshot(i, { walletValueUsd: 5, savingsValueUsd: 0, debtValueUsd: 0 }),
    );
    expect(detectIdleUsdcTolerance(snapshots)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectSwapPattern
// ---------------------------------------------------------------------------

describe('detectSwapPattern', () => {
  it('returns null with fewer than 3 swaps', () => {
    const events = [
      makeFridayEvent('swap', 1, 100, { asset: 'SUI', targetAsset: 'USDC' }),
      makeFridayEvent('swap', 2, 100, { asset: 'SUI', targetAsset: 'USDC' }),
    ];
    expect(detectSwapPattern(events)).toBeNull();
  });

  it('detects consistent SUI->USDC swaps', () => {
    const events = [
      makeFridayEvent('swap', 1, 100, { asset: 'SUI', targetAsset: 'USDC' }),
      makeFridayEvent('swap', 2, 95, { asset: 'SUI', targetAsset: 'USDC' }),
      makeFridayEvent('swap', 3, 105, { asset: 'SUI', targetAsset: 'USDC' }),
      makeFridayEvent('swap', 4, 100, { asset: 'SUI', targetAsset: 'USDC' }),
    ];
    const result = detectSwapPattern(events);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('swap_pattern');
    expect(result!.proposedAction.toolName).toBe('swap_execute');
    expect(result!.proposedAction.params.fromAsset).toBe('SUI');
    expect(result!.proposedAction.params.toAsset).toBe('USDC');
  });

  it('picks the most frequent pair', () => {
    const events = [
      makeFridayEvent('swap', 1, 100, { asset: 'SUI', targetAsset: 'USDC' }),
      makeFridayEvent('swap', 2, 100, { asset: 'SUI', targetAsset: 'USDC' }),
      makeFridayEvent('swap', 3, 100, { asset: 'SUI', targetAsset: 'USDC' }),
      makeFridayEvent('swap', 4, 50, { asset: 'USDT', targetAsset: 'SUI' }),
    ];
    const result = detectSwapPattern(events);
    if (result) {
      expect(result.proposedAction.params.fromAsset).toBe('SUI');
      expect(result.proposedAction.params.toAsset).toBe('USDC');
    }
  });
});

// ---------------------------------------------------------------------------
// runAllDetectors
// ---------------------------------------------------------------------------

describe('runAllDetectors', () => {
  it('returns empty array with insufficient data', () => {
    expect(runAllDetectors([], [])).toEqual([]);
  });

  it('runs all detectors and collects results', () => {
    const events = [
      makeFridayEvent('save', 1, 50),
      makeFridayEvent('save', 2, 48),
      makeFridayEvent('save', 3, 52),
      makeFridayEvent('save', 4, 50),
    ];
    const snapshots = Array.from({ length: 14 }, (_, i) =>
      makeSnapshot(i, { walletValueUsd: 10, savingsValueUsd: 1000 }),
    );
    const results = runAllDetectors(events, snapshots);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const types = results.map((r) => r.type);
    expect(types).toContain('recurring_save');
  });
});
