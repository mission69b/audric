/**
 * SPEC 30 Phase 1A.8 — CDN cache-poisoning regression test.
 *
 * 2026-05-14 production smoke caught `/api/portfolio` returning HTTP 200
 * to JWT-LESS curl — even though the route handler called
 * `assertOwnsOrWatched`. Root cause: the response carried
 * `Cache-Control: public, s-maxage=15`, so Vercel's CDN cached the
 * response from the user's authenticated browser and served the cached
 * body to ANY caller (including unauthenticated ones) for 15s. Auth
 * gate completely bypassed.
 *
 * The fix changes `public` → `private`. This regression test asserts
 * the cache header is NOT shared-cacheable, so any future change that
 * accidentally re-introduces `public` (or `s-maxage`) on a route gated
 * by `assertOwns*` fails CI immediately.
 *
 * The pattern: any per-user data MUST use `private` (browser-only). The
 * CDN layer cannot distinguish caller identity from URL alone, so any
 * shared-cacheable response on an auth-gated route is a vulnerability.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const VERIFIED_ADDR = '0x' + 'a'.repeat(64);
const TEST_JWT = 'fake.jwt.token';

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return {
    ...actual,
    authenticateRequest: vi.fn(async (request: NextRequest) => {
      const jwt = request.headers.get('x-zklogin-jwt');
      if (!jwt) {
        return {
          error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
        };
      }
      return {
        verified: {
          payload: { sub: 'verified-sub' },
          suiAddress: VERIFIED_ADDR,
          emailVerified: true,
        },
      };
    }),
    assertOwnsOrWatched: vi.fn(async () => null),
  };
});

vi.mock('@/lib/portfolio', () => ({
  getPortfolio: vi.fn(async (address: string) => ({
    address,
    netWorthUsd: 0,
    walletValueUsd: 0,
    walletAllocations: [],
    wallet: [],
    positions: {
      savings: 0,
      borrows: 0,
      savingsRate: 0,
      healthFactor: null,
      maxBorrow: 0,
      pendingRewards: [],
      supplies: [],
      borrowsDetail: [],
    },
    defiValueUsd: 0,
    defiSource: 'blockvision' as const,
    defiPricedAt: Date.now(),
    estimatedDailyYield: 0,
    source: 'blockvision' as const,
    pricedAt: Date.now(),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SPEC 30 Phase 1A.8 — /api/portfolio MUST NOT use public cache', () => {
  it('Cache-Control header is `private` (not `public`) — prevents CDN cache-poisoning', async () => {
    vi.resetModules();
    const { GET } = await import('../app/api/portfolio/route');
    const req = new NextRequest(
      `http://localhost/api/portfolio?address=${VERIFIED_ADDR}`,
      { headers: { 'x-zklogin-jwt': TEST_JWT } },
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const cc = res.headers.get('cache-control') ?? '';
    // Hard requirement: must not be shared-cacheable.
    expect(cc).toContain('private');
    expect(cc).not.toContain('public');
    expect(cc).not.toMatch(/s-maxage/);
  });
});
