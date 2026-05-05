import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests for /api/identity/search (SPEC 10 v0.2 Phase C.3a).
 *
 * Coverage matrix:
 *   - 400 on missing/empty `q` parameter
 *   - silent-fail to empty results on invalid charset (no 400 mid-typing)
 *   - 200 with prefix-matched, alphabetically sorted results
 *   - clamps `limit` to [1, 25]
 *   - filters out unbacked rows (defensive — should not occur in prod)
 *   - response shape: `{ results: [{ username, fullHandle, address, claimedAt }] }`
 */

const mockUserFindMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
    },
  },
}));

function buildRequest(
  q?: string,
  extra: Record<string, string> = {},
  headers: Record<string, string> = {},
): NextRequest {
  const ip =
    headers['x-forwarded-for'] ??
    `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const params = new URLSearchParams();
  if (q !== undefined) params.set('q', q);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const url = `http://localhost/api/identity/search${params.toString() ? `?${params.toString()}` : ''}`;
  return new NextRequest(url, {
    headers: { 'x-forwarded-for': ip, ...headers },
  });
}

describe('GET /api/identity/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindMany.mockReset();
  });

  it('returns 400 when q is missing', async () => {
    const { GET } = await import('./route');
    const res = await GET(buildRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing/i);
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it('returns 400 when q is an empty string after trimming', async () => {
    const { GET } = await import('./route');
    const res = await GET(buildRequest('   '));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/empty/i);
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it('silently returns empty results on invalid charset (no 400 mid-typing)', async () => {
    const { GET } = await import('./route');
    // Includes '!' which is not in the SUINS charset.
    const res = await GET(buildRequest('al!ce'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
    // Importantly: we never hit Prisma — short-circuit at charset filter.
    expect(mockUserFindMany).not.toHaveBeenCalled();
  });

  it('returns prefix-matched results in the canonical shape', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      {
        username: 'alice',
        suiAddress: '0xa11ce0000000000000000000000000000000000000000000000000000000aaaa',
        usernameClaimedAt: new Date('2026-05-01T12:00:00Z'),
      },
      {
        username: 'alex',
        suiAddress: '0xa1ec0000000000000000000000000000000000000000000000000000000aaaaa',
        usernameClaimedAt: new Date('2026-04-15T08:30:00Z'),
      },
    ]);
    const { GET } = await import('./route');
    const res = await GET(buildRequest('al'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toEqual({
      username: 'alice',
      fullHandle: 'alice.audric.sui',
      address: '0xa11ce0000000000000000000000000000000000000000000000000000000aaaa',
      claimedAt: '2026-05-01T12:00:00.000Z',
    });
    expect(body.results[1].fullHandle).toBe('alex.audric.sui');
  });

  it('passes startsWith query + default limit 10 to prisma', async () => {
    mockUserFindMany.mockResolvedValueOnce([]);
    const { GET } = await import('./route');
    await GET(buildRequest('fun'));
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          username: { startsWith: 'fun' },
        }),
        take: 10,
      }),
    );
  });

  it('clamps limit to [1, 25] (rejects 0, caps 100 → 25)', async () => {
    mockUserFindMany.mockResolvedValue([]);
    const { GET } = await import('./route');
    await GET(buildRequest('al', { limit: '0' }));
    expect(mockUserFindMany.mock.calls[0][0].take).toBe(1);
    await GET(buildRequest('al', { limit: '100' }));
    expect(mockUserFindMany.mock.calls[1][0].take).toBe(25);
    await GET(buildRequest('al', { limit: '7' }));
    expect(mockUserFindMany.mock.calls[2][0].take).toBe(7);
  });

  it('lowercases the query before passing to prisma (case-insensitive UX)', async () => {
    mockUserFindMany.mockResolvedValueOnce([]);
    const { GET } = await import('./route');
    await GET(buildRequest('ALICE'));
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ username: { startsWith: 'alice' } }),
      }),
    );
  });

  it('filters out rows with null username/claimedAt (defensive, should not occur in prod)', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      {
        username: 'alice',
        suiAddress: '0xa11ce0000000000000000000000000000000000000000000000000000000aaaa',
        usernameClaimedAt: new Date('2026-05-01T12:00:00Z'),
      },
      {
        // Defensive case — should not exist (reserve route writes both atomically)
        username: null,
        suiAddress: '0xnone',
        usernameClaimedAt: null,
      },
    ]);
    const { GET } = await import('./route');
    const res = await GET(buildRequest('al'));
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].username).toBe('alice');
  });
});
