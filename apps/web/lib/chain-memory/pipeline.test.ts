import { describe, it, expect } from 'vitest';
import type { AppEventRecord, SnapshotRecord } from './types';
import { runAllClassifiers } from './classifiers';

/**
 * Integration-style test: seeds realistic AppEvent + PortfolioSnapshot data,
 * runs the full classifier pipeline, and verifies the expected UserMemory
 * records that would be created with source: 'chain'.
 */
describe('chain memory pipeline integration', () => {
  it('produces expected facts from realistic user data', () => {
    const now = new Date();

    // Simulate a user who:
    // - saves ~$50 every Friday for 5 weeks
    // - has conservative HF (always > 2.5)
    // - has growing savings over 3 months
    // - made one large $500 send

    const events: AppEventRecord[] = [];

    // Weekly Friday saves
    for (let week = 0; week < 5; week++) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - week * 7);
      while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
      events.push({
        type: 'save',
        title: 'Saved USDC',
        details: { amountUsd: 48 + Math.random() * 4 },
        createdAt: new Date(d),
      });
    }

    // One large send
    const sendDate = new Date(now);
    sendDate.setUTCDate(sendDate.getUTCDate() - 10);
    events.push({
      type: 'send',
      title: 'Sent SUI',
      details: { amountUsd: 500 },
      createdAt: sendDate,
    });

    // 3 months of portfolio snapshots — growing savings, conservative HF
    const snapshots: SnapshotRecord[] = [];
    for (let day = 0; day < 90; day++) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - (89 - day));
      snapshots.push({
        date: d,
        walletValueUsd: 200,
        savingsValueUsd: 300 + day * 3,
        debtValueUsd: 100,
        netWorthUsd: 400 + day * 3,
        yieldEarnedUsd: day * 0.5,
        healthFactor: 3.0 + Math.random() * 0.5,
      });
    }

    const facts = runAllClassifiers(events, snapshots);

    // Should produce at least: deposit_pattern, risk_profile, large_transaction, compounding_streak
    expect(facts.length).toBeGreaterThanOrEqual(3);

    const types = new Set(facts.map((f) => f.type));
    expect(types.has('deposit_pattern')).toBe(true);
    expect(types.has('risk_profile')).toBe(true);
    expect(types.has('large_transaction')).toBe(true);

    // Verify deposit pattern references Fridays
    const depositFact = facts.find((f) => f.type === 'deposit_pattern');
    expect(depositFact!.fact).toContain('Friday');
    expect(depositFact!.source).toBe('app_event');

    // Verify risk profile is conservative
    const riskFact = facts.find((f) => f.type === 'risk_profile');
    expect(riskFact!.fact).toContain('Conservative');
    expect(riskFact!.source).toBe('snapshot');

    // Verify large transaction
    const largeFact = facts.find((f) => f.type === 'large_transaction');
    expect(largeFact!.fact).toContain('$500');

    // All facts should have valid confidence
    for (const f of facts) {
      expect(f.confidence).toBeGreaterThanOrEqual(0.5);
      expect(f.confidence).toBeLessThanOrEqual(1.0);
    }
  });

  it('simulates the memory insertion mapping', () => {
    const events: AppEventRecord[] = [];
    for (let week = 0; week < 4; week++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - week * 7);
      while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
      events.push({
        type: 'save',
        title: 'Saved USDC',
        details: { amountUsd: 50 },
        createdAt: new Date(d),
      });
    }

    const snaps = Array.from({ length: 10 }, (_, i) => ({
      date: new Date(Date.now() - i * 86_400_000),
      walletValueUsd: 100,
      savingsValueUsd: 500,
      debtValueUsd: 0,
      netWorthUsd: 600,
      yieldEarnedUsd: 5,
      healthFactor: 3.0,
    }));

    const facts = runAllClassifiers(events, snaps);

    // Map facts to UserMemory shape (same logic as the route handler)
    const memoryRecords = facts.map((f) => ({
      memoryType: f.type === 'deposit_pattern' || f.type === 'borrow_behavior' ? 'pattern' : 'fact',
      content: f.fact,
      confidence: f.confidence,
      source: 'chain' as const,
    }));

    expect(memoryRecords.length).toBeGreaterThan(0);
    for (const m of memoryRecords) {
      expect(m.source).toBe('chain');
      expect(['pattern', 'fact']).toContain(m.memoryType);
      expect(m.content.length).toBeGreaterThan(0);
    }

    // deposit_pattern should map to 'pattern' memoryType
    const patternRecord = memoryRecords.find((m) => m.content.includes('Friday'));
    if (patternRecord) {
      expect(patternRecord.memoryType).toBe('pattern');
    }
  });
});
