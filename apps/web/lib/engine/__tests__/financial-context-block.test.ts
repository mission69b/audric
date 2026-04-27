import { describe, it, expect } from 'vitest';
import { buildFinancialContextBlock } from '../engine-context';
import type { FinancialContextSnapshot } from '@/lib/redis/user-financial-context';

/**
 * [v1.4.2 — Day 5 / Spec Item 6] Tests for the orientation-snapshot
 * renderer that lives in `engine-context.ts`. The block is consumed by
 * the LLM at engine boot time, so the test pins:
 *   1. Empty input → empty string (so `buildDynamicBlock` can drop the
 *      section without an extra null guard).
 *   2. Tag wrapping is exactly `<financial_context>…</financial_context>`.
 *   3. Numeric formatting matches what dashboards expect (USD with 2dp,
 *      health factor with 2dp, APY with 2dp + percent).
 *   4. Optional fields are omitted when null/empty (no "Health factor:
 *      null" pollution).
 *   5. `daysSinceLastSession` rendering uses Today/Yesterday/Nd ago.
 *   6. Trailing instruction always present so the LLM knows to defer
 *      tool calls when the block already answers the question.
 */
const baseSnapshot: FinancialContextSnapshot = {
  savingsUsdc: 1234.567,
  debtUsdc: 50,
  walletUsdc: 12.5,
  healthFactor: 2.456,
  currentApy: 4.234,
  recentActivity: 'Saved $100.00.',
  openGoals: ['Emergency fund — target $5000', 'New laptop — target $2000'],
  pendingAdvice: 'Consider increasing your savings rate by 5%.',
  daysSinceLastSession: 3,
};

describe('buildFinancialContextBlock', () => {
  it('returns empty string when snapshot is null/undefined', () => {
    expect(buildFinancialContextBlock(null)).toBe('');
    expect(buildFinancialContextBlock(undefined)).toBe('');
  });

  it('wraps the rendered fields in <financial_context> tags', () => {
    const out = buildFinancialContextBlock(baseSnapshot);
    expect(out.startsWith('<financial_context>')).toBe(true);
    expect(out).toContain('</financial_context>');
    const lines = out.split('\n');
    expect(lines[0]).toBe('<financial_context>');
    expect(lines).toContain('</financial_context>');
  });

  it('formats savings / debt / wallet with 2 decimal places', () => {
    const out = buildFinancialContextBlock(baseSnapshot);
    expect(out).toContain('Savings: $1234.57 USDC');
    expect(out).toContain('Wallet (non-savings): $12.50 USDC equiv');
    expect(out).toContain('Debt: $50.00 USDC');
  });

  it('formats health factor and APY with 2 decimal places', () => {
    const out = buildFinancialContextBlock(baseSnapshot);
    expect(out).toContain('Health factor: 2.46');
    expect(out).toContain('Current savings APY: 4.23%');
  });

  it('omits health factor when null', () => {
    const out = buildFinancialContextBlock({ ...baseSnapshot, healthFactor: null });
    expect(out).not.toContain('Health factor:');
  });

  it('omits APY when null', () => {
    const out = buildFinancialContextBlock({ ...baseSnapshot, currentApy: null });
    expect(out).not.toContain('savings APY:');
  });

  it('omits open goals when array is empty', () => {
    const out = buildFinancialContextBlock({ ...baseSnapshot, openGoals: [] });
    expect(out).not.toContain('Open goals:');
  });

  it('omits pending advice when null', () => {
    const out = buildFinancialContextBlock({ ...baseSnapshot, pendingAdvice: null });
    expect(out).not.toContain('Last advice');
  });

  it('joins multiple goals with semicolon-space', () => {
    const out = buildFinancialContextBlock(baseSnapshot);
    expect(out).toContain(
      'Open goals: Emergency fund — target $5000; New laptop — target $2000',
    );
  });

  it('renders "Today" when daysSinceLastSession is 0', () => {
    const out = buildFinancialContextBlock({ ...baseSnapshot, daysSinceLastSession: 0 });
    expect(out).toContain('Last session: Today');
  });

  it('renders "Yesterday" when daysSinceLastSession is 1', () => {
    const out = buildFinancialContextBlock({ ...baseSnapshot, daysSinceLastSession: 1 });
    expect(out).toContain('Last session: Yesterday');
  });

  it('renders "Nd days ago" for 2+ days', () => {
    const out = buildFinancialContextBlock({ ...baseSnapshot, daysSinceLastSession: 7 });
    expect(out).toContain('Last session: 7 days ago');
  });

  it('always appends the do-not-re-derive instruction so the LLM defers tool calls', () => {
    const out = buildFinancialContextBlock(baseSnapshot);
    expect(out).toContain('do NOT re-derive these numbers with tool calls');
    expect(out).toContain('balance_check');
    expect(out).toContain('savings_info');
    expect(out).toContain('health_check');
  });
});
