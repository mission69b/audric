/**
 * [SPEC 30 D-12 — 2026-05-14] UserMemory expiry pruning.
 *
 * Runs daily at 03:45 UTC via `vercel.json` cron. Deletes
 * `UserMemory` rows where `expiresAt < now()`.
 *
 * Companion to the write-side enforcement in
 * `app/api/internal/memory-extraction/route.ts` and
 * `app/api/internal/chain-memory/route.ts`: every NEW memory row
 * gets a 365d default `expiresAt` unless the extracted confidence
 * exceeds 0.9 (high-conviction extracted facts get explicit no-expiry,
 * per D-12 lock). This cron is what turns those `expiresAt`
 * timestamps into actual deletions instead of just inert metadata.
 *
 * Note: `memory-extraction` and `chain-memory` already mark
 * `active=false` for expired rows when they themselves run (see
 * `prisma.userMemory.updateMany({ where: { expiresAt: { lte: now } } })`
 * in both files). This cron HARD-DELETES those rows after the active
 * flip — the pre-existing `updateMany` is a soft-delete that still
 * occupies disk + index pages. Deleting the rows reclaims storage
 * and keeps NeonDB row counts bounded.
 *
 * Authenticated with the standard `CRON_SECRET` bearer header so only
 * Vercel's cron infrastructure can invoke it. Returns count for log
 * visibility; failures bubble as 500 so cron retries kick in.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const deleted = await prisma.userMemory.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  console.log(`[UserMemoryRetention] Deleted ${deleted.count} expired memories`);
  return NextResponse.json({ deleted: deleted.count });
}
