import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const VALID_ADDRESS = '0x' + 'a'.repeat(64);
const OTHER_ADDRESS = '0x' + 'b'.repeat(64);
// Stable per-test internal key. The shell / .env.local may set a different
// `T2000_INTERNAL_KEY` value — we stub a known value into the env BEFORE
// `vi.resetModules()` so `lib/env.ts` re-reads it cleanly.
const INTERNAL_KEY = 'internal-auth-test-key';

// ─── validateInternalKey ────────────────────────────────────────────

describe('validateInternalKey', () => {
  let validateInternalKey: typeof import('./internal-auth').validateInternalKey;

  beforeEach(async () => {
    vi.stubEnv('T2000_INTERNAL_KEY', INTERNAL_KEY);
    vi.resetModules();
    ({ validateInternalKey } = await import('./internal-auth'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts the configured key', () => {
    const result = validateInternalKey(INTERNAL_KEY);
    expect(result).toEqual({ valid: true });
  });

  it('rejects a missing key with 401', async () => {
    const result = validateInternalKey(null);
    if (!('error' in result)) throw new Error('expected error');
    expect(result.error.status).toBe(401);
    const body = await result.error.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects a mismatched key with 401', async () => {
    const result = validateInternalKey('wrong-key');
    if (!('error' in result)) throw new Error('expected error');
    expect(result.error.status).toBe(401);
  });
});

// ─── authenticateAnalyticsRequest ───────────────────────────────────
//
// Day 20d — dual-auth helper. Three branches to prove:
//   1. Internal-key path: trusted callers (engine + cron) read any
//      address in the query string.
//   2. JWT path: browser callers fall through to `authenticateRequest`
//      + `assertOwnsOrWatched` (existing SPEC 30 Phase 1A.5 behavior).
//   3. Error paths: 400 (internal-key without address), 401 (no auth),
//      403 (JWT mismatch + non-watched).

describe('authenticateAnalyticsRequest', () => {
  const findUniqueMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('T2000_INTERNAL_KEY', INTERNAL_KEY);
    vi.resetModules();
    findUniqueMock.mockReset();
    vi.doMock('./prisma', () => ({
      prisma: { user: { findUnique: findUniqueMock } },
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('./prisma');
    vi.doUnmock('./auth');
  });

  function buildRequest(opts: {
    address?: string | null;
    internalKey?: string | null;
    jwt?: string | null;
  }): NextRequest {
    const url = opts.address
      ? `http://localhost/x?address=${opts.address}`
      : 'http://localhost/x';
    const headers: Record<string, string> = {};
    if (opts.internalKey) headers['x-internal-key'] = opts.internalKey;
    if (opts.jwt) headers['x-zklogin-jwt'] = opts.jwt;
    return new NextRequest(url, { headers });
  }

  // ─── Internal-key path ────────────────────────────────────────────

  it('internal-key + valid address → { isInternal: true, address }', async () => {
    const { authenticateAnalyticsRequest } = await import('./internal-auth');
    const req = buildRequest({
      internalKey: INTERNAL_KEY,
      address: VALID_ADDRESS,
    });
    const result = await authenticateAnalyticsRequest(req);
    if ('error' in result) throw new Error('expected success');
    expect(result.isInternal).toBe(true);
    expect(result.address).toBe(VALID_ADDRESS);
  });

  it('internal-key WITHOUT ?address → 400', async () => {
    const { authenticateAnalyticsRequest } = await import('./internal-auth');
    const req = buildRequest({ internalKey: INTERNAL_KEY });
    const result = await authenticateAnalyticsRequest(req);
    if (!('error' in result)) throw new Error('expected error');
    expect(result.error.status).toBe(400);
    const body = await result.error.json();
    expect(body.error).toMatch(/internal-key/i);
  });

  it('internal-key with malformed address → 400 (rejected by 0x prefix check)', async () => {
    const { authenticateAnalyticsRequest } = await import('./internal-auth');
    const req = buildRequest({
      internalKey: INTERNAL_KEY,
      address: 'not-an-address',
    });
    const result = await authenticateAnalyticsRequest(req);
    if (!('error' in result)) throw new Error('expected error');
    expect(result.error.status).toBe(400);
  });

  it('wrong internal-key falls through to JWT path (rejected when no JWT)', async () => {
    // Stub authenticateRequest to confirm the JWT path is reached when
    // the internal-key doesn't match — we don't want a wrong key to be
    // silently accepted OR to short-circuit JWT auth.
    vi.doMock('./auth', async () => {
      const actual = await vi.importActual<typeof import('./auth')>('./auth');
      return {
        ...actual,
        authenticateRequest: vi.fn(async () => ({
          error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
        })),
      };
    });
    const { authenticateAnalyticsRequest } = await import('./internal-auth');
    const req = buildRequest({
      internalKey: 'wrong-key',
      address: VALID_ADDRESS,
    });
    const result = await authenticateAnalyticsRequest(req);
    if (!('error' in result)) throw new Error('expected error');
    expect(result.error.status).toBe(401);
  });

  // ─── JWT path ────────────────────────────────────────────────────

  it('valid JWT, no ?address → defaults to JWT-verified address', async () => {
    vi.doMock('./auth', async () => {
      const actual = await vi.importActual<typeof import('./auth')>('./auth');
      return {
        ...actual,
        authenticateRequest: vi.fn(async () => ({
          verified: {
            payload: { sub: 'test-sub' },
            suiAddress: VALID_ADDRESS,
            emailVerified: true,
          },
        })),
        assertOwnsOrWatched: vi.fn(async () => null),
      };
    });
    const { authenticateAnalyticsRequest } = await import('./internal-auth');
    const req = buildRequest({ jwt: 'fake.jwt.token' });
    const result = await authenticateAnalyticsRequest(req);
    if ('error' in result) throw new Error('expected success');
    expect(result.isInternal).toBe(false);
    expect(result.address).toBe(VALID_ADDRESS);
    expect('verified' in result && result.verified.suiAddress).toBe(VALID_ADDRESS);
  });

  it('valid JWT + ?address=own → 200, ownership check bypasses DB', async () => {
    vi.doMock('./auth', async () => {
      const actual = await vi.importActual<typeof import('./auth')>('./auth');
      return {
        ...actual,
        authenticateRequest: vi.fn(async () => ({
          verified: {
            payload: { sub: 'test-sub' },
            suiAddress: VALID_ADDRESS,
            emailVerified: true,
          },
        })),
        // Real assertOwnsOrWatched is fine here — own-address path skips DB.
      };
    });
    const { authenticateAnalyticsRequest } = await import('./internal-auth');
    const req = buildRequest({ jwt: 'fake.jwt.token', address: VALID_ADDRESS });
    const result = await authenticateAnalyticsRequest(req);
    if ('error' in result) throw new Error('expected success');
    expect(result.isInternal).toBe(false);
    expect(result.address).toBe(VALID_ADDRESS);
  });

  it('valid JWT + ?address=other-non-watched → 403 (IDOR blocked)', async () => {
    findUniqueMock.mockResolvedValue({ id: 'user-1', watchAddresses: [] });
    vi.doMock('./auth', async () => {
      const actual = await vi.importActual<typeof import('./auth')>('./auth');
      return {
        ...actual,
        authenticateRequest: vi.fn(async () => ({
          verified: {
            payload: { sub: 'test-sub' },
            suiAddress: VALID_ADDRESS,
            emailVerified: true,
          },
        })),
      };
    });
    const { authenticateAnalyticsRequest } = await import('./internal-auth');
    const req = buildRequest({ jwt: 'fake.jwt.token', address: OTHER_ADDRESS });
    const result = await authenticateAnalyticsRequest(req);
    if (!('error' in result)) throw new Error('expected 403');
    expect(result.error.status).toBe(403);
  });

  it('no auth headers → 401 (JWT path is the default)', async () => {
    vi.doMock('./auth', async () => {
      const actual = await vi.importActual<typeof import('./auth')>('./auth');
      return {
        ...actual,
        authenticateRequest: vi.fn(async () => ({
          error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
        })),
      };
    });
    const { authenticateAnalyticsRequest } = await import('./internal-auth');
    const req = buildRequest({ address: VALID_ADDRESS });
    const result = await authenticateAnalyticsRequest(req);
    if (!('error' in result)) throw new Error('expected 401');
    expect(result.error.status).toBe(401);
  });
});
