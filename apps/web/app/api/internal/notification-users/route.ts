import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_PREFS: Record<string, boolean> = {
  hf_alert: true,
  briefing: true,
  rate_alert: true,
  auto_compound: true,
};

/**
 * GET /api/internal/notification-users
 * Called by the t2000 ECS cron every hour.
 * Returns all eligible users — no timezone filtering. Briefings are sent
 * once daily at a fixed UTC hour (UTC 13:00); HF/rate alerts run every hour.
 * Idempotency is handled by the cron jobs themselves (DailyBriefing dedup etc).
 */
export async function GET(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

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

  const filtered = users;

  const addresses = filtered.map((u) => u.suiAddress);
  const prefsRows = addresses.length > 0
    ? await prisma.userPreferences.findMany({
        where: { address: { in: addresses } },
        select: { address: true, allowanceId: true },
      })
    : [];
  const prefsByAddress = new Map(prefsRows.map((p) => [p.address, p]));

  const eligible = filtered.map((u) => {
      const prefs = { ...DEFAULT_PREFS };
      for (const p of u.notificationPrefs) {
        prefs[p.feature] = p.enabled;
      }

      return {
        userId: u.id,
        email: u.email!,
        walletAddress: u.suiAddress,
        allowanceId: prefsByAddress.get(u.suiAddress)?.allowanceId ?? null,
        timezoneOffset: u.timezoneOffset,
        prefs,
      };
    });

  return NextResponse.json({ users: eligible });
}
