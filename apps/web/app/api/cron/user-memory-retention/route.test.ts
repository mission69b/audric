import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockDeleteMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userMemory: {
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

vi.mock('@/lib/env', () => ({
  env: { CRON_SECRET: 'test-cron-secret' },
}));

function buildReq(authHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/cron/user-memory-retention', {
    method: 'GET',
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe('/api/cron/user-memory-retention (SPEC 30 D-12)', () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDeleteMany.mockResolvedValue({ count: 0 });
    const mod = await import('./route');
    GET = mod.GET as unknown as (req: Request) => Promise<Response>;
  });

  it('rejects requests without the CRON_SECRET bearer', async () => {
    const res = await GET(buildReq());
    expect(res.status).toBe(401);
  });

  it('accepts requests with the correct CRON_SECRET', async () => {
    const res = await GET(buildReq('Bearer test-cron-secret'));
    expect(res.status).toBe(200);
  });

  it('deletes UserMemory rows where expiresAt < now()', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 17 });

    const res = await GET(buildReq('Bearer test-cron-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(17);

    const args = mockDeleteMany.mock.calls[0][0];
    expect(args.where.expiresAt.lt).toBeInstanceOf(Date);
    // Cutoff should be very close to "now" (within 5s of test start).
    const cutoff = args.where.expiresAt.lt as Date;
    expect(Math.abs(cutoff.getTime() - Date.now())).toBeLessThan(5_000);
  });

  it('does NOT delete rows with null expiresAt (high-confidence memories)', async () => {
    // Prisma's `expiresAt: { lt: now }` predicate excludes nulls in
    // Postgres semantics — high-confidence memories with null expiresAt
    // never match the cron's delete predicate. This test asserts the
    // query shape, not Prisma internals: the predicate is the
    // strict-less-than form, which is what Prisma compiles to a
    // null-excluding SQL `WHERE expires_at < $1`.
    await GET(buildReq('Bearer test-cron-secret'));

    const args = mockDeleteMany.mock.calls[0][0];
    expect(args.where).toEqual({ expiresAt: { lt: expect.any(Date) } });
    // No `not: null` or `is: null` clause — relies on the Postgres
    // null-comparison rule that `null < any` is `unknown`, not `true`.
  });
});
