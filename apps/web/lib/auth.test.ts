import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  decodeJwt,
  isValidSuiAddress,
  validateAmount,
  verifyJwt,
  AuthError,
  assertOwns,
  assertOwnsOrWatched,
  __testHelpers,
  type VerifiedJwt,
} from './auth';

// ─── Helpers ────────────────────────────────────────────────────────

/** Build a structurally-valid (but unsigned) JWT for the legacy decoder. */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fake-signature`;
}

const VALID_ADDRESS = '0x' + 'a'.repeat(64);
const OTHER_ADDRESS = '0x' + 'b'.repeat(64);

// ─── Legacy surface — preserved for unmigrated callers ──────────────

describe('decodeJwt (legacy)', () => {
  it('decodes a valid JWT payload', () => {
    const jwt = fakeJwt({ sub: '123', email: 'a@b.com' });
    const payload = decodeJwt(jwt);
    expect(payload).toEqual({ sub: '123', email: 'a@b.com' });
  });

  it('returns null for malformed JWT', () => {
    expect(decodeJwt('not-a-jwt')).toBeNull();
    expect(decodeJwt('one.two')).toBeNull();
    expect(decodeJwt('')).toBeNull();
  });

  it('returns null for invalid base64 payload', () => {
    expect(decodeJwt('a.!!!.c')).toBeNull();
  });
});

describe('isValidSuiAddress', () => {
  const valid = '0x' + 'a'.repeat(64);

  it('accepts a valid 66-char hex address', () => {
    expect(isValidSuiAddress(valid)).toBe(true);
  });

  it('accepts mixed-case hex', () => {
    expect(isValidSuiAddress('0x' + 'aAbBcC11'.repeat(8))).toBe(true);
  });

  it('rejects addresses without 0x prefix', () => {
    expect(isValidSuiAddress('a'.repeat(64))).toBe(false);
  });

  it('rejects too-short addresses', () => {
    expect(isValidSuiAddress('0x1234')).toBe(false);
  });

  it('rejects too-long addresses', () => {
    expect(isValidSuiAddress('0x' + 'a'.repeat(65))).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isValidSuiAddress('0x' + 'g'.repeat(64))).toBe(false);
  });
});

describe('validateAmount', () => {
  it('accepts valid amounts within caps', () => {
    expect(validateAmount('save', 500)).toEqual({ valid: true });
    expect(validateAmount('send', 100)).toEqual({ valid: true });
  });

  it('rejects amounts exceeding per-flow caps', () => {
    const result = validateAmount('save', 200_000);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('exceeds maximum');
    }
  });

  it('rejects negative amounts', () => {
    const result = validateAmount('save', -10);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('positive');
    }
  });

  it('rejects NaN', () => {
    const result = validateAmount('save', NaN);
    expect(result.valid).toBe(false);
  });

  it('rejects Infinity', () => {
    const result = validateAmount('send', Infinity);
    expect(result.valid).toBe(false);
  });

  it('allows zero (no minimum enforced here)', () => {
    expect(validateAmount('save', 0)).toEqual({ valid: true });
  });

  it('allows unknown flows with any amount', () => {
    expect(validateAmount('unknown-flow', 999_999)).toEqual({ valid: true });
  });
});

// ─── New canonical surface — verifyJwt + assertOwns + AuthError ─────

describe('verifyJwt', () => {
  beforeEach(() => {
    __testHelpers.clearAddressCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws AuthError(401) when JWT is missing', async () => {
    await expect(verifyJwt(null)).rejects.toBeInstanceOf(AuthError);
    await expect(verifyJwt(undefined)).rejects.toBeInstanceOf(AuthError);
    await expect(verifyJwt('')).rejects.toBeInstanceOf(AuthError);

    try {
      await verifyJwt(null);
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(401);
      expect((err as AuthError).publicMessage).toBe('Authentication required');
    }
  });

  it('throws AuthError(401) for structurally-invalid JWT', async () => {
    await expect(verifyJwt('not-a-jwt')).rejects.toBeInstanceOf(AuthError);
    try {
      await verifyJwt('not-a-jwt');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).status).toBe(401);
      // Generic message — never leak the specific reason.
      expect((err as AuthError).publicMessage).toBe('Invalid authentication token');
    }
  });

  it('throws AuthError(401) for unsigned JWT (signature missing)', async () => {
    // Structurally valid base64 but no real signature — Google JWKS verify will reject.
    const fake = fakeJwt({ sub: 'abc123', iss: 'https://accounts.google.com', aud: 'test', exp: Math.floor(Date.now() / 1000) + 3600 });
    await expect(verifyJwt(fake)).rejects.toBeInstanceOf(AuthError);
  });

  it('serves from cache on warm hit', async () => {
    // Pre-seed the cache so verifyJwt's address-derivation path doesn't
    // need to hit Enoki. The signature check still runs and will fail
    // (no real signature), so we only test the cache path indirectly
    // through the seedAddressCache helper.
    __testHelpers.seedAddressCache('cached-sub', VALID_ADDRESS, Date.now() + 3_600_000);

    // The cache was seeded but the JWT signature won't verify → still
    // throws 401. This confirms the cache cannot bypass signature
    // verification (security property).
    const fake = fakeJwt({ sub: 'cached-sub', iss: 'https://accounts.google.com', aud: 'test', exp: Math.floor(Date.now() / 1000) + 3600 });
    await expect(verifyJwt(fake)).rejects.toBeInstanceOf(AuthError);
  });
});

describe('assertOwns', () => {
  const verified: VerifiedJwt = {
    payload: { sub: 'test-sub' },
    suiAddress: VALID_ADDRESS,
    emailVerified: true,
  };

  it('returns null when verified address matches claimed address', () => {
    expect(assertOwns(verified, VALID_ADDRESS)).toBeNull();
  });

  it('returns 403 when addresses do not match', () => {
    const response = assertOwns(verified, OTHER_ADDRESS);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
  });

  it('returns 400 for invalid claimed address format', () => {
    const response = assertOwns(verified, 'not-an-address');
    expect(response).not.toBeNull();
    expect(response?.status).toBe(400);
  });

  it('returns 400 for non-string claimed address', () => {
    const response = assertOwns(verified, undefined as unknown as string);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(400);
  });

  it('rejects 0x prefix mismatch as a 400 not a 403', () => {
    // Without 0x prefix → fails isValidSuiAddress → 400 (malformed input)
    // not 403 (mismatch). This separates "client sent garbage" from
    // "client tried to impersonate."
    const response = assertOwns(verified, 'a'.repeat(66));
    expect(response?.status).toBe(400);
  });
});

describe('assertOwnsOrWatched', () => {
  // Phase 1A.5: closes the unauthenticated-read class. Asserts:
  //   1. Same-address path bypasses Prisma entirely (zero DB cost on
  //      the hot path).
  //   2. Watched-address path queries WatchAddress and allows when a
  //      row exists for (caller, target).
  //   3. Non-watched non-owned address returns 403.
  //   4. Malformed address returns 400 BEFORE any DB query.

  const verified: VerifiedJwt = {
    payload: { sub: 'test-sub' },
    suiAddress: VALID_ADDRESS,
    emailVerified: true,
  };

  const findUniqueMock = vi.fn();

  beforeEach(() => {
    findUniqueMock.mockReset();
    vi.doMock('./prisma', () => ({
      prisma: { user: { findUnique: findUniqueMock } },
    }));
  });

  afterEach(() => {
    vi.doUnmock('./prisma');
  });

  it('returns null without hitting the DB when caller owns the target', async () => {
    const response = await assertOwnsOrWatched(verified, VALID_ADDRESS);
    expect(response).toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it('returns null when target is in caller watch-list', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'user-1',
      watchAddresses: [{ id: 'wa-1' }],
    });
    const response = await assertOwnsOrWatched(verified, OTHER_ADDRESS);
    expect(response).toBeNull();
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { suiAddress: VALID_ADDRESS },
      select: {
        id: true,
        watchAddresses: { where: { address: OTHER_ADDRESS }, select: { id: true } },
      },
    });
  });

  it('returns 403 when target is neither owned nor watched', async () => {
    findUniqueMock.mockResolvedValue({ id: 'user-1', watchAddresses: [] });
    const response = await assertOwnsOrWatched(verified, OTHER_ADDRESS);
    expect(response?.status).toBe(403);
  });

  it('returns 403 when caller is not a registered Audric user', async () => {
    findUniqueMock.mockResolvedValue(null);
    const response = await assertOwnsOrWatched(verified, OTHER_ADDRESS);
    expect(response?.status).toBe(403);
  });

  it('returns 400 for malformed address WITHOUT touching the DB', async () => {
    const response = await assertOwnsOrWatched(verified, 'not-an-address');
    expect(response?.status).toBe(400);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });
});

describe('AuthError', () => {
  it('preserves status and publicMessage', () => {
    const err = new AuthError(401, 'Authentication required');
    expect(err.status).toBe(401);
    expect(err.publicMessage).toBe('Authentication required');
    expect(err.name).toBe('AuthError');
  });

  it('inherits from Error', () => {
    const err = new AuthError(403, 'Forbidden');
    expect(err).toBeInstanceOf(Error);
  });
});
