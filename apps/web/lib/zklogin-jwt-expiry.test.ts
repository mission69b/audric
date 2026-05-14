import { describe, expect, it } from 'vitest';
import { isJwtExpired, type ZkLoginSession } from './zklogin';

/**
 * SPEC 30 Phase 1A.7 — JWT-exp expiry check unit tests.
 *
 * Why these matter: pre-1A.7 the `useZkLogin` hook only checked the
 * Sui-epoch `maxEpoch` (~7 days). Routes secured in Phase 1A/1A.5/1A.6
 * use `jose.jwtVerify` which enforces the JWT's `exp` claim (1h on
 * Google's side). Without `isJwtExpired` the dashboard happily renders
 * for users whose JWT has been dead for hours, then every API call 401s
 * — which is exactly the production regression that triggered this fix.
 */

const STUB_PAYLOAD = (exp: number) =>
  Buffer.from(JSON.stringify({ sub: 'test', exp }))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const sessionWithExp = (expSeconds: number): ZkLoginSession => ({
  ephemeralKeyPair: 'stub',
  maxEpoch: 999_999,
  randomness: 'stub',
  jwt: `header.${STUB_PAYLOAD(expSeconds)}.signature`,
  salt: 'stub',
  proof: {
    proofPoints: { a: [], b: [], c: [] },
    issBase64Details: { indexMod4: 0, value: '' },
    headerBase64: '',
    addressSeed: '',
  },
  address: '0x' + 'a'.repeat(64),
  expiresAt: 0,
});

describe('isJwtExpired', () => {
  it('returns false for JWT well within validity window', () => {
    const now = 1_700_000_000_000; // arbitrary
    const oneHourFromNow = Math.floor(now / 1000) + 3600;
    expect(isJwtExpired(sessionWithExp(oneHourFromNow), now)).toBe(false);
  });

  it('returns true for JWT past exp', () => {
    const now = 1_700_000_000_000;
    const oneHourAgo = Math.floor(now / 1000) - 3600;
    expect(isJwtExpired(sessionWithExp(oneHourAgo), now)).toBe(true);
  });

  it('returns true within the 60s skew window before exp', () => {
    const now = 1_700_000_000_000;
    // exp is 30s in the future — within 60s skew → already considered expired
    const thirtySecFromNow = Math.floor(now / 1000) + 30;
    expect(isJwtExpired(sessionWithExp(thirtySecFromNow), now)).toBe(true);
  });

  it('returns false at exp - 90s (outside skew window)', () => {
    const now = 1_700_000_000_000;
    const ninetySecFromNow = Math.floor(now / 1000) + 90;
    expect(isJwtExpired(sessionWithExp(ninetySecFromNow), now)).toBe(false);
  });

  it('returns true for malformed JWT (missing parts)', () => {
    const session = { ...sessionWithExp(9_999_999_999), jwt: 'not-a-jwt' };
    expect(isJwtExpired(session)).toBe(true);
  });

  it('returns true for JWT with no exp claim', () => {
    const payloadNoExp = Buffer.from(JSON.stringify({ sub: 'test' }))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const session = {
      ...sessionWithExp(0),
      jwt: `header.${payloadNoExp}.signature`,
    };
    expect(isJwtExpired(session)).toBe(true);
  });

  it('returns true for JWT with non-numeric exp', () => {
    const payloadBadExp = Buffer.from(JSON.stringify({ sub: 'test', exp: 'soon' }))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const session = {
      ...sessionWithExp(0),
      jwt: `header.${payloadBadExp}.signature`,
    };
    expect(isJwtExpired(session)).toBe(true);
  });

  it('returns true for JWT whose payload is unparseable base64url', () => {
    const session = { ...sessionWithExp(0), jwt: 'header.@@@@@@.signature' };
    expect(isJwtExpired(session)).toBe(true);
  });
});
