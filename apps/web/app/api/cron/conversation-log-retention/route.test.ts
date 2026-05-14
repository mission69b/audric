import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockDeleteMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    conversationLog: {
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

vi.mock('@/lib/env', () => ({
  env: { CRON_SECRET: 'test-cron-secret' },
}));

function buildReq(authHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/cron/conversation-log-retention', {
    method: 'GET',
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe('/api/cron/conversation-log-retention (SPEC 30 D-12)', () => {
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

  it('deletes ConversationLog rows older than 365 days', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 1234 });

    const res = await GET(buildReq('Bearer test-cron-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(1234);

    const args = mockDeleteMany.mock.calls[0][0];
    const cutoff = args.where.createdAt.lt as Date;
    const expectedCutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expectedCutoff)).toBeLessThan(10_000);
  });

  it('reports zero when nothing to delete', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 0 });

    const res = await GET(buildReq('Bearer test-cron-secret'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(0);
  });
});
