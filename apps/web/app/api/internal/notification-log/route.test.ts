import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notificationLog: { createMany: vi.fn() },
  },
}));

vi.stubEnv('T2000_INTERNAL_KEY', 'test-secret');

import { prisma } from '@/lib/prisma';
import { POST } from './route';

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/internal/notification-log', {
    method: 'POST',
    headers: {
      'x-internal-key': 'test-secret',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/internal/notification-log', () => {
  it('stores job results with sent > 0 or errors > 0', async () => {
    vi.mocked(prisma.notificationLog.createMany).mockResolvedValue({ count: 2 } as never);

    const results = [
      { job: 'hf_alerts', processed: 10, sent: 3, errors: 1 },
      { job: 'briefings', processed: 10, sent: 0, errors: 0 },
      { job: 'rate_alerts', processed: 10, sent: 0, errors: 2 },
    ];

    const res = await POST(makeRequest({ results, reportedAt: new Date().toISOString() }));
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(prisma.notificationLog.createMany).toHaveBeenCalledOnce();

    const createArg = vi.mocked(prisma.notificationLog.createMany).mock.calls[0][0];
    expect((createArg as { data: unknown[] }).data).toHaveLength(2);
  });

  it('rejects missing internal key', async () => {
    const req = new NextRequest('http://localhost/api/internal/notification-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects invalid body', async () => {
    const res = await POST(makeRequest({ results: 'not-an-array' }));
    expect(res.status).toBe(400);
  });
});
