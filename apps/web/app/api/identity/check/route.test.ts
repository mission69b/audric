import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests for /api/identity/check (SPEC 10 v0.2.1 Phase A.3).
 *
 * Coverage matrix — each `reason` value + the success path + the RPC
 * failure 503 path. Verifies the cheapest-to-most-expensive funnel
 * short-circuits correctly: a length-failed input MUST NOT hit Prisma or
 * RPC; a reserved input MUST NOT hit Prisma or RPC; a DB-taken input MUST
 * NOT hit RPC. Each short-circuit is asserted via the mock call count.
 */

const mockUserFindUnique = vi.fn();
const mockResolveSuinsViaRpc = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

vi.mock('@t2000/engine', async () => {
  // Pull in the real SuinsRpcError so the route can `instanceof` check it
  // — replacing it with a mock class would make the type guard fail and
  // we'd silently fall through to the generic Error branch.
  const actual = await vi.importActual<typeof import('@t2000/engine')>(
    '@t2000/engine',
  );
  return {
    ...actual,
    resolveSuinsViaRpc: (...args: unknown[]) => mockResolveSuinsViaRpc(...args),
  };
});

vi.mock('@/lib/sui-rpc', () => ({
  getSuiRpcUrl: () => 'http://test-rpc.invalid',
}));

function buildRequest(username?: string, headers: Record<string, string> = {}): NextRequest {
  // Each test gets its own random IP so the in-process rate-limiter
  // window from one test doesn't bleed into the next. The route limiter
  // is keyed on `x-forwarded-for`.
  const ip = headers['x-forwarded-for'] ?? `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const url = username
    ? `http://localhost/api/identity/check?username=${encodeURIComponent(username)}`
    : 'http://localhost/api/identity/check';
  return new NextRequest(url, {
    method: 'GET',
    headers: { 'x-forwarded-for': ip, ...headers },
  });
}

describe('/api/identity/check', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./route');
    GET = mod.GET as unknown as (req: NextRequest) => Promise<Response>;
  });

  describe('input validation', () => {
    it('returns 400 when username param is missing', async () => {
      const res = await GET(buildRequest());
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Missing username');
      expect(mockUserFindUnique).not.toHaveBeenCalled();
      expect(mockResolveSuinsViaRpc).not.toHaveBeenCalled();
    });

    it('returns reason: too-short for 2-char input', async () => {
      const res = await GET(buildRequest('ab'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ available: false, reason: 'too-short' });
      expect(mockUserFindUnique).not.toHaveBeenCalled();
      expect(mockResolveSuinsViaRpc).not.toHaveBeenCalled();
    });

    it('returns reason: too-long for 21-char input', async () => {
      const res = await GET(buildRequest('a'.repeat(21)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ available: false, reason: 'too-long' });
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    it('accepts the boundary cases (3 chars and 20 chars)', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockResolveSuinsViaRpc.mockResolvedValue(null);

      const r3 = await GET(buildRequest('abc'));
      expect(await r3.json()).toEqual({ available: true });

      const r20 = await GET(buildRequest('a'.repeat(20)));
      expect(await r20.json()).toEqual({ available: true });
    });

    it('returns reason: invalid for special characters', async () => {
      const res = await GET(buildRequest('alice!'));
      expect(await res.json()).toEqual({ available: false, reason: 'invalid' });
    });

    it('returns reason: invalid for leading hyphen', async () => {
      const res = await GET(buildRequest('-alice'));
      expect(await res.json()).toEqual({ available: false, reason: 'invalid' });
    });

    it('returns reason: invalid for trailing hyphen', async () => {
      const res = await GET(buildRequest('alice-'));
      expect(await res.json()).toEqual({ available: false, reason: 'invalid' });
    });

    it('returns reason: invalid for consecutive hyphens', async () => {
      const res = await GET(buildRequest('al--ice'));
      expect(await res.json()).toEqual({ available: false, reason: 'invalid' });
    });

    it('accepts mid-string single hyphens', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockResolveSuinsViaRpc.mockResolvedValue(null);

      const res = await GET(buildRequest('al-ice'));
      expect(await res.json()).toEqual({ available: true });
    });

    it('lowercases + trims input before validation', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockResolveSuinsViaRpc.mockResolvedValue(null);

      const res = await GET(buildRequest('  Alice  '));
      expect(await res.json()).toEqual({ available: true });
      // DB query went out with the canonical lowercased form.
      expect(mockUserFindUnique).toHaveBeenCalledWith({
        where: { username: 'alice' },
        select: { id: true },
      });
    });
  });

  describe('reserved-name list (D3 baseline)', () => {
    it('returns reason: reserved for "admin"', async () => {
      const res = await GET(buildRequest('admin'));
      expect(await res.json()).toEqual({ available: false, reason: 'reserved' });
      expect(mockUserFindUnique).not.toHaveBeenCalled();
      expect(mockResolveSuinsViaRpc).not.toHaveBeenCalled();
    });

    it('returns reason: reserved for "audric"', async () => {
      const res = await GET(buildRequest('audric'));
      expect(await res.json()).toEqual({ available: false, reason: 'reserved' });
    });

    it('returns reason: reserved for "support" (case-insensitive)', async () => {
      const res = await GET(buildRequest('SUPPORT'));
      expect(await res.json()).toEqual({ available: false, reason: 'reserved' });
    });

    it('returns reason: reserved for "mom" (squat magnet from D3)', async () => {
      const res = await GET(buildRequest('mom'));
      expect(await res.json()).toEqual({ available: false, reason: 'reserved' });
    });
  });

  describe('Postgres collision check', () => {
    it('returns reason: taken when User.username already exists', async () => {
      mockUserFindUnique.mockResolvedValue({ id: 'cuid_alice' });

      const res = await GET(buildRequest('alice'));
      expect(await res.json()).toEqual({ available: false, reason: 'taken' });
      // Short-circuits — RPC must not fire.
      expect(mockResolveSuinsViaRpc).not.toHaveBeenCalled();
    });

    it('proceeds to RPC check when DB shows username is free', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockResolveSuinsViaRpc.mockResolvedValue(null);

      const res = await GET(buildRequest('alice'));
      expect(await res.json()).toEqual({ available: true });
      expect(mockResolveSuinsViaRpc).toHaveBeenCalledOnce();
    });
  });

  describe('SuiNS RPC ground-truth check', () => {
    it('returns reason: taken when on-chain leaf resolves to an address', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockResolveSuinsViaRpc.mockResolvedValue(
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      );

      const res = await GET(buildRequest('alice'));
      expect(await res.json()).toEqual({ available: false, reason: 'taken' });
      // RPC was called with the FULL handle (label + parent name).
      expect(mockResolveSuinsViaRpc).toHaveBeenCalledWith(
        'alice.audric.sui',
        expect.objectContaining({ suiRpcUrl: expect.any(String) }),
      );
    });

    it('returns available: true when both DB and RPC show free', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockResolveSuinsViaRpc.mockResolvedValue(null);

      const res = await GET(buildRequest('alice'));
      expect(await res.json()).toEqual({ available: true });
    });

    it('returns 503 fail-CLOSED when SuiNS RPC throws (caller MUST retry)', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockResolveSuinsViaRpc.mockRejectedValue(new Error('Network down'));

      const res = await GET(buildRequest('alice'));
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toContain('SuiNS verification temporarily unavailable');
      expect(body.error).toContain('Network down');
      expect(body.error).toContain('retry');
    });

    it('surfaces SuinsRpcError messages verbatim in the 503 body', async () => {
      const { SuinsRpcError } = await import('@t2000/engine');
      mockUserFindUnique.mockResolvedValue(null);
      mockResolveSuinsViaRpc.mockRejectedValue(
        new SuinsRpcError('alice.audric.sui', 'HTTP 502'),
      );

      const res = await GET(buildRequest('alice'));
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toContain('alice.audric.sui');
      expect(body.error).toContain('HTTP 502');
    });
  });

  describe('rate limiting', () => {
    it('returns 429 after exceeding 30 requests / 60s from the same IP', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      mockResolveSuinsViaRpc.mockResolvedValue(null);

      const ip = '10.99.99.99'; // dedicated IP for this test
      let lastRes: Response | undefined;
      for (let i = 0; i < 31; i++) {
        lastRes = await GET(
          buildRequest(`alice${i.toString().padStart(2, '0')}`, { 'x-forwarded-for': ip }),
        );
      }
      expect(lastRes?.status).toBe(429);
      const body = await lastRes!.json();
      expect(body.error).toContain('Too many requests');
    });
  });
});
