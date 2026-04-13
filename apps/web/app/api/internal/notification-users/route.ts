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
 *
 * Query params:
 *   source=profile-inference — users with >=5 turns in 30d, no profile or stale (>24h)
 *   source=memory-extraction — users with conversation turns since last extraction
 */
export async function GET(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const source = request.nextUrl.searchParams.get('source');

  if (source === 'profile-inference') {
    return handleProfileInferenceSource();
  }

  if (source === 'memory-extraction') {
    return handleMemoryExtractionSource();
  }

  if (source === 'chain-memory') {
    return handleChainMemorySource();
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

async function handleProfileInferenceSource() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const oneDayAgo = new Date(Date.now() - 86_400_000);

  const usersWithTurns = await prisma.conversationLog.groupBy({
    by: ['userId'],
    where: {
      role: 'user',
      createdAt: { gte: thirtyDaysAgo },
    },
    _count: { id: true },
    having: {
      id: { _count: { gte: 5 } },
    },
  });

  if (usersWithTurns.length === 0) {
    return NextResponse.json({ users: [] });
  }

  const userIds = usersWithTurns.map((u) => u.userId);

  const existingProfiles = await prisma.userFinancialProfile.findMany({
    where: {
      userId: { in: userIds },
      lastInferredAt: { gte: oneDayAgo },
    },
    select: { userId: true },
  });

  const recentlyInferred = new Set(existingProfiles.map((p) => p.userId));
  const eligibleIds = userIds.filter((id) => !recentlyInferred.has(id));

  const users = eligibleIds.map((userId) => ({
    userId,
    email: '',
    walletAddress: '',
    allowanceId: null,
    timezoneOffset: 0,
    prefs: {},
  }));

  return NextResponse.json({ users });
}

async function handleMemoryExtractionSource() {
  const users = await prisma.user.findMany({
    where: {
      conversationLogs: {
        some: { role: 'user' },
      },
    },
    select: {
      id: true,
      memories: {
        orderBy: { extractedAt: 'desc' },
        take: 1,
        select: { extractedAt: true },
      },
      conversationLogs: {
        where: { role: 'user' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const eligible = users.filter((u) => {
    const lastLog = u.conversationLogs[0]?.createdAt;
    if (!lastLog) return false;
    const lastExtraction = u.memories[0]?.extractedAt;
    return !lastExtraction || lastLog > lastExtraction;
  });

  const result = eligible.map((u) => ({
    userId: u.id,
    email: '',
    walletAddress: '',
    allowanceId: null,
    timezoneOffset: 0,
    prefs: {},
  }));

  return NextResponse.json({ users: result });
}

async function handleChainMemorySource() {
  const oneDayAgo = new Date(Date.now() - 86_400_000);

  // Only include users who have snapshot or session data (proxy for activity).
  // AppEvent is keyed by address (no User FK), so we filter on portfolioSnapshots
  // or conversationLogs. Users with zero data get skipped by the route's 'no_data' guard.
  const users = await prisma.user.findMany({
    where: {
      suiAddress: { not: '' },
      OR: [
        { portfolioSnapshots: { some: {} } },
        { conversationLogs: { some: {} } },
      ],
    },
    select: {
      id: true,
      suiAddress: true,
      memories: {
        where: { source: 'chain' },
        orderBy: { extractedAt: 'desc' },
        take: 1,
        select: { extractedAt: true },
      },
    },
  });

  const eligible = users.filter((u) => {
    const lastChainExtraction = u.memories[0]?.extractedAt;
    return !lastChainExtraction || lastChainExtraction < oneDayAgo;
  });

  const result = eligible.map((u) => ({
    userId: u.id,
    email: '',
    walletAddress: u.suiAddress,
    allowanceId: null,
    timezoneOffset: 0,
    prefs: {},
  }));

  return NextResponse.json({ users: result });
}
