import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests for /api/identity/change (S.84 — Audric Passport identity surfacing).
 *
 * Coverage matrix mirrors /api/identity/reserve plus the change-specific
 * paths (unchanged-label rejection, unclaimed-user rejection, atomic PTB
 * shape, rollback PTB on P2002 race):
 *
 *   1. Auth: missing JWT -> 401
 *   2. Input: invalid address -> 400
 *   3. Input: invalid label (too-short) -> 400 reason=too-short
 *   4. Input: reserved label -> 400 reason=reserved
 *   5. User: not found -> 404
 *   6. User: never claimed (username = null) -> 400
 *   7. Input: new == current -> 400 reason=unchanged
 *   8. Service: custody key unconfigured -> 503
 *   9. SuiNS: RPC throws -> 503
 *  10. SuiNS: NEW already exists on-chain -> 409 reason=taken
 *  11. DB: NEW already exists in Postgres -> 409 reason=taken
 *  12. PTB: tx reverts on-chain -> 502
 *  13. PTB: success -> 200 + DB updates with new label, usernameLastChangedAt
 *  14. Race: P2002 after on-chain change -> 409 + rollback PTB fired
 *  15. Race: other DB error after on-chain change -> 500 + ORPHAN logged
 *  16. Rate limit: 4th attempt in 24h -> 429
 *
 * Atomic PTB invariant: every successful change ALWAYS fires exactly ONE
 * `signAndExecuteTransaction` call (not two — the whole point of the
 * single-PTB design). Rollback path fires a SECOND call.
 */

const validJwt =
  'eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QifQ.' +
  Buffer.from(
    JSON.stringify({ sub: 'test-user', email: 'test@example.com', exp: Date.now() / 1000 + 3600 }),
  )
    .toString('base64url') +
  '.signature';

const ADDR_OTHER = '0x' + 'b'.repeat(64);

let nextAddrSeed = 0;
function freshAddr(): string {
  nextAddrSeed++;
  return '0x' + nextAddrSeed.toString(16).padStart(64, '0');
}

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockResolveSuinsViaRpc = vi.fn();
const mockSignAndExecute = vi.fn();
const mockRemoveLeaf = vi.fn();
const mockCreateLeaf = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

// [SPEC 30 Phase 1A.3] Stub authenticateRequest. See identity/reserve
// route.test.ts for the rationale — IDOR ownership gate is covered by
// __tests__/spec30-idor-regression.test.ts, this suite focuses on the
// per-route business logic.
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  const { NextResponse } = await import('next/server');
  return {
    ...actual,
    authenticateRequest: async (req: Request) => {
      const jwt = req.headers.get('x-zklogin-jwt');
      if (!jwt) {
        return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
      }
      return {
        verified: {
          sub: 'test-sub',
          email: 'test@example.com',
          emailVerified: true,
          suiAddress: '__test_wildcard__',
          raw: jwt,
        },
      };
    },
    assertOwns: () => undefined,
  };
});

vi.mock('@t2000/engine', async () => {
  const actual = await vi.importActual<typeof import('@t2000/engine')>('@t2000/engine');
  return {
    ...actual,
    resolveSuinsViaRpc: (...args: unknown[]) => mockResolveSuinsViaRpc(...args),
  };
});

// [S18-F15] Change route now uses raw `resolveSuinsViaRpc` (engine,
// always-live) at mint time, same as reserve. The existing
// `mockResolveSuinsViaRpc` from the @t2000/engine mock above already
// covers this path. The two write-through helpers stay mocked out
// (exercised in suins-cache.test.ts).
vi.mock('@/lib/suins-cache', () => ({
  invalidateAndWarmSuins: vi.fn().mockResolvedValue(undefined),
  invalidateRevokedSuins: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/sui-rpc', () => ({
  getSuiRpcUrl: () => 'http://test-rpc.invalid',
}));

vi.mock('@mysten/sui/jsonRpc', () => ({
  SuiJsonRpcClient: function () {
    return {
      signAndExecuteTransaction: (...args: unknown[]) => mockSignAndExecute(...args),
    };
  },
}));

// SuinsClient is just a passive factory in our route — the route only
// uses it as the constructor arg for SuinsTransaction. SuinsTransaction
// is what wires Move calls into the PTB; mock its two leaf methods so
// we can assert the atomic-PTB shape (revoke OLD + create NEW in ONE tx).
vi.mock('@mysten/suins', () => ({
  SuinsClient: function () {
    return {};
  },
  SuinsTransaction: function () {
    return {
      removeLeafSubName: (...args: unknown[]) => mockRemoveLeaf(...args),
      createLeafSubName: (...args: unknown[]) => mockCreateLeaf(...args),
    };
  },
}));

vi.mock('@/lib/env', async () => {
  const { Ed25519Keypair: KP } = await import('@mysten/sui/keypairs/ed25519');
  return {
    env: {
      AUDRIC_PARENT_NFT_PRIVATE_KEY: KP.generate().getSecretKey(),
      NEXT_PUBLIC_SUI_NETWORK: 'mainnet',
    },
  };
});

function buildRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/identity/change', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-zklogin-jwt': validJwt,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('/api/identity/change', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetAllMocks();
    const mod = await import('./route');
    POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;
  });

  describe('auth + input validation', () => {
    it('returns 401 when JWT header is missing', async () => {
      const req = new NextRequest('http://localhost/api/identity/change', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newLabel: 'bob', address: freshAddr() }),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    it('returns 400 on invalid JSON body', async () => {
      const res = await POST(buildRequest('not-json{'));
      expect(res.status).toBe(400);
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    it('returns 400 on invalid Sui address', async () => {
      const res = await POST(buildRequest({ newLabel: 'bob', address: '0xabc' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('Invalid address');
    });

    it('returns 400 + reason=too-short for 2-char label', async () => {
      const res = await POST(buildRequest({ newLabel: 'ab', address: freshAddr() }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ reason: 'too-short' });
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    it('returns 400 + reason=reserved for reserved label', async () => {
      const res = await POST(buildRequest({ newLabel: 'admin', address: freshAddr() }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ reason: 'reserved' });
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });
  });

  describe('user resource binding', () => {
    it('returns 404 when User row does not exist', async () => {
      mockUserFindUnique.mockResolvedValueOnce(null);
      const res = await POST(buildRequest({ newLabel: 'bob', address: freshAddr() }));
      expect(res.status).toBe(404);
      expect((await res.json()).error).toContain('complete signup');
      expect(mockResolveSuinsViaRpc).not.toHaveBeenCalled();
    });

    it('returns 400 when User has no current username (must claim first)', async () => {
      mockUserFindUnique.mockResolvedValueOnce({ id: 'u1', username: null });
      const res = await POST(buildRequest({ newLabel: 'bob', address: freshAddr() }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('not claimed');
      expect(mockResolveSuinsViaRpc).not.toHaveBeenCalled();
    });

    it('returns 400 + reason=unchanged when new == current', async () => {
      mockUserFindUnique.mockResolvedValueOnce({ id: 'u1', username: 'alice' });
      const res = await POST(buildRequest({ newLabel: 'alice', address: freshAddr() }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ reason: 'unchanged' });
      expect(mockResolveSuinsViaRpc).not.toHaveBeenCalled();
    });
  });

  describe('SuiNS + DB anti-race funnel', () => {
    it('returns 409 + reason=taken when SuiNS RPC reports NEW leaf exists on-chain', async () => {
      mockUserFindUnique.mockResolvedValueOnce({ id: 'u1', username: 'alice' });
      mockResolveSuinsViaRpc.mockResolvedValueOnce(ADDR_OTHER);
      const res = await POST(buildRequest({ newLabel: 'bob', address: freshAddr() }));
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ reason: 'taken' });
      expect(mockSignAndExecute).not.toHaveBeenCalled();
    });

    it('returns 503 when SuiNS RPC throws', async () => {
      mockUserFindUnique.mockResolvedValueOnce({ id: 'u1', username: 'alice' });
      mockResolveSuinsViaRpc.mockRejectedValueOnce(new Error('rpc down'));
      const res = await POST(buildRequest({ newLabel: 'bob', address: freshAddr() }));
      expect(res.status).toBe(503);
      expect(mockSignAndExecute).not.toHaveBeenCalled();
    });

    it('returns 409 + reason=taken when DB has NEW already', async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'u1', username: 'alice' })
        .mockResolvedValueOnce({ id: 'u-other' });
      mockResolveSuinsViaRpc.mockResolvedValueOnce(null);
      const res = await POST(buildRequest({ newLabel: 'bob', address: freshAddr() }));
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ reason: 'taken' });
      expect(mockSignAndExecute).not.toHaveBeenCalled();
    });
  });

  describe('atomic PTB execution', () => {
    it('returns 502 when on-chain tx reverts', async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'u1', username: 'alice' })
        .mockResolvedValueOnce(null);
      mockResolveSuinsViaRpc.mockResolvedValueOnce(null);
      mockSignAndExecute.mockResolvedValueOnce({
        digest: '0xdeadbeef',
        effects: { status: { status: 'failure', error: 'CommandArgumentError' } },
      });
      const res = await POST(buildRequest({ newLabel: 'bob', address: freshAddr() }));
      expect(res.status).toBe(502);
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it('returns 200 + atomic PTB carries BOTH revoke and create in one tx', async () => {
      const addr = freshAddr();
      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'u1', username: 'alice' })
        .mockResolvedValueOnce(null);
      mockResolveSuinsViaRpc.mockResolvedValueOnce(null);
      mockSignAndExecute.mockResolvedValueOnce({
        digest: '0xCHANGED',
        effects: { status: { status: 'success' } },
      });
      mockUserUpdate.mockResolvedValueOnce({});

      const res = await POST(buildRequest({ newLabel: 'bob', address: addr }));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        success: true,
        oldLabel: 'alice',
        newLabel: 'bob',
        fullHandle: 'bob.audric.sui',
        txDigest: '0xCHANGED',
        walletAddress: addr,
      });

      // Atomic invariant: ONE signAndExecute call (not two).
      expect(mockSignAndExecute).toHaveBeenCalledTimes(1);
      // Both Move calls assembled into the single PTB.
      expect(mockRemoveLeaf).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'alice.audric.sui' }),
      );
      expect(mockCreateLeaf).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'bob.audric.sui', targetAddress: addr }),
      );

      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({
            username: 'bob',
            usernameMintTxDigest: '0xCHANGED',
            usernameLastChangedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('lowercases + trims newLabel before pre-check and PTB build', async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'u1', username: 'alice' })
        .mockResolvedValueOnce(null);
      mockResolveSuinsViaRpc.mockResolvedValueOnce(null);
      mockSignAndExecute.mockResolvedValueOnce({
        digest: '0xCHANGED',
        effects: { status: { status: 'success' } },
      });
      mockUserUpdate.mockResolvedValueOnce({});

      const res = await POST(buildRequest({ newLabel: '  Bob  ', address: freshAddr() }));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ newLabel: 'bob' });
      expect(mockCreateLeaf).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'bob.audric.sui' }),
      );
    });
  });

  describe('post-change race + failure recovery', () => {
    it('fires rollback PTB + returns 409 when DB hits P2002 after on-chain change', async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'u1', username: 'alice' })
        .mockResolvedValueOnce(null);
      mockResolveSuinsViaRpc.mockResolvedValueOnce(null);
      mockSignAndExecute
        .mockResolvedValueOnce({
          digest: '0xCHANGED',
          effects: { status: { status: 'success' } },
        })
        .mockResolvedValueOnce({ digest: '0xROLLEDBACK' });

      const { Prisma } = await import('@/lib/generated/prisma/client');
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`username`)',
        { code: 'P2002', clientVersion: 'test' },
      );
      mockUserUpdate.mockRejectedValueOnce(p2002);

      const res = await POST(buildRequest({ newLabel: 'bob', address: freshAddr() }));
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ reason: 'taken' });
      // Rollback assembles the inverse PTB: revoke NEW + recreate OLD.
      // (The mocked SuinsTransaction is reused across calls so the asserts
      // on `mockRemoveLeaf` / `mockCreateLeaf` capture BOTH the original
      // change AND the rollback Move calls — total 2 of each.)
      expect(mockRemoveLeaf).toHaveBeenCalledTimes(2);
      expect(mockCreateLeaf).toHaveBeenCalledTimes(2);
      expect(mockSignAndExecute).toHaveBeenCalledTimes(2);
    });

    it('returns 500 + does NOT roll back when DB fails for non-P2002 reason after change (orphan)', async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'u1', username: 'alice' })
        .mockResolvedValueOnce(null);
      mockResolveSuinsViaRpc.mockResolvedValueOnce(null);
      mockSignAndExecute.mockResolvedValueOnce({
        digest: '0xORPHANCHANGE12345',
        effects: { status: { status: 'success' } },
      });
      mockUserUpdate.mockRejectedValueOnce(new Error('Postgres connection lost'));

      const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await POST(buildRequest({ newLabel: 'bob', address: freshAddr() }));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toContain('0xORPHANCHAN');
      expect(mockSignAndExecute).toHaveBeenCalledTimes(1);
      expect(consoleErr).toHaveBeenCalledWith(
        expect.stringContaining('ORPHAN'),
        expect.anything(),
      );
      consoleErr.mockRestore();
    });
  });

  describe('rate limiting', () => {
    it('returns 429 after 3 attempts from the same address', async () => {
      const addr = freshAddr();
      // Each attempt fails the SuiNS pre-check (NEW already taken on-chain),
      // which is the cheapest pre-PTB short-circuit. Rate limit is enforced
      // BEFORE that, so the 4th attempt returns 429 even though the same
      // path would otherwise return 409.
      mockUserFindUnique.mockResolvedValue({ id: 'u1', username: 'alice' });
      mockResolveSuinsViaRpc.mockResolvedValue(ADDR_OTHER);

      let lastStatus = 0;
      for (let i = 0; i < 4; i++) {
        const res = await POST(buildRequest({ newLabel: 'bob', address: addr }));
        lastStatus = res.status;
      }
      expect(lastStatus).toBe(429);
    });
  });
});

describe('/api/identity/change — service unconfigured', () => {
  it('returns 503 when AUDRIC_PARENT_NFT_PRIVATE_KEY is unset', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      env: {
        AUDRIC_PARENT_NFT_PRIVATE_KEY: undefined,
        NEXT_PUBLIC_SUI_NETWORK: 'mainnet',
      },
    }));
    vi.doMock('@/lib/prisma', () => ({
      prisma: {
        user: {
          findUnique: vi.fn().mockResolvedValue({ id: 'u1', username: 'alice' }),
          update: vi.fn(),
        },
      },
    }));

    const mod = await import('./route');
    const POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;

    const res = await POST(buildRequest({ newLabel: 'bob', address: freshAddr() }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('temporarily unavailable');

    vi.doUnmock('@/lib/env');
    vi.doUnmock('@/lib/prisma');
    vi.resetModules();
  });
});
