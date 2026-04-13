import { describe, it, expect } from 'vitest';
import type { AppEventRecord, SnapshotRecord } from './types';
import {
  classifyDepositPattern,
  classifyRiskProfile,
  classifyYieldBehavior,
  classifyBorrowBehavior,
  classifyNearLiquidation,
  classifyLargeTransactions,
  classifyCompoundingStreak,
  runAllClassifiers,
} from './classifiers';

// ---------------------------------------------------------------------------
// Helpers — build test data
// ---------------------------------------------------------------------------

function makeEvent(
  type: string,
  daysAgo: number,
  amountUsd?: number,
): AppEventRecord {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return {
    type,
    title: `${type} event`,
    details: amountUsd !== undefined ? { amountUsd } : null,
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

function fridaysAgo(count: number): AppEventRecord[] {
  const events: AppEventRecord[] = [];
  const now = new Date();
  let d = new Date(now);
  // Find next Friday
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  for (let i = 0; i < count; i++) {
    events.push({
      type: 'save',
      title: 'save event',
      details: { amountUsd: 50 },
      createdAt: new Date(d),
    });
    d.setUTCDate(d.getUTCDate() - 7);
  }
  return events;
}

// ---------------------------------------------------------------------------
// classifyDepositPattern
// ---------------------------------------------------------------------------

describe('classifyDepositPattern', () => {
  it('returns null with fewer than 3 deposits', () => {
    const events = [makeEvent('save', 1, 50), makeEvent('save', 8, 50)];
    expect(classifyDepositPattern(events)).toBeNull();
  });

  it('returns null with inconsistent amounts', () => {
    const events = [
      makeEvent('save', 1, 10),
      makeEvent('save', 8, 100),
      makeEvent('save', 15, 500),
    ];
    expect(classifyDepositPattern(events)).toBeNull();
  });

  it('detects consistent Friday saves', () => {
    const events = fridaysAgo(4);
    const result = classifyDepositPattern(events);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('deposit_pattern');
    expect(result!.fact).toContain('Friday');
    expect(result!.fact).toContain('$50');
    expect(result!.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('returns null with empty input', () => {
    expect(classifyDepositPattern([])).toBeNull();
  });

  it('ignores non-save events', () => {
    const events = [
      makeEvent('swap', 1, 50),
      makeEvent('swap', 8, 50),
      makeEvent('swap', 15, 50),
    ];
    expect(classifyDepositPattern(events)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyRiskProfile
// ---------------------------------------------------------------------------

describe('classifyRiskProfile', () => {
  it('returns null with fewer than 7 snapshots', () => {
    const snaps = Array.from({ length: 5 }, (_, i) =>
      makeSnapshot(i, { healthFactor: 3.0 }),
    );
    expect(classifyRiskProfile(snaps)).toBeNull();
  });

  it('classifies conservative when HF never below 2.5', () => {
    const snaps = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot(i, { healthFactor: 3.0 + i * 0.1 }),
    );
    const result = classifyRiskProfile(snaps);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('risk_profile');
    expect(result!.fact).toContain('Conservative');
  });

  it('classifies near-liquidation when HF reached below 1.6', () => {
    const snaps = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot(i, { healthFactor: i === 3 ? 1.4 : 2.5 }),
    );
    const result = classifyRiskProfile(snaps);
    expect(result).not.toBeNull();
    expect(result!.fact).toContain('near-liquidation');
    expect(result!.fact).toContain('1.40');
  });

  it('classifies moderate for mid-range HF', () => {
    const snaps = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot(i, { healthFactor: 2.0 }),
    );
    const result = classifyRiskProfile(snaps);
    expect(result).not.toBeNull();
    expect(result!.fact).toContain('Moderate');
  });

  it('higher confidence with more data points', () => {
    const snaps = Array.from({ length: 20 }, (_, i) =>
      makeSnapshot(i, { healthFactor: 3.0 }),
    );
    const result = classifyRiskProfile(snaps);
    expect(result!.confidence).toBe(0.9);
  });

  it('returns null with empty input', () => {
    expect(classifyRiskProfile([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyYieldBehavior
// ---------------------------------------------------------------------------

describe('classifyYieldBehavior', () => {
  it('detects compounding when no withdrawals and savings growing', () => {
    const events: AppEventRecord[] = [];
    const snaps = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot(9 - i, { savingsValueUsd: 100 + i * 10 }),
    );
    const result = classifyYieldBehavior(events, snaps);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('yield_behavior');
    expect(result!.fact).toContain('compound');
  });

  it('detects reinvestment when claims and same-day re-deposits', () => {
    const now = new Date();
    const day1 = new Date(now);
    day1.setUTCDate(day1.getUTCDate() - 7);
    const day2 = new Date(now);
    day2.setUTCDate(day2.getUTCDate() - 14);

    const events: AppEventRecord[] = [
      { type: 'claim_rewards', title: 'claim', details: null, createdAt: day1 },
      { type: 'save', title: 'save', details: { amountUsd: 5 }, createdAt: day1 },
      { type: 'claim_rewards', title: 'claim', details: null, createdAt: day2 },
      { type: 'save', title: 'save', details: { amountUsd: 4 }, createdAt: day2 },
    ];
    const snaps = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot(i, { savingsValueUsd: 100 }),
    );
    const result = classifyYieldBehavior(events, snaps);
    expect(result).not.toBeNull();
    expect(result!.fact).toContain('reinvest');
  });

  it('returns null with insufficient snapshots', () => {
    expect(classifyYieldBehavior([], [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyBorrowBehavior
// ---------------------------------------------------------------------------

describe('classifyBorrowBehavior', () => {
  it('returns null with fewer than 2 borrows', () => {
    const events = [makeEvent('borrow', 10), makeEvent('repay', 5)];
    expect(classifyBorrowBehavior(events)).toBeNull();
  });

  it('detects repayment pattern', () => {
    const events = [
      makeEvent('borrow', 30),
      makeEvent('repay', 25),
      makeEvent('borrow', 15),
      makeEvent('repay', 10),
    ];
    const result = classifyBorrowBehavior(events);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('borrow_behavior');
    expect(result!.fact).toContain('Borrowed 2 times');
    expect(result!.fact).toContain('days');
  });

  it('returns null with empty input', () => {
    expect(classifyBorrowBehavior([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyNearLiquidation
// ---------------------------------------------------------------------------

describe('classifyNearLiquidation', () => {
  it('returns null when all HF values are safe', () => {
    const snaps = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot(i, { healthFactor: 2.5 }),
    );
    expect(classifyNearLiquidation(snaps)).toBeNull();
  });

  it('detects critical HF event', () => {
    const snaps = [
      makeSnapshot(5, { healthFactor: 2.5 }),
      makeSnapshot(3, { healthFactor: 1.3 }),
      makeSnapshot(1, { healthFactor: 2.0 }),
    ];
    const result = classifyNearLiquidation(snaps);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('near_liquidation');
    expect(result!.fact).toContain('1.30');
    expect(result!.confidence).toBe(0.95);
  });

  it('returns null with empty input', () => {
    expect(classifyNearLiquidation([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyLargeTransactions
// ---------------------------------------------------------------------------

describe('classifyLargeTransactions', () => {
  it('returns null when all amounts are tiny', () => {
    const events = [makeEvent('save', 1, 5), makeEvent('send', 2, 3)];
    expect(classifyLargeTransactions(events)).toBeNull();
  });

  it('finds the largest transaction', () => {
    const events = [
      makeEvent('save', 10, 50),
      makeEvent('save', 5, 500),
      makeEvent('send', 2, 200),
    ];
    const result = classifyLargeTransactions(events);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('large_transaction');
    expect(result!.fact).toContain('$500');
    expect(result!.fact).toContain('save');
  });

  it('returns null with empty input', () => {
    expect(classifyLargeTransactions([])).toBeNull();
  });

  it('returns null when details are missing', () => {
    const events: AppEventRecord[] = [
      { type: 'save', title: 'save', details: null, createdAt: new Date() },
    ];
    expect(classifyLargeTransactions(events)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyCompoundingStreak
// ---------------------------------------------------------------------------

describe('classifyCompoundingStreak', () => {
  it('returns null with insufficient snapshots', () => {
    const snaps = Array.from({ length: 10 }, (_, i) => makeSnapshot(i));
    expect(classifyCompoundingStreak(snaps)).toBeNull();
  });

  it('detects multi-month growth streak', () => {
    const snaps: SnapshotRecord[] = [];
    for (let month = 0; month < 5; month++) {
      for (let day = 0; day < 5; day++) {
        const d = new Date();
        d.setUTCMonth(d.getUTCMonth() - (4 - month));
        d.setUTCDate(day + 1);
        snaps.push({
          date: d,
          walletValueUsd: 100,
          savingsValueUsd: 100 + month * 50,
          debtValueUsd: 0,
          netWorthUsd: 200 + month * 50,
          yieldEarnedUsd: 5,
          healthFactor: null,
        });
      }
    }
    const result = classifyCompoundingStreak(snaps);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('compounding_streak');
    expect(result!.fact).toContain('consecutive months');
  });

  it('returns null with empty input', () => {
    expect(classifyCompoundingStreak([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runAllClassifiers
// ---------------------------------------------------------------------------

describe('runAllClassifiers', () => {
  it('returns empty array for empty input', () => {
    expect(runAllClassifiers([], [])).toEqual([]);
  });

  it('collects multiple facts', () => {
    const events = fridaysAgo(4);
    events.push(makeEvent('send', 5, 500));

    const snaps = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot(i, { healthFactor: 3.0 }),
    );

    const facts = runAllClassifiers(events, snaps);
    expect(facts.length).toBeGreaterThanOrEqual(2);
    const types = facts.map((f) => f.type);
    expect(types).toContain('deposit_pattern');
    expect(types).toContain('risk_profile');
    expect(types).toContain('large_transaction');
  });
});
