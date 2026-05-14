import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockTurnDeleteMany = vi.fn();
const mockAdviceDeleteMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    turnMetrics: {
      deleteMany: (...args: unknown[]) => mockTurnDeleteMany(...args),
    },
    adviceLog: {
      deleteMany: (...args: unknown[]) => mockAdviceDeleteMany(...args),
    },
  },
}));

vi.mock('@/lib/env', () => ({
  env: { CRON_SECRET: 'test-cron-secret' },
}));

function buildReq(authHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/cron/turn-metrics-cleanup', {
    method: 'GET',
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe('/api/cron/turn-metrics-cleanup (SPEC 30 D-12)', () => {
  let GET: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTurnDeleteMany.mockResolvedValue({ count: 0 });
    mockAdviceDeleteMany.mockResolvedValue({ count: 0 });
    const mod = await import('./route');
    GET = mod.GET as unknown as (req: Request) => Promise<Response>;
  });

  it('rejects requests without the CRON_SECRET bearer', async () => {
    const res = await GET(buildReq());
    expect(res.status).toBe(401);
  });

  it('rejects requests with the wrong CRON_SECRET', async () => {
    const res = await GET(buildReq('Bearer wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('accepts requests with the correct CRON_SECRET', async () => {
    const res = await GET(buildReq('Bearer test-cron-secret'));
    expect(res.status).toBe(200);
  });

  it('deletes TurnMetrics older than 90 days', async () => {
    mockTurnDeleteMany.mockResolvedValueOnce({ count: 42 });

    const res = await GET(buildReq('Bearer test-cron-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.turnMetricsDeleted).toBe(42);

    const args = mockTurnDeleteMany.mock.calls[0][0];
    const cutoff = args.where.createdAt.lt as Date;
    const expectedCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    // Allow a few seconds of clock drift between cron and assertion.
    expect(Math.abs(cutoff.getTime() - expectedCutoff)).toBeLessThan(10_000);
  });

  it('also deletes AdviceLog older than 90 days (D-12 unified TTL)', async () => {
    mockAdviceDeleteMany.mockResolvedValueOnce({ count: 7 });

    const res = await GET(buildReq('Bearer test-cron-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.adviceLogDeleted).toBe(7);
    expect(mockAdviceDeleteMany).toHaveBeenCalledOnce();
  });

  it('returns both counts in a single response', async () => {
    mockTurnDeleteMany.mockResolvedValueOnce({ count: 100 });
    mockAdviceDeleteMany.mockResolvedValueOnce({ count: 25 });

    const res = await GET(buildReq('Bearer test-cron-secret'));
    const body = await res.json();

    expect(body.turnMetricsDeleted).toBe(100);
    expect(body.adviceLogDeleted).toBe(25);
  });
});
