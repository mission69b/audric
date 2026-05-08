import { describe, expect, it } from 'vitest';

import { exitCodeFor, summarize, type ScenarioResult } from './reporter';

const result = (overrides: Partial<ScenarioResult>): ScenarioResult => ({
  id: 'x',
  category: 'tier12',
  from: 'SUI',
  to: 'USDC',
  amount: 0.1,
  ms: 100,
  pass: true,
  ...overrides,
});

describe('exitCodeFor', () => {
  it('returns 0 when every scenario passed', () => {
    const summary = summarize([result({})], new Date(), new Date());
    expect(exitCodeFor(summary)).toBe(0);
  });

  it('returns 1 when a happy-path (tier12) scenario failed', () => {
    const summary = summarize(
      [result({ pass: false, failureReason: 'x' })],
      new Date(),
      new Date(),
    );
    expect(exitCodeFor(summary)).toBe(1);
  });

  it('returns 1 when a legacy-stable scenario failed', () => {
    const summary = summarize(
      [result({ category: 'legacy', pass: false, failureReason: 'x' })],
      new Date(),
      new Date(),
    );
    expect(exitCodeFor(summary)).toBe(1);
  });

  it('returns 1 when a cross-tier scenario failed', () => {
    const summary = summarize(
      [result({ category: 'cross-tier', pass: false, failureReason: 'x' })],
      new Date(),
      new Date(),
    );
    expect(exitCodeFor(summary)).toBe(1);
  });

  it('returns 2 when ONLY error-path scenarios failed', () => {
    const summary = summarize(
      [result({ category: 'error', pass: false, failureReason: 'x' })],
      new Date(),
      new Date(),
    );
    expect(exitCodeFor(summary)).toBe(2);
  });

  it('returns 1 when both happy and error paths failed (happy-path dominates)', () => {
    const summary = summarize(
      [
        result({ id: 'a', pass: false, failureReason: 'x' }),
        result({ id: 'b', category: 'error', pass: false, failureReason: 'y' }),
      ],
      new Date(),
      new Date(),
    );
    expect(exitCodeFor(summary)).toBe(1);
  });
});

describe('summarize', () => {
  it('aggregates per-category pass/fail counts', () => {
    const summary = summarize(
      [
        result({ id: '1', category: 'tier12', pass: true }),
        result({ id: '2', category: 'tier12', pass: false, failureReason: 'x' }),
        result({ id: '3', category: 'error', pass: true }),
      ],
      new Date(),
      new Date(),
    );
    expect(summary.byCategory.tier12).toEqual({ total: 2, passed: 1, failed: 1 });
    expect(summary.byCategory.error).toEqual({ total: 1, passed: 1, failed: 0 });
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
  });

  it('computes p50 / p95 / max latencies', () => {
    const summary = summarize(
      Array.from({ length: 10 }, (_, i) => result({ id: `${i}`, ms: (i + 1) * 100 })),
      new Date(),
      new Date(),
    );
    expect(summary.latency.max).toBe(1000);
    expect(summary.latency.p50).toBeGreaterThanOrEqual(500);
    expect(summary.latency.p95).toBeGreaterThanOrEqual(900);
  });

  it('lists only failures in summary.failures', () => {
    const summary = summarize(
      [
        result({ id: 'pass', pass: true }),
        result({ id: 'fail', pass: false, failureReason: 'x' }),
      ],
      new Date(),
      new Date(),
    );
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0].id).toBe('fail');
  });
});
