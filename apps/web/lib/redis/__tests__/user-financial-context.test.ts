import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * [v1.4 — B1 / Day 4+5] Redis + Prisma are mocked via `vi.mock` because
 * the module constructs an Upstash client at load time
 * (`Redis.fromEnv()`) and we don't want the tests to require live
 * Upstash creds or a Postgres instance.
 *
 * Day 4 covered the `invalidate` half of the helper. Day 5 layered the
 * `get` half (read-through cache: Redis → Prisma → null) on top. Both
 * halves share the same module mock so transport-error scenarios stay
 * symmetric (fail-open, never throw, surface to console.warn).
 */
const delMock = vi.fn(async (_key: string) => 1);
const getMock = vi.fn(async (_key: string) => null as unknown);
const setMock = vi.fn(async (_key: string, _value: unknown, _opts?: unknown) => 'OK');
vi.mock('@/lib/redis', () => ({
  redis: {
    del: (key: string) => delMock(key),
    get: (key: string) => getMock(key),
    set: (key: string, value: unknown, opts?: unknown) => setMock(key, value, opts),
  },
}));

const findUniqueMock = vi.fn(
  async (_args: { where: { address: string } }) =>
    null as unknown,
);
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userFinancialContext: {
      findUnique: (args: { where: { address: string } }) => findUniqueMock(args),
    },
  },
}));

import {
  getUserFinancialContext,
  invalidateUserFinancialContext,
  type FinancialContextSnapshot,
} from '../user-financial-context';

const SAMPLE_SNAPSHOT: FinancialContextSnapshot = {
  savingsUsdc: 1234.56,
  // [Bug 1c / 2026-04-27] USDsui breakouts default to null in the canonical
  // sample so Prisma rows written before the migration deserialize without
  // surprises (the helper coerces `undefined`/missing → `null`).
  savingsUsdsui: null,
  debtUsdc: 200,
  walletUsdc: 50,
  walletUsdsui: null,
  healthFactor: 2.4,
  currentApy: 4.2,
  recentActivity: 'Saved $100.00.',
  pendingAdvice: null,
  daysSinceLastSession: 1,
};

describe('invalidateUserFinancialContext', () => {
  beforeEach(() => {
    delMock.mockClear();
    delMock.mockImplementation(async () => 1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('issues a DEL keyed on `fin_ctx:${address}`', async () => {
    const address = '0xabc1234567890abcdef1234567890abcdef12345678';
    await invalidateUserFinancialContext(address);
    expect(delMock).toHaveBeenCalledTimes(1);
    expect(delMock).toHaveBeenCalledWith(`fin_ctx:${address}`);
  });

  it('is a no-op for falsy addresses (defensive)', async () => {
    await invalidateUserFinancialContext('');
    expect(delMock).not.toHaveBeenCalled();
  });

  it('swallows transport errors (fail-open) and never throws', async () => {
    delMock.mockImplementationOnce(async () => {
      throw new Error('upstream timeout');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      invalidateUserFinancialContext('0xdeadbeef'),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    const message = warn.mock.calls[0]?.[0];
    expect(typeof message).toBe('string');
    expect(message as string).toContain('[fin_ctx]');
  });

  it('does not retain Redis errors as rejections (instrumentation must not block chat)', async () => {
    delMock.mockImplementationOnce(async () => {
      throw new TypeError('serialization failure');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    let didThrow = false;
    try {
      await invalidateUserFinancialContext('0xfeedface');
    } catch {
      didThrow = true;
    }
    expect(didThrow).toBe(false);
  });

  it('passes the address through verbatim — no normalization, no checksum', async () => {
    const mixedCase = '0xAbCdEf1234567890';
    await invalidateUserFinancialContext(mixedCase);
    expect(delMock).toHaveBeenCalledWith('fin_ctx:0xAbCdEf1234567890');
  });
});

describe('getUserFinancialContext', () => {
  beforeEach(() => {
    getMock.mockClear();
    setMock.mockClear();
    findUniqueMock.mockClear();
    getMock.mockImplementation(async () => null);
    setMock.mockImplementation(async () => 'OK');
    findUniqueMock.mockImplementation(async () => null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the cached snapshot on a Redis hit and skips Prisma', async () => {
    getMock.mockResolvedValueOnce(SAMPLE_SNAPSHOT);

    const result = await getUserFinancialContext('0xhit');
    expect(result).toEqual(SAMPLE_SNAPSHOT);
    expect(getMock).toHaveBeenCalledWith('fin_ctx:0xhit');
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
  });

  it('falls through to Prisma on a Redis miss and back-fills the cache (24h TTL)', async () => {
    getMock.mockResolvedValueOnce(null);
    findUniqueMock.mockResolvedValueOnce({
      id: 'cuid_1',
      userId: 'user_1',
      address: '0xmiss',
      savingsUsdc: SAMPLE_SNAPSHOT.savingsUsdc,
      savingsUsdsui: SAMPLE_SNAPSHOT.savingsUsdsui,
      debtUsdc: SAMPLE_SNAPSHOT.debtUsdc,
      walletUsdc: SAMPLE_SNAPSHOT.walletUsdc,
      walletUsdsui: SAMPLE_SNAPSHOT.walletUsdsui,
      healthFactor: SAMPLE_SNAPSHOT.healthFactor,
      currentApy: SAMPLE_SNAPSHOT.currentApy,
      recentActivity: SAMPLE_SNAPSHOT.recentActivity,
      pendingAdvice: SAMPLE_SNAPSHOT.pendingAdvice,
      daysSinceLastSession: SAMPLE_SNAPSHOT.daysSinceLastSession,
      generatedAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await getUserFinancialContext('0xmiss');
    expect(result).toEqual(SAMPLE_SNAPSHOT);
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { address: '0xmiss' } });
    expect(setMock).toHaveBeenCalledTimes(1);
    const [setKey, setValue, setOpts] = setMock.mock.calls[0];
    expect(setKey).toBe('fin_ctx:0xmiss');
    expect(setValue).toEqual(SAMPLE_SNAPSHOT);
    expect((setOpts as { ex?: number }).ex).toBe(24 * 60 * 60);
  });

  it('returns null when neither Redis nor Prisma have a row (brand-new user)', async () => {
    getMock.mockResolvedValueOnce(null);
    findUniqueMock.mockResolvedValueOnce(null);

    const result = await getUserFinancialContext('0xunknown');
    expect(result).toBeNull();
    expect(setMock).not.toHaveBeenCalled();
  });

  it('returns null and skips Prisma when address is empty', async () => {
    const result = await getUserFinancialContext('');
    expect(result).toBeNull();
    expect(getMock).not.toHaveBeenCalled();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it('degrades to Prisma when the Redis read throws (fail-open)', async () => {
    getMock.mockImplementationOnce(async () => {
      throw new Error('upstash 503');
    });
    findUniqueMock.mockResolvedValueOnce({
      id: 'cuid_2',
      userId: 'user_2',
      address: '0xdegrade',
      savingsUsdc: 0,
      savingsUsdsui: null,
      debtUsdc: 0,
      walletUsdc: 0,
      walletUsdsui: null,
      healthFactor: null,
      currentApy: null,
      recentActivity: 'No recent activity.',
      pendingAdvice: null,
      daysSinceLastSession: 0,
      generatedAt: new Date(),
      updatedAt: new Date(),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await getUserFinancialContext('0xdegrade');
    expect(result).toEqual({
      savingsUsdc: 0,
      savingsUsdsui: null,
      debtUsdc: 0,
      walletUsdc: 0,
      walletUsdsui: null,
      healthFactor: null,
      currentApy: null,
      recentActivity: 'No recent activity.',
      pendingAdvice: null,
      daysSinceLastSession: 0,
    });
    expect(warn).toHaveBeenCalled();
  });

  it('returns null when Prisma throws (skip the section, never crash the engine boot)', async () => {
    getMock.mockResolvedValueOnce(null);
    findUniqueMock.mockImplementationOnce(async () => {
      throw new Error('prisma p1001 cant reach db');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await getUserFinancialContext('0xprismaerr');
    expect(result).toBeNull();
    expect(setMock).not.toHaveBeenCalled();
  });

  it('does not propagate cache-write transport errors (fail-open writeback)', async () => {
    getMock.mockResolvedValueOnce(null);
    findUniqueMock.mockResolvedValueOnce({
      id: 'cuid_4',
      userId: 'user_4',
      address: '0xwriteerr',
      savingsUsdc: 1,
      savingsUsdsui: null,
      debtUsdc: 0,
      walletUsdc: 0,
      walletUsdsui: null,
      healthFactor: null,
      currentApy: null,
      recentActivity: 'x',
      pendingAdvice: null,
      daysSinceLastSession: 0,
      generatedAt: new Date(),
      updatedAt: new Date(),
    });
    setMock.mockImplementationOnce(async () => {
      throw new Error('redis OOM');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    let didThrow = false;
    try {
      await getUserFinancialContext('0xwriteerr');
    } catch {
      didThrow = true;
    }
    expect(didThrow).toBe(false);
  });
});
