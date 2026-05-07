// ---------------------------------------------------------------------------
// Tests for /lib/identity/admission-control.ts (S18-F14)
//
// Strategy: mock @/lib/redis with an in-memory counter so we can simulate
// burst admission without a real Upstash. Mock @/lib/env to control the
// concurrency limit deterministically.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// In-memory counter that mocks Upstash INCR/DECR/EXPIRE/DEL semantics.
// Defined OUTSIDE vi.mock so test bodies can reach in to manipulate it.
const mockState = {
  counter: 0,
  failNext: false as boolean,
};

vi.mock('@/lib/redis', () => ({
  redis: {
    incr: vi.fn(async () => {
      if (mockState.failNext) {
        mockState.failNext = false;
        throw new Error('Upstash INCR failed (simulated)');
      }
      mockState.counter += 1;
      return mockState.counter;
    }),
    decr: vi.fn(async () => {
      mockState.counter = Math.max(0, mockState.counter - 1);
      return mockState.counter;
    }),
    expire: vi.fn(async () => 1),
    del: vi.fn(async () => {
      mockState.counter = 0;
      return 1;
    }),
  },
}));

const mockGetEnv = vi.fn();
vi.mock('@/lib/env', () => ({
  env: new Proxy(
    {},
    {
      get(_target, prop) {
        return mockGetEnv(prop as string);
      },
    },
  ),
}));

// Imported after mocks so they bind to the mocked modules.
import {
  tryAdmitMint,
  admissionRejectedResponse,
  _resetAdmissionForTests,
} from './admission-control';

describe('tryAdmitMint (S18-F14 — Option C admission control)', () => {
  beforeEach(async () => {
    mockState.counter = 0;
    mockState.failNext = false;
    mockGetEnv.mockReturnValue(undefined); // default: use built-in cap of 5
    await _resetAdmissionForTests();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('admits the first request and returns inFlight=1', async () => {
    const admission = await tryAdmitMint();
    expect(admission.admitted).toBe(true);
    expect(admission.inFlight).toBe(1);
    expect(admission.retryAfterSec).toBeUndefined();
    await admission.release();
  });

  it('admits up to the default cap (5) and rejects the 6th', async () => {
    const admitted: Array<Awaited<ReturnType<typeof tryAdmitMint>>> = [];
    for (let i = 0; i < 5; i++) {
      const a = await tryAdmitMint();
      expect(a.admitted).toBe(true);
      admitted.push(a);
    }
    // 6th should reject
    const rejected = await tryAdmitMint();
    expect(rejected.admitted).toBe(false);
    expect(rejected.inFlight).toBe(6); // observed pre-decrement
    expect(rejected.retryAfterSec).toBeGreaterThanOrEqual(2);
    expect(rejected.retryAfterSec).toBeLessThanOrEqual(8);

    // Release all and confirm a fresh request can pass again
    for (const a of admitted) await a.release();
    const passAgain = await tryAdmitMint();
    expect(passAgain.admitted).toBe(true);
    await passAgain.release();
  });

  it('respects AUDRIC_MINT_CONCURRENCY_LIMIT env override', async () => {
    mockGetEnv.mockImplementation((key: string) => {
      if (key === 'AUDRIC_MINT_CONCURRENCY_LIMIT') return '2';
      return undefined;
    });

    const a1 = await tryAdmitMint();
    const a2 = await tryAdmitMint();
    expect(a1.admitted).toBe(true);
    expect(a2.admitted).toBe(true);

    const a3 = await tryAdmitMint();
    expect(a3.admitted).toBe(false);

    await a1.release();
    await a2.release();
  });

  it('falls back to default cap on invalid env value', async () => {
    mockGetEnv.mockImplementation((key: string) => {
      if (key === 'AUDRIC_MINT_CONCURRENCY_LIMIT') return 'not-a-number';
      return undefined;
    });

    // Default cap is 5 — should admit 5 and reject 6th
    const admitted: Array<Awaited<ReturnType<typeof tryAdmitMint>>> = [];
    for (let i = 0; i < 5; i++) {
      const a = await tryAdmitMint();
      expect(a.admitted).toBe(true);
      admitted.push(a);
    }
    const rejected = await tryAdmitMint();
    expect(rejected.admitted).toBe(false);

    for (const a of admitted) await a.release();
  });

  it('decrements counter on rejection (no slot leak)', async () => {
    mockGetEnv.mockImplementation((key: string) => {
      if (key === 'AUDRIC_MINT_CONCURRENCY_LIMIT') return '1';
      return undefined;
    });

    const a1 = await tryAdmitMint();
    expect(a1.admitted).toBe(true);

    const a2 = await tryAdmitMint();
    expect(a2.admitted).toBe(false);

    // After rejection, counter should be back to 1 (not 2)
    expect(mockState.counter).toBe(1);

    await a1.release();
    expect(mockState.counter).toBe(0);
  });

  it('FAILS OPEN when Redis INCR throws', async () => {
    mockState.failNext = true;
    const admission = await tryAdmitMint();
    expect(admission.admitted).toBe(true);
    expect(admission.inFlight).toBe(-1);
    // Release should not throw even though Redis is degraded
    await expect(admission.release()).resolves.toBeUndefined();
  });

  it('release() decrements the counter', async () => {
    const a = await tryAdmitMint();
    expect(mockState.counter).toBe(1);
    await a.release();
    expect(mockState.counter).toBe(0);
  });

  it('release() does not go below zero (no underflow)', async () => {
    const a = await tryAdmitMint();
    await a.release();
    await a.release(); // accidental double-release
    expect(mockState.counter).toBe(0);
  });

  it('admissionRejectedResponse returns 503 with Retry-After header', () => {
    const res = admissionRejectedResponse(7);
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('7');
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });
});
