import { describe, it, expect } from 'vitest';
import { parseActualAmount, buildSwapDisplayData, type BalanceChange } from './balance-changes';

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const USDT_TYPE = '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT';
const SUI_TYPE = '0x2::sui::SUI';

const SWAP_USDC_TO_USDT: BalanceChange[] = [
  { coinType: USDC_TYPE, amount: '-1000000' },   // -1 USDC (6 decimals)
  { coinType: USDT_TYPE, amount: '999000' },      // +0.999 USDT (6 decimals)
  { coinType: SUI_TYPE, amount: '-2000000' },     // -0.002 SUI gas (9 decimals)
];

const SAVE_USDC: BalanceChange[] = [
  { coinType: USDC_TYPE, amount: '-5000000' },    // -5 USDC deposited
];

describe('parseActualAmount', () => {
  it('returns null for undefined changes', () => {
    expect(parseActualAmount(undefined, 'USDC', 'positive')).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(parseActualAmount([], 'USDC', 'positive')).toBeNull();
  });

  it('extracts negative USDC amount (sold)', () => {
    const result = parseActualAmount(SWAP_USDC_TO_USDT, 'USDC', 'negative');
    expect(result).toBe(1);
  });

  it('extracts positive USDT amount (received)', () => {
    const result = parseActualAmount(SWAP_USDC_TO_USDT, 'USDT', 'positive');
    expect(result).toBe(0.999);
  });

  it('extracts negative SUI gas', () => {
    const result = parseActualAmount(SWAP_USDC_TO_USDT, 'SUI', 'negative');
    expect(result).toBe(0.002);
  });

  it('returns null when no matching asset is found', () => {
    const result = parseActualAmount(SWAP_USDC_TO_USDT, 'ETH', 'positive');
    expect(result).toBeNull();
  });

  it('returns null when direction does not match', () => {
    const result = parseActualAmount(SWAP_USDC_TO_USDT, 'USDC', 'positive');
    expect(result).toBeNull();
  });

  it('defaults to USDC when assetHint is undefined', () => {
    const result = parseActualAmount(SAVE_USDC, undefined, 'negative');
    expect(result).toBe(5);
  });

  it('handles case-insensitive matching', () => {
    const result = parseActualAmount(SWAP_USDC_TO_USDT, 'usdt', 'positive');
    expect(result).toBe(0.999);
  });

  it('handles large amounts correctly', () => {
    const changes: BalanceChange[] = [
      { coinType: USDC_TYPE, amount: '50000000000' }, // 50,000 USDC
    ];
    const result = parseActualAmount(changes, 'USDC', 'positive');
    expect(result).toBe(50000);
  });

  it('picks the largest match when multiple entries exist (overlay fee vs user amount)', () => {
    const changes: BalanceChange[] = [
      { coinType: USDT_TYPE, amount: '1000' },    // 0.001 USDT — overlay fee to treasury
      { coinType: USDT_TYPE, amount: '999000' },   // 0.999 USDT — actual received by user
    ];
    const result = parseActualAmount(changes, 'USDT', 'positive');
    expect(result).toBe(0.999);
  });

  it('picks the largest negative match for sold amounts', () => {
    const changes: BalanceChange[] = [
      { coinType: USDC_TYPE, amount: '-1000' },     // small deduction
      { coinType: USDC_TYPE, amount: '-1000000' },   // 1 USDC sold
    ];
    const result = parseActualAmount(changes, 'USDC', 'negative');
    expect(result).toBe(1);
  });
});

describe('buildSwapDisplayData', () => {
  it('builds complete display data from balance changes', () => {
    const result = buildSwapDisplayData(SWAP_USDC_TO_USDT, 'USDC', 'USDT', 1);
    expect(result.fromToken).toBe('USDC');
    expect(result.toToken).toBe('USDT');
    expect(result.fromAmount).toBe(1);
    expect(result.toAmount).toBe(0.999);
    expect(result.received).toBe(0.999);
  });

  it('falls back to input amount when sold amount not in changes', () => {
    const noSoldChanges: BalanceChange[] = [
      { coinType: USDT_TYPE, amount: '999000' },
    ];
    const result = buildSwapDisplayData(noSoldChanges, 'USDC', 'USDT', 1);
    expect(result.fromAmount).toBe(1);
    expect(result.toAmount).toBe(0.999);
  });

  it('sets received to null when to-token not in changes', () => {
    const noReceivedChanges: BalanceChange[] = [
      { coinType: USDC_TYPE, amount: '-1000000' },
    ];
    const result = buildSwapDisplayData(noReceivedChanges, 'USDC', 'USDT', 1);
    expect(result.fromAmount).toBe(1);
    expect(result.toAmount).toBeNull();
    expect(result.received).toBeNull();
  });

  it('handles undefined balance changes', () => {
    const result = buildSwapDisplayData(undefined, 'USDC', 'USDT', 1);
    expect(result.fromAmount).toBe(1);
    expect(result.toAmount).toBeNull();
    expect(result.received).toBeNull();
    expect(result.fromToken).toBe('USDC');
    expect(result.toToken).toBe('USDT');
  });

  it('resolves token symbols from coin types', () => {
    const result = buildSwapDisplayData(SWAP_USDC_TO_USDT, 'USDC', 'USDT', 1);
    expect(result.fromToken).toBe('USDC');
    expect(result.toToken).toBe('USDT');
  });
});
