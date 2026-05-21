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

  // [v0.7d Phase 6 Block A — 2026-05-21 / S.221] `profile-inference`,
  // `memory-extraction`, `chain-memory` source paths removed. Their
  // crons (in t2000/apps/server) + their downstream routes (in this
  // same `app/api/internal/*` tree) were deleted in the same change.
  // The remaining caller is `portfolioSnapshots` (Block B Vercel
  // migration target) which always uses the default branch.
  return NextResponse.json({ users: await pickAllUsers() });
}

async function pickAllUsers(): Promise<CronUser[]> {
  const users = await prisma.user.findMany({
    where: { suiAddress: { not: '' } },
    select: { id: true, suiAddress: true },
  });
  return users.map((u) => ({ userId: u.id, walletAddress: u.suiAddress }));
}
