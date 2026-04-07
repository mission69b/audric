import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
  },
}));

vi.stubEnv('T2000_INTERNAL_KEY', 'test-secret');

import { prisma } from '@/lib/prisma';
import { GET } from './route';

function makeRequest(hour: number): NextRequest {
  return new NextRequest(`http://localhost/api/internal/notification-users?hour=${hour}`, {
    headers: { 'x-internal-key': 'test-secret' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/internal/notification-users', () => {
  it('returns users whose local time is 8am', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'u1',
        email: 'alice@example.com',
        suiAddress: '0x' + 'a'.repeat(64),
        timezoneOffset: -480, // UTC+8 → 8am when UTC=0
        notificationPrefs: [],
      },
      {
        id: 'u2',
        email: 'bob@example.com',
        suiAddress: '0x' + 'b'.repeat(64),
        timezoneOffset: 300, // UTC-5 → 8am when UTC=13
        notificationPrefs: [],
      },
    ] as never);

    const res = await GET(makeRequest(0));
    const data = await res.json();

    expect(data.users).toHaveLength(1);
    expect(data.users[0].userId).toBe('u1');
    expect(data.users[0].email).toBe('alice@example.com');
    expect(data.users[0].prefs).toEqual({
      hf_alert: true,
      briefing: true,
      rate_alert: true,
    });
  });

  it('merges stored prefs with defaults', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'u1',
        email: 'alice@example.com',
        suiAddress: '0x' + 'a'.repeat(64),
        timezoneOffset: -480,
        notificationPrefs: [
          { feature: 'briefing', enabled: false },
        ],
      },
    ] as never);

    const res = await GET(makeRequest(0));
    const data = await res.json();

    expect(data.users[0].prefs).toEqual({
      hf_alert: true,
      briefing: false,
      rate_alert: true,
    });
  });

  it('rejects missing internal key', async () => {
    const req = new NextRequest('http://localhost/api/internal/notification-users?hour=0');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('rejects invalid hour', async () => {
    const req = new NextRequest('http://localhost/api/internal/notification-users?hour=25', {
      headers: { 'x-internal-key': 'test-secret' },
    });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns empty array when no users match', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    const res = await GET(makeRequest(0));
    const data = await res.json();

    expect(data.users).toEqual([]);
  });
});
