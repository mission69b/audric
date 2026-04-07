import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_PREFS: Record<string, boolean> = {
  hf_alert: true,
  briefing: true,
  rate_alert: true,
};

/**
 * Checks whether the given UTC hour corresponds to 8am local time
 * for a user with the given timezoneOffset (JS getTimezoneOffset() convention).
 */
function isLocal8am(utcHour: number, timezoneOffset: number): boolean {
  const localMinutes = ((utcHour * 60 - timezoneOffset) % 1440 + 1440) % 1440;
  return Math.floor(localMinutes / 60) === 8;
}

/**
 * GET /api/internal/notification-users?hour=<utcHour>
 * Called by the t2000 ECS cron every hour.
 * Returns users whose local time is 8am at the given UTC hour.
 */
export async function GET(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const hourParam = request.nextUrl.searchParams.get('hour');
  const utcHour = hourParam !== null ? parseInt(hourParam, 10) : new Date().getUTCHours();

  if (!Number.isFinite(utcHour) || utcHour < 0 || utcHour > 23) {
    return NextResponse.json({ error: 'Invalid hour parameter' }, { status: 400 });
  }

  const users = await prisma.user.findMany({
    where: {
      emailVerified: true,
      email: { not: null },
    },
    select: {
      id: true,
      email: true,
      suiAddress: true,
      timezoneOffset: true,
      notificationPrefs: {
        select: { feature: true, enabled: true },
      },
    },
  });

  const filtered = users.filter((u) => isLocal8am(utcHour, u.timezoneOffset));

  // Look up preferences by address (not via relation, since userId may be null)
  const addresses = filtered.map((u) => u.suiAddress);
  const prefsRows = addresses.length > 0
    ? await prisma.userPreferences.findMany({
        where: { address: { in: addresses } },
        select: { address: true, limits: true },
      })
    : [];
  const prefsByAddress = new Map(prefsRows.map((p) => [p.address, p]));

  const eligible = filtered.map((u) => {
      const prefs = { ...DEFAULT_PREFS };
      for (const p of u.notificationPrefs) {
        prefs[p.feature] = p.enabled;
      }

      const userPrefs = prefsByAddress.get(u.suiAddress);
      const limits = userPrefs?.limits as Record<string, unknown> | null;
      const allowanceId = (limits?.allowanceId as string) ?? null;

      return {
        userId: u.id,
        email: u.email!,
        walletAddress: u.suiAddress,
        allowanceId,
        timezoneOffset: u.timezoneOffset,
        prefs,
      };
    });

  return NextResponse.json({ users: eligible });
}
