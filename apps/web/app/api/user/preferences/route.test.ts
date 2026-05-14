import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// [SIMPLIFICATION DAY 5] dcaSchedules + allowanceId columns dropped from
// UserPreferences. Tests now cover only the surviving surface (contacts +
// limits). DCA scheduling lived under the autonomous-action stack which is
// fully retired.

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
// [SPEC 30 D-13 — 2026-05-14] route now also queries User.createdAt for
// the account-age gate. Default to a long-tenured user (1y old) so
// existing tests stay unaffected; the D-13 path is exercised by the
// dedicated tests at the bottom of this file.
const mockUserFindUnique = vi.fn<(...args: unknown[]) => Promise<{ createdAt: Date } | null>>(() =>
  Promise.resolve({ createdAt: new Date(Date.now() - 365 * 86_400_000) }),
);

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPreferences: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
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
      // data prior to A.2 migration. [SPEC 10 D.4] Response is widened to
      // include audricUsername / resolvedAddress so the contacts page can
      // surface 🪪 badges; `address` continues to mirror `identifier` for
      // backward-compat with any consumer still on the old shape.
      const stored = [{ name: 'Alice', address: ADDR_ALICE }];
      mockFindUnique.mockResolvedValueOnce({ contacts: stored, limits: null });

      const res = await GET(buildGetRequest(WALLET_ADDR));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.contacts).toEqual([
        {
          name: 'Alice',
          address: ADDR_ALICE,
          identifier: ADDR_ALICE,
          resolvedAddress: ADDR_ALICE.toLowerCase(),
          audricUsername: null,
          addedAt: null,
          source: 'import',
        },
      ]);
      expect(body.limits).toBeNull();
    });

    it('projects unified storage shape into widened client contract', async () => {
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
      expect(body.contacts).toEqual([
        {
          name: 'Alice',
          address: ADDR_ALICE,
          identifier: ADDR_ALICE,
          resolvedAddress: ADDR_ALICE.toLowerCase(),
          audricUsername: null,
          addedAt: null,
          source: 'save_contact',
        },
      ]);
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
      // [SPEC 10 D.4] Response projects unified rows into widened client
      // contract (audricUsername / resolvedAddress surfaced to power
      // 🪪 badges in /settings/contacts).
      expect(body.contacts).toEqual([
        {
          name: 'Bob',
          address: ADDR_BOB,
          identifier: ADDR_BOB,
          resolvedAddress: ADDR_BOB.toLowerCase(),
          audricUsername: null,
          addedAt: null,
          source: 'import',
        },
      ]);
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

  // [SPEC 30 D-13 — 2026-05-14] Account-age field is the input the
  // client-side `shouldClientAutoApprove` mirror needs to apply the
  // <7d gate. Without these tests the field could regress silently.
  describe('GET — accountAgeDays (SPEC 30 D-13)', () => {
    it('returns the floored day count for an existing user', async () => {
      mockFindUnique.mockResolvedValueOnce({ contacts: [], limits: null });
      // 3.7 days ago → floored to 3.
      mockUserFindUnique.mockResolvedValueOnce({
        createdAt: new Date(Date.now() - 3.7 * 86_400_000),
      });

      const res = await GET(buildGetRequest(WALLET_ADDR));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.accountAgeDays).toBe(3);
    });

    it('returns null when the user record is missing (legacy fail-open)', async () => {
      mockFindUnique.mockResolvedValueOnce({ contacts: [], limits: null });
      mockUserFindUnique.mockResolvedValueOnce(null);

      const res = await GET(buildGetRequest(WALLET_ADDR));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.accountAgeDays).toBeNull();
    });

    it('returns accountAgeDays alongside an empty preferences fallback', async () => {
      mockFindUnique.mockResolvedValueOnce(null);
      mockUserFindUnique.mockResolvedValueOnce({
        createdAt: new Date(Date.now() - 1 * 86_400_000),
      });

      const res = await GET(buildGetRequest(WALLET_ADDR));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.permissionPreset).toBe('balanced');
      expect(body.accountAgeDays).toBe(1);
    });
  });
});
