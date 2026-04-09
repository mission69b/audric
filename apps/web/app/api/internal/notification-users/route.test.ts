import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    userPreferences: { findMany: vi.fn() },
  },
}));

vi.stubEnv('T2000_INTERNAL_KEY', 'test-secret');

import { prisma } from '@/lib/prisma';
import { GET } from './route';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/internal/notification-users', {
    headers: { 'x-internal-key': 'test-secret' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.userPreferences.findMany).mockResolvedValue([]);
});

describe('GET /api/internal/notification-users', () => {
  it('returns all eligible users regardless of timezone', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'u1',
        email: 'alice@example.com',
        suiAddress: '0x' + 'a'.repeat(64),
        timezoneOffset: -480,
        notificationPrefs: [],
      },
      {
        id: 'u2',
        email: 'bob@example.com',
        suiAddress: '0x' + 'b'.repeat(64),
        timezoneOffset: 300,
        notificationPrefs: [],
      },
    ] as never);

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.users).toHaveLength(2);
    expect(data.users.map((u: { email: string }) => u.email)).toEqual([
      'alice@example.com',
      'bob@example.com',
    ]);
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

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.users[0].prefs).toEqual({
      hf_alert: true,
      briefing: false,
      rate_alert: true,
    });
  });

  it('rejects missing internal key', async () => {
    const req = new NextRequest('http://localhost/api/internal/notification-users');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns empty array when no users exist', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.users).toEqual([]);
  });
});
