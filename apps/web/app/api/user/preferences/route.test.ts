import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// [SIMPLIFICATION DAY 5] dcaSchedules + allowanceId columns dropped from
// UserPreferences. Tests now cover only the surviving surface (contacts +
// limits). DCA scheduling lived under the autonomous-action stack which is
// fully retired.

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPreferences: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
    $executeRaw: () => Promise.resolve(0),
  },
}));

function buildGetRequest(address?: string): NextRequest {
  const url = address
    ? `http://localhost/api/user/preferences?address=${address}`
    : 'http://localhost/api/user/preferences';
  return new NextRequest(url, { method: 'GET' });
}

function buildPostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/user/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// SPEC 10 v0.2.1 Phase A.2 — `contacts` reads/writes pass through the
// unified Zod schema. Fake addresses like `0xabc` are silently dropped (they
// don't match `/^0x[0-9a-fA-F]{64}$/`), so test fixtures use real Sui-shaped
// addresses. Wallet-address validation in the route stays loose
// (`startsWith('0x')`) since auth/wallet identity is enforced upstream.
const ADDR_ALICE =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDR_BOB =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const WALLET_ADDR =
  '0x1111111111111111111111111111111111111111111111111111111111111111';

describe('/api/user/preferences', () => {
  let GET: (req: Request) => Promise<Response>;
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./route');
    GET = mod.GET as unknown as (req: Request) => Promise<Response>;
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  describe('GET', () => {
    it('returns contacts and limits for existing user (legacy storage shape)', async () => {
      // Storage in legacy {name, address} shape — represents existing prod
      // data prior to A.2 migration. Response is projected back to the same
      // shape (the client contract for hooks/useContacts.ts).
      const stored = [{ name: 'Alice', address: ADDR_ALICE }];
      mockFindUnique.mockResolvedValueOnce({ contacts: stored, limits: null });

      const res = await GET(buildGetRequest(WALLET_ADDR));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.contacts).toEqual(stored);
      expect(body.limits).toBeNull();
    });

    it('projects unified storage shape back to {name, address} for the client', async () => {
      const stored = [
        {
          name: 'Alice',
          identifier: ADDR_ALICE,
          resolvedAddress: ADDR_ALICE.toLowerCase(),
          audricUsername: null,
          source: 'save_contact',
        },
      ];
      mockFindUnique.mockResolvedValueOnce({ contacts: stored, limits: null });

      const res = await GET(buildGetRequest(WALLET_ADDR));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.contacts).toEqual([{ name: 'Alice', address: ADDR_ALICE }]);
    });

    it('returns empty contacts for new user', async () => {
      mockFindUnique.mockResolvedValueOnce(null);

      const res = await GET(buildGetRequest('0xnewuser'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.contacts).toEqual([]);
      expect(body.limits).toBeNull();
    });

    it('returns 400 for missing address', async () => {
      const res = await GET(buildGetRequest());
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('Missing or invalid address');
    });

    it('returns 400 for invalid address (no 0x prefix)', async () => {
      const res = await GET(buildGetRequest('not-an-address'));
      expect(res.status).toBe(400);
    });
  });

  describe('POST', () => {
    it('upserts contacts for valid address (legacy input → unified write)', async () => {
      const inputContacts = [{ name: 'Bob', address: ADDR_BOB }];
      // Mock returns the unified shape that would actually have been written.
      mockUpsert.mockResolvedValueOnce({
        contacts: [
          {
            name: 'Bob',
            identifier: ADDR_BOB,
            resolvedAddress: ADDR_BOB.toLowerCase(),
            audricUsername: null,
            source: 'import',
          },
        ],
        limits: null,
      });

      const res = await POST(
        buildPostRequest({ address: WALLET_ADDR, contacts: inputContacts }),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      // Response projects back to client {name, address} contract.
      expect(body.contacts).toEqual([{ name: 'Bob', address: ADDR_BOB }]);
      expect(mockUpsert).toHaveBeenCalledOnce();

      // Verify the WRITE went out in unified shape (not legacy).
      const upsertArgs = mockUpsert.mock.calls[0][0];
      expect(upsertArgs.update.contacts).toHaveLength(1);
      expect(upsertArgs.update.contacts[0]).toMatchObject({
        name: 'Bob',
        identifier: ADDR_BOB,
        resolvedAddress: ADDR_BOB.toLowerCase(),
        audricUsername: null,
        source: 'import',
      });
    });

    it('drops malformed contact rows on POST without rejecting the whole request', async () => {
      mockUpsert.mockResolvedValueOnce({ contacts: [], limits: null });

      const res = await POST(
        buildPostRequest({
          address: WALLET_ADDR,
          contacts: [
            { name: 'Bob', address: ADDR_BOB }, // valid
            { name: 'Bad', address: '0xabc' }, // malformed (too short)
            null,
            { totally: 'broken' },
          ],
        }),
      );

      expect(res.status).toBe(200);
      const upsertArgs = mockUpsert.mock.calls[0][0];
      // Only the valid row survives.
      expect(upsertArgs.update.contacts).toHaveLength(1);
      expect(upsertArgs.update.contacts[0]).toMatchObject({
        name: 'Bob',
        identifier: ADDR_BOB,
      });
    });

    it('upserts limits for valid address', async () => {
      const limits = { dailySend: 1000 };
      mockUpsert.mockResolvedValueOnce({ contacts: [], limits });

      const res = await POST(buildPostRequest({ address: WALLET_ADDR, limits }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.limits).toEqual(limits);
    });

    it('returns 400 for missing address', async () => {
      const res = await POST(buildPostRequest({ contacts: [] }));
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('Missing or invalid address');
    });

    it('returns 400 for invalid address (no 0x prefix)', async () => {
      const res = await POST(buildPostRequest({ address: 'bad', contacts: [] }));
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid JSON body', async () => {
      const req = new NextRequest('http://localhost/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('Invalid JSON');
    });
  });
});
