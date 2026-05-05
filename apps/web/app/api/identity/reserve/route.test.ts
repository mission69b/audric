import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests for /api/identity/reserve (SPEC 10 v0.2.1 Phase B.2).
 *
 * Coverage matrix — every short-circuit path in the funnel + every
 * post-mint failure mode (DB race, DB outage, on-chain revert):
 *
 *   1. Auth: missing JWT -> 401
 *   2. Input: invalid address -> 400
 *   3. Input: invalid label (too-short) -> 400 reason=invalid
 *   4. Input: reserved label -> 400 reason=reserved
 *   5. User: not found -> 404
 *   6. User: already has username -> 400
 *   7. Service: custody key unconfigured -> 503
 *   8. SuiNS: RPC throws -> 503
 *   9. SuiNS: name already minted on-chain -> 409 reason=taken
 *  10. DB: same label exists in Postgres -> 409 reason=taken
 *  11. Mint: tx reverts on-chain -> 502
 *  12. Mint: success -> 200 + DB writes username
 *  13. Race: P2002 after mint -> 409 + revoke tx fired
 *  14. Race: other DB error after mint -> 500 + ORPHAN logged
 *
 * Every test uses a fresh suiAddress so the per-address rate limiter
 * (5/24h) doesn't bleed across tests.
 */

const validJwt =
  'eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QifQ.' +
  Buffer.from(
    JSON.stringify({ sub: 'test-user', email: 'test@example.com', exp: Date.now() / 1000 + 3600 }),
  )
    .toString('base64url') +
  '.signature';

const ADDR_A = '0x' + 'a'.repeat(64);
const ADDR_B = '0x' + 'b'.repeat(64);

let nextAddrSeed = 0;
function freshAddr(): string {
  nextAddrSeed++;
  return '0x' + nextAddrSeed.toString(16).padStart(64, '0');
}

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockResolveSuinsViaRpc = vi.fn();
const mockSignAndExecute = vi.fn();
const mockBuildAddLeafTx = vi.fn();
const mockBuildRevokeLeafTx = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

vi.mock('@t2000/engine', async () => {
  const actual = await vi.importActual<typeof import('@t2000/engine')>('@t2000/engine');
  return {
    ...actual,
    resolveSuinsViaRpc: (...args: unknown[]) => mockResolveSuinsViaRpc(...args),
  };
});

vi.mock('@t2000/sdk', async () => {
  const actual = await vi.importActual<typeof import('@t2000/sdk')>('@t2000/sdk');
  return {
    ...actual,
    buildAddLeafTx: (...args: unknown[]) => mockBuildAddLeafTx(...args),
    buildRevokeLeafTx: (...args: unknown[]) => mockBuildRevokeLeafTx(...args),
  };
});

vi.mock('@/lib/sui-rpc', () => ({
  getSuiRpcUrl: () => 'http://test-rpc.invalid',
}));

// Plain functions (NOT vi.fn) so vi.resetAllMocks() in beforeEach doesn't
// nuke the mockImplementation and leave `new SuiJsonRpcClient()` returning
// `undefined`. The mockSignAndExecute spy ALONE is the per-test mock — the
// constructor stays stable across the whole suite.
vi.mock('@mysten/sui/jsonRpc', () => ({
  SuiJsonRpcClient: function () {
    return {
      signAndExecuteTransaction: (...args: unknown[]) => mockSignAndExecute(...args),
    };
  },
}));

vi.mock('@mysten/suins', () => ({
  SuinsClient: function () {
    return {};
  },
}));

// vi.mock factories are hoisted ABOVE module-level statements, so any
// reference to the top-level Ed25519Keypair import would be undefined
// when the factory runs. Importing inside the async factory closes the
// loop — the dynamic import is awaited before the route module loads.
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
  return new NextRequest('http://localhost/api/identity/reserve', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-zklogin-jwt': validJwt,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('/api/identity/reserve', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    // resetAllMocks (vs clearAllMocks) drains the `.mockResolvedValueOnce`
    // queue between tests too — clearAllMocks only clears `.mock.calls`,
    // which lets a stale queued resolution leak into the next test and
    // surface as e.g. a spurious 503 when the actual code path expected a
    // null resolution. (Caught the first time these tests ran.)
    vi.resetAllMocks();
    mockBuildAddLeafTx.mockReturnValue({ __mockTx: 'add' });
    mockBuildRevokeLeafTx.mockReturnValue({ __mockTx: 'revoke' });
    const mod = await import('./route');
    POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;
  });

  describe('auth + input validation', () => {
    it('returns 401 when JWT header is missing', async () => {
      const req = new NextRequest('http://localhost/api/identity/reserve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'alice', address: freshAddr() }),
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
      const res = await POST(buildRequest({ label: 'alice', address: '0xabc' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('Invalid address');
    });

    it('returns 400 + reason=too-short for 2-char label', async () => {
      const res = await POST(buildRequest({ label: 'ab', address: freshAddr() }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ reason: 'too-short' });
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    it('returns 400 + reason=too-long for 21-char label', async () => {
      const res = await POST(buildRequest({ label: 'a'.repeat(21), address: freshAddr() }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ reason: 'too-long' });
    });

    it('returns 400 + reason=invalid for label with leading hyphen', async () => {
      const res = await POST(buildRequest({ label: '-bad', address: freshAddr() }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ reason: 'invalid' });
    });

    it('returns 400 + reason=reserved for reserved label', async () => {
      const res = await POST(buildRequest({ label: 'admin', address: freshAddr() }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ reason: 'reserved' });
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });
  });

  describe('user resource binding', () => {
    it('returns 404 when User row does not exist', async () => {
      mockUserFindUnique.mockResolvedValueOnce(null);
      const res = await POST(buildRequest({ label: 'alice', address: freshAddr() }));
      expect(res.status).toBe(404);
      expect((await res.json()).error).toContain('complete signup');
      expect(mockResolveSuinsViaRpc).not.toHaveBeenCalled();
    });

    it('returns 400 when User already has a username', async () => {
      mockUserFindUnique.mockResolvedValueOnce({ id: 'u1', username: 'taken-already' });
      const res = await POST(buildRequest({ label: 'alice', address: freshAddr() }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain('already have a username');
      expect(mockResolveSuinsViaRpc).not.toHaveBeenCalled();
    });
  });

  describe('SuiNS + DB anti-race funnel', () => {
    it('returns 409 + reason=taken when SuiNS RPC reports leaf exists on-chain', async () => {
      mockUserFindUnique.mockResolvedValueOnce({ id: 'u1', username: null });
      mockResolveSuinsViaRpc.mockResolvedValueOnce(ADDR_B);
      const res = await POST(buildRequest({ label: 'alice', address: freshAddr() }));
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ reason: 'taken' });
      expect(mockSignAndExecute).not.toHaveBeenCalled();
    });

    it('returns 503 when SuiNS RPC throws', async () => {
      mockUserFindUnique.mockResolvedValueOnce({ id: 'u1', username: null });
      mockResolveSuinsViaRpc.mockRejectedValueOnce(new Error('network down'));
      const res = await POST(buildRequest({ label: 'alice', address: freshAddr() }));
      expect(res.status).toBe(503);
      expect(mockSignAndExecute).not.toHaveBeenCalled();
    });

    it('returns 409 + reason=taken when DB has the username already', async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'u1', username: null })
        .mockResolvedValueOnce({ id: 'u-other' });
      mockResolveSuinsViaRpc.mockResolvedValueOnce(null);
      const res = await POST(buildRequest({ label: 'alice', address: freshAddr() }));
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ reason: 'taken' });
      expect(mockSignAndExecute).not.toHaveBeenCalled();
    });
  });

  describe('on-chain mint + DB write', () => {
    it('returns 502 when on-chain tx reverts', async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'u1', username: null })
        .mockResolvedValueOnce(null);
      mockResolveSuinsViaRpc.mockResolvedValueOnce(null);
      mockSignAndExecute.mockResolvedValueOnce({
        digest: '0xdeadbeef',
        effects: { status: { status: 'failure', error: 'CommandArgumentError' } },
      });
      const res = await POST(buildRequest({ label: 'alice', address: freshAddr() }));
      expect(res.status).toBe(502);
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it('returns 200 + writes username on successful mint', async () => {
      const addr = freshAddr();
      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'u1', username: null })
        .mockResolvedValueOnce(null);
      mockResolveSuinsViaRpc.mockResolvedValueOnce(null);
      mockSignAndExecute.mockResolvedValueOnce({
        digest: '0xMINTED',
        effects: { status: { status: 'success' } },
      });
      mockUserUpdate.mockResolvedValueOnce({});

      const res = await POST(buildRequest({ label: 'alice', address: addr }));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        success: true,
        label: 'alice',
        fullHandle: 'alice.audric.sui',
        txDigest: '0xMINTED',
        walletAddress: addr,
      });

      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({
            username: 'alice',
            usernameMintTxDigest: '0xMINTED',
          }),
        }),
      );
      expect(mockBuildAddLeafTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ label: 'alice', targetAddress: addr }),
      );
    });

    it('lowercases + trims label before mint and DB write', async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'u1', username: null })
        .mockResolvedValueOnce(null);
      mockResolveSuinsViaRpc.mockResolvedValueOnce(null);
      mockSignAndExecute.mockResolvedValueOnce({
        digest: '0xMINTED',
        effects: { status: { status: 'success' } },
      });
      mockUserUpdate.mockResolvedValueOnce({});

      const res = await POST(buildRequest({ label: '  Alice  ', address: freshAddr() }));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ label: 'alice' });
      expect(mockBuildAddLeafTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ label: 'alice' }),
      );
    });
  });

  describe('post-mint race + failure recovery', () => {
    it('fires revoke + returns 409 when DB hits P2002 after on-chain mint', async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'u1', username: null })
        .mockResolvedValueOnce(null);
      mockResolveSuinsViaRpc.mockResolvedValueOnce(null);
      mockSignAndExecute
        .mockResolvedValueOnce({
          digest: '0xMINTED',
          effects: { status: { status: 'success' } },
        })
        .mockResolvedValueOnce({ digest: '0xREVOKED' });

      const { Prisma } = await import('@/lib/generated/prisma/client');
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`username`)',
        { code: 'P2002', clientVersion: 'test' },
      );
      mockUserUpdate.mockRejectedValueOnce(p2002);

      const res = await POST(buildRequest({ label: 'alice', address: freshAddr() }));
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ reason: 'taken' });
      expect(mockBuildRevokeLeafTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ label: 'alice' }),
      );
      expect(mockSignAndExecute).toHaveBeenCalledTimes(2);
    });

    it('returns 500 + does NOT revoke when DB fails for non-P2002 reason after mint (orphan)', async () => {
      mockUserFindUnique
        .mockResolvedValueOnce({ id: 'u1', username: null })
        .mockResolvedValueOnce(null);
      mockResolveSuinsViaRpc.mockResolvedValueOnce(null);
      mockSignAndExecute.mockResolvedValueOnce({
        digest: '0xORPHAN1234567890',
        effects: { status: { status: 'success' } },
      });
      mockUserUpdate.mockRejectedValueOnce(new Error('Postgres connection lost'));

      const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await POST(buildRequest({ label: 'alice', address: freshAddr() }));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toContain('0xORPHAN1234');
      expect(mockBuildRevokeLeafTx).not.toHaveBeenCalled();
      expect(consoleErr).toHaveBeenCalledWith(
        expect.stringContaining('ORPHAN'),
        expect.anything(),
      );
      consoleErr.mockRestore();
    });
  });

  describe('rate limiting', () => {
    it('returns 429 after 5 attempts from the same address', async () => {
      const addr = freshAddr();
      mockUserFindUnique.mockResolvedValue({ id: 'u1', username: null });
      mockResolveSuinsViaRpc.mockResolvedValue(ADDR_A);

      let lastStatus = 0;
      for (let i = 0; i < 6; i++) {
        const res = await POST(buildRequest({ label: 'alice', address: addr }));
        lastStatus = res.status;
      }
      expect(lastStatus).toBe(429);
    });
  });
});

/**
 * Smoke check: when the env var is empty, the route returns 503 instead
 * of crashing. Uses isolateModules so the env mock can be redefined
 * separately from the test suite above (vitest hoists vi.mock to the top
 * of the file, so we can't toggle it per-describe).
 */
describe('/api/identity/reserve — service unconfigured', () => {
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
          findUnique: vi.fn().mockResolvedValue({ id: 'u1', username: null }),
          update: vi.fn(),
        },
      },
    }));

    const mod = await import('./route');
    const POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;

    const res = await POST(buildRequest({ label: 'alice', address: freshAddr() }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('temporarily unavailable');

    vi.doUnmock('@/lib/env');
    vi.doUnmock('@/lib/prisma');
    vi.resetModules();
  });
});
