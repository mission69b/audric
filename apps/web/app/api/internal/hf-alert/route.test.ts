import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockSend = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    notificationPrefs: { upsert: vi.fn() },
  },
}));

vi.stubEnv('T2000_INTERNAL_KEY', 'test-secret');
vi.stubEnv('RESEND_API_KEY', 'test-resend-key');

import { prisma } from '@/lib/prisma';
import { POST } from './route';

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/internal/hf-alert', {
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

describe('POST /api/internal/hf-alert', () => {
  it('sends critical HF alert email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      email: 'alice@example.com',
      emailVerified: true,
      notificationPrefs: [],
    } as never);
    mockSend.mockResolvedValue({ id: 'email-001' });

    const res = await POST(
      makeRequest({
        walletAddress: '0x' + 'a'.repeat(64),
        healthFactor: 1.05,
        debtBalance: 300,
        level: 'critical',
        triggeredAt: new Date().toISOString(),
      }),
    );

    const data = await res.json();
    expect(data.sent).toBe(true);
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0].subject).toContain('1.05');
  });

  it('skips users without verified email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      email: null,
      emailVerified: false,
      notificationPrefs: [],
    } as never);

    const res = await POST(
      makeRequest({
        walletAddress: '0x' + 'a'.repeat(64),
        healthFactor: 1.05,
        debtBalance: 300,
        level: 'critical',
        triggeredAt: new Date().toISOString(),
      }),
    );

    const data = await res.json();
    expect(data.skipped).toBe('no_verified_email');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('skips users who opted out', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      email: 'alice@example.com',
      emailVerified: true,
      notificationPrefs: [{ enabled: false, lastSentAt: null }],
    } as never);

    const res = await POST(
      makeRequest({
        walletAddress: '0x' + 'a'.repeat(64),
        healthFactor: 1.05,
        debtBalance: 300,
        level: 'critical',
        triggeredAt: new Date().toISOString(),
      }),
    );

    const data = await res.json();
    expect(data.skipped).toBe('opted_out');
  });

  it('deduplicates within 30 minutes', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      email: 'alice@example.com',
      emailVerified: true,
      notificationPrefs: [
        { enabled: true, lastSentAt: new Date(Date.now() - 10 * 60 * 1000) },
      ],
    } as never);

    const res = await POST(
      makeRequest({
        walletAddress: '0x' + 'a'.repeat(64),
        healthFactor: 1.05,
        debtBalance: 300,
        level: 'critical',
        triggeredAt: new Date().toISOString(),
      }),
    );

    const data = await res.json();
    expect(data.skipped).toBe('dedup');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('rejects non-critical level', async () => {
    const res = await POST(
      makeRequest({
        walletAddress: '0x' + 'a'.repeat(64),
        healthFactor: 1.5,
        debtBalance: 300,
        level: 'warn',
        triggeredAt: new Date().toISOString(),
      }),
    );

    expect(res.status).toBe(400);
  });

  it('rejects missing internal key', async () => {
    const req = new NextRequest('http://localhost/api/internal/hf-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: '0xabc', healthFactor: 1.0, debtBalance: 300, level: 'critical' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
