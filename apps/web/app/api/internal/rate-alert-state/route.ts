import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const INTERNAL_KEY = process.env.AUDRIC_INTERNAL_KEY ?? '';

function verifyInternal(request: NextRequest): boolean {
  const key = request.headers.get('x-internal-key');
  return !!key && key === INTERNAL_KEY;
}

/**
 * GET /api/internal/rate-alert-state?address=0x...
 *
 * Returns the last notified USDC rate and timestamp for a user.
 * Uses NotificationPrefs with feature='rate_alert'.
 */
export async function GET(request: NextRequest) {
  if (!verifyInternal(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const address = request.nextUrl.searchParams.get('address');
  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { suiAddress: address },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ lastNotifiedRate: null, lastSentAt: null });
    }

    const pref = await prisma.notificationPrefs.findUnique({
      where: { userId_feature: { userId: user.id, feature: 'rate_alert' } },
    });

    if (!pref) {
      return NextResponse.json({ lastNotifiedRate: null, lastSentAt: null });
    }

    // Store lastNotifiedRate in the feature's metadata via a convention:
    // We use `lastSentAt` for dedup timing, and store the rate in UserPreferences.limits
    const prefs = await prisma.userPreferences.findFirst({
      where: { userId: user.id },
      select: { limits: true },
    });

    const limits = (prefs?.limits ?? {}) as Record<string, unknown>;
    const lastNotifiedRate = typeof limits.lastNotifiedRate === 'number' ? limits.lastNotifiedRate : null;

    return NextResponse.json({
      lastNotifiedRate,
      lastSentAt: pref.lastSentAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error('[rate-alert-state] GET error:', err);
    return NextResponse.json({ lastNotifiedRate: null, lastSentAt: null });
  }
}

/**
 * POST /api/internal/rate-alert-state
 *
 * Updates the last notified rate for a user.
 */
export async function POST(request: NextRequest) {
  if (!verifyInternal(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { address: string; lastNotifiedRate: number };
    const { address, lastNotifiedRate } = body;

    if (!address || typeof lastNotifiedRate !== 'number') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { suiAddress: address },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update NotificationPrefs lastSentAt
    await prisma.notificationPrefs.upsert({
      where: { userId_feature: { userId: user.id, feature: 'rate_alert' } },
      create: { userId: user.id, feature: 'rate_alert', enabled: true, lastSentAt: new Date() },
      update: { lastSentAt: new Date() },
    });

    // Store rate in UserPreferences.limits — create row if missing
    const existing = await prisma.userPreferences.findFirst({
      where: { userId: user.id },
      select: { address: true, limits: true },
    });

    if (existing) {
      const prev = (existing.limits && typeof existing.limits === 'object' && !Array.isArray(existing.limits))
        ? existing.limits as Record<string, unknown>
        : {};
      const limits = { ...prev, lastNotifiedRate } as Prisma.InputJsonValue;
      await prisma.userPreferences.update({
        where: { address: existing.address },
        data: { limits },
      });
    } else {
      await prisma.userPreferences.create({
        data: {
          address,
          userId: user.id,
          limits: { lastNotifiedRate },
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[rate-alert-state] POST error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
