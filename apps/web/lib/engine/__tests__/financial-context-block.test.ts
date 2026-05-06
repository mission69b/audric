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
  // [Bug 1c / 2026-04-27] USDsui fields default to null in the base snapshot
  // so existing assertions still test the USDC-only rendering path. The new
  // "renders USDsui breakouts" suite below exercises the multi-stable path.
  savingsUsdsui: null,
  debtUsdc: 50,
  walletUsdc: 12.5,
  walletUsdsui: null,
  healthFactor: 2.456,
  currentApy: 4.234,
  recentActivity: 'Saved $100.00.',
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

  it('omits pending advice when null', () => {
    const out = buildFinancialContextBlock({ ...baseSnapshot, pendingAdvice: null });
    expect(out).not.toContain('Last advice');
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

  describe('[Bug 1c / 2026-04-27] USDsui breakouts', () => {
    it('renders USDC-only Savings line when savingsUsdsui is null or 0', () => {
      const out = buildFinancialContextBlock(baseSnapshot);
      expect(out).toContain('Savings: $1234.57 USDC');
      expect(out).not.toContain('USDsui');
    });

    it('renders combined Savings line with USDsui breakout', () => {
      const out = buildFinancialContextBlock({
        ...baseSnapshot,
        savingsUsdc: 100,
        savingsUsdsui: 50,
      });
      expect(out).toContain('Savings (NAVI): $100.00 USDC + $50.00 USDsui = $150.00 total stables');
      expect(out).not.toContain('Savings: $100.00 USDC\n');
    });

    it('renders USDC-only Wallet line when walletUsdsui is null or 0', () => {
      const out = buildFinancialContextBlock(baseSnapshot);
      expect(out).toContain('Wallet (non-savings): $12.50 USDC equiv');
    });

    it('renders combined Wallet line with USDsui breakout', () => {
      const out = buildFinancialContextBlock({
        ...baseSnapshot,
        walletUsdc: 81.30,
        walletUsdsui: 0.99,
      });
      expect(out).toContain(
        'Wallet stables (non-savings): $81.30 USDC + $0.99 USDsui = $82.29 total',
      );
      expect(out).not.toContain('Wallet (non-savings): $81.30 USDC equiv');
    });

    it('falls back to USDC-only label when USDsui values are 0', () => {
      const out = buildFinancialContextBlock({
        ...baseSnapshot,
        savingsUsdsui: 0,
        walletUsdsui: 0,
      });
      expect(out).toContain('Savings: $1234.57 USDC');
      expect(out).toContain('Wallet (non-savings): $12.50 USDC equiv');
    });
  });

  it('appends an orientation-only instruction that defers to the rich-card rule for direct read questions', () => {
    // [v0.50.2] The earlier "do NOT re-derive these numbers with tool calls"
    // line directly contradicted the rich-card rendering rule above it in
    // the system prompt and made the LLM answer "what's my balance" from
    // the snapshot text instead of calling balance_check (so the rich
    // BalanceCard never rendered for self-queries). The replacement frames
    // the block as orientation-only and explicitly defers to the rich-card
    // rule for balance / savings / net worth / health questions.
    const out = buildFinancialContextBlock(baseSnapshot);
    expect(out).toContain('orientation');
    expect(out).toContain('NOT a substitute for tool calls');
    expect(out).toContain('Rich-card rendering on direct read questions');
    expect(out).not.toContain('do NOT re-derive these numbers with tool calls');
  });

});
