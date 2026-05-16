/**
 * Integration harness — auth bypass for the chat / resume routes.
 *
 * The chat route calls `authenticateRequest(request)` (from `lib/auth.ts`)
 * which verifies an `x-zklogin-jwt` header against Google's JWKS +
 * derives the canonical Sui address from `(sub, aud, salt)`. In the
 * harness, we vi.mock this to bypass the verification entirely and
 * return a deterministic `VerifiedJwt` for a configured test wallet.
 *
 * Why bypass instead of forging a real JWT:
 *   - Forging a real zkLogin JWT would require real Google JWKS, real
 *     salts, real Sui address derivation. None of which we want in a
 *     unit-level integration harness.
 *   - The auth flow has its own dedicated unit tests in
 *     `apps/web/lib/__tests__/auth.test.ts` — that's the right layer
 *     to verify zkLogin invariants. The harness assumes auth works and
 *     focuses on what happens DOWNSTREAM of a verified session.
 *
 * Usage:
 *   ```ts
 *   import { setTestWallet, mockAuth } from './setup/mock-auth';
 *   beforeAll(() => mockAuth());
 *   beforeEach(() => setTestWallet('0x7f20...'));
 *   ```
 */

import { vi } from 'vitest';
import type { VerifiedJwt } from '@/lib/auth';

/**
 * The wallet address the mocked auth layer returns for the next
 * request. Tests mutate this via `setTestWallet()` so a single test
 * file can exercise multiple wallets without re-mocking.
 */
let currentWallet: string = '0x7f2059fb1c395f4800809b4b97ed8e661535c8c55f89b1379b6b9d0208d2f6dc';

export function setTestWallet(address: string): void {
  currentWallet = address;
}

export function getTestWallet(): string {
  return currentWallet;
}

/**
 * Build a `VerifiedJwt` shaped like what `verifyJwt()` would return on
 * a real zkLogin sign-in. The payload's `sub` is a deterministic Google
 * sub-id derived from the wallet (so two tests using the same wallet
 * share the same identity).
 */
export function buildVerifiedJwt(address: string = currentWallet): VerifiedJwt {
  return {
    payload: {
      sub: `test-sub-${address.slice(2, 10)}`,
      aud: 'test-google-client',
      iss: 'https://accounts.google.com',
      email: `${address.slice(2, 8)}@audric-test.local`,
      email_verified: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as VerifiedJwt['payload'],
    suiAddress: address,
    emailVerified: true,
  };
}

/**
 * Install the vi.mock for `@/lib/auth`. Call once in a `beforeAll`
 * (per-file is fine — vitest scopes mocks per-module-graph).
 *
 * The mock preserves `assertOwns`, `isValidSuiAddress`, and other
 * non-auth helpers from the real module via `await importOriginal()`.
 */
export function mockAuth(): void {
  vi.mock('@/lib/auth', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/auth')>();
    return {
      ...original,
      authenticateRequest: vi.fn(async () => ({
        verified: buildVerifiedJwt(currentWallet),
      })),
      // verifyJwt also gets called from places like the resume route;
      // alias it to the same mock so behavior is consistent across
      // entry points.
      verifyJwt: vi.fn(async () => buildVerifiedJwt(currentWallet)),
    };
  });
}
