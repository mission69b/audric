import { describe, it, expect, vi, beforeEach } from 'vitest';

const allRatesAcrossAssets = vi.fn();

vi.mock('@/lib/protocol-registry', () => ({
  getRegistry: () => ({ allRatesAcrossAssets }),
}));

import { getRates, invalidateRatesCache } from '../rates';

describe('getRates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateRatesCache();
  });

  it('returns separated USDC and best save/borrow rates', async () => {
    allRatesAcrossAssets.mockResolvedValue([
      { protocol: 'NAVI', protocolId: 'navi', asset: 'USDC', rates: { saveApy: 0.05, borrowApy: 0.07 } },
      { protocol: 'NAVI', protocolId: 'navi', asset: 'USDsui', rates: { saveApy: 0.06, borrowApy: 0.08 } },
      { protocol: 'OTHER', protocolId: 'other', asset: 'USDC', rates: { saveApy: 0.04, borrowApy: 0.09 } },
    ]);

    const summary = await getRates();
    expect(summary.rates.length).toBe(3);
    expect(summary.usdcRates.length).toBe(2);
    expect(summary.bestSaveRate?.rate).toBe(0.05);
    expect(summary.bestSaveRate?.protocol).toBe('NAVI');
    expect(summary.bestBorrowRate?.rate).toBe(0.07);
  });

  it('caches results within the TTL window', async () => {
    allRatesAcrossAssets.mockResolvedValue([
      { protocol: 'NAVI', protocolId: 'navi', asset: 'USDC', rates: { saveApy: 0.05, borrowApy: 0.07 } },
    ]);

    await getRates();
    await getRates();
    expect(allRatesAcrossAssets).toHaveBeenCalledTimes(1);
  });

  it('degrades gracefully when registry throws', async () => {
    allRatesAcrossAssets.mockRejectedValue(new Error('registry boom'));
    const summary = await getRates();
    expect(summary.rates).toEqual([]);
    expect(summary.bestSaveRate).toBeNull();
    expect(summary.bestBorrowRate).toBeNull();
  });

  it('skips zero-borrow rates when picking best borrow', async () => {
    allRatesAcrossAssets.mockResolvedValue([
      { protocol: 'A', protocolId: 'a', asset: 'USDC', rates: { saveApy: 0.05, borrowApy: 0 } },
      { protocol: 'B', protocolId: 'b', asset: 'USDC', rates: { saveApy: 0.04, borrowApy: 0.08 } },
    ]);
    const summary = await getRates();
    expect(summary.bestBorrowRate?.protocol).toBe('B');
    expect(summary.bestBorrowRate?.rate).toBe(0.08);
  });
});
