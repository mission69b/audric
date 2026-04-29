import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// [SIMPLIFICATION DAY 5 — restored post-S.5 audit]
//
// This endpoint exists ONLY as the HTTP bridge between the t2000 server
// (which has its own DB and runs cron jobs on ECS Fargate) and the audric DB
// (which holds users + their addresses). It returns a flat user list so the
// four silent-infra crons can iterate.
//
// What was deleted in S.5 (and stayed deleted):
//  - The eligibility filtering by `notificationPrefs` (table dropped)
//  - The `prefs` map per user (no NotificationPrefs anymore)
//  - The `allowanceId` field per user (column dropped)
//  - The `briefing` / `rate-alert` fan-out branches (cron jobs deleted)
//  - The `pattern-detection` branch (job + ScheduledAction table dropped)
//
// What was deleted in S.31 (2026-04-29):
//  - The `hf-alert` fan-out branch + the `/api/internal/hf-alert` route
//    + the t2000 indexer's hfHook.ts. Stablecoin-only collateral + zkLogin
//    tap-to-confirm makes proactive HF email net-negative UX vs surfacing
//    HF prominently in chat.
//
// What stayed:
//  - Per-source eligibility filtering for `profile-inference`,
//    `memory-extraction`, `chain-memory` (these crons still run and need to
//    know which users to process to avoid wasting LLM credits on every user
//    every hour).
//  - The "no source" default returns ALL users with addresses — used by
//    `portfolioSnapshots` cron which wants to snapshot every user daily.
//
// The shape returned is the minimum each cron job actually consumes:
//   { userId, walletAddress }
// (email/timezone fields are gone — no cron emails users anymore.)

interface CronUser {
  userId: string;
  walletAddress: string;
}

export async function GET(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const source = request.nextUrl.searchParams.get('source');

  switch (source) {
    case 'profile-inference':
      return NextResponse.json({ users: await pickProfileInferenceUsers() });
    case 'memory-extraction':
      return NextResponse.json({ users: await pickMemoryExtractionUsers() });
    case 'chain-memory':
      return NextResponse.json({ users: await pickChainMemoryUsers() });
    default:
      return NextResponse.json({ users: await pickAllUsers() });
  }
}

async function pickAllUsers(): Promise<CronUser[]> {
  const users = await prisma.user.findMany({
    where: { suiAddress: { not: '' } },
    select: { id: true, suiAddress: true },
  });
  return users.map((u) => ({ userId: u.id, walletAddress: u.suiAddress }));
}

// Profile inference is only worth running for users with enough conversation
// history to extract meaningful signal, and skips anyone we already inferred
// in the last 24h.
async function pickProfileInferenceUsers(): Promise<CronUser[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const oneDayAgo = new Date(Date.now() - 86_400_000);

  const usersWithTurns = await prisma.conversationLog.groupBy({
    by: ['userId'],
    where: { role: 'user', createdAt: { gte: thirtyDaysAgo } },
    _count: { id: true },
    having: { id: { _count: { gte: 5 } } },
  });

  if (usersWithTurns.length === 0) return [];

  const userIds = usersWithTurns.map((u) => u.userId);

  const recent = await prisma.userFinancialProfile.findMany({
    where: { userId: { in: userIds }, lastInferredAt: { gte: oneDayAgo } },
    select: { userId: true },
  });
  const recentSet = new Set(recent.map((p) => p.userId));

  const eligibleIds = userIds.filter((id) => !recentSet.has(id));
  if (eligibleIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: eligibleIds } },
    select: { id: true, suiAddress: true },
  });
  return users.map((u) => ({ userId: u.id, walletAddress: u.suiAddress }));
}

// Memory extraction runs only for users with new conversation activity since
// the last extraction.
async function pickMemoryExtractionUsers(): Promise<CronUser[]> {
  const users = await prisma.user.findMany({
    where: { conversationLogs: { some: { role: 'user' } } },
    select: {
      id: true,
      suiAddress: true,
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

  return users
    .filter((u) => {
      const lastLog = u.conversationLogs[0]?.createdAt;
      if (!lastLog) return false;
      const lastExtraction = u.memories[0]?.extractedAt;
      return !lastExtraction || lastLog > lastExtraction;
    })
    .map((u) => ({ userId: u.id, walletAddress: u.suiAddress }));
}

// Chain memory runs once a day per user with any activity (snapshot or chat).
async function pickChainMemoryUsers(): Promise<CronUser[]> {
  const oneDayAgo = new Date(Date.now() - 86_400_000);

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

  return users
    .filter((u) => {
      const last = u.memories[0]?.extractedAt;
      return !last || last < oneDayAgo;
    })
    .map((u) => ({ userId: u.id, walletAddress: u.suiAddress }));
}
