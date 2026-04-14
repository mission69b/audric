import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateWalletReport } from '@/lib/report/generator';
import type { WalletReportData } from '@/lib/report/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let ratelimit: Ratelimit | null = null;
function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;
  try {
    ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(5, '1 h'),
      prefix: 'ratelimit:report',
    });
    return ratelimit;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;

  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid Sui address' }, { status: 400 });
  }

  const rl = getRatelimit();
  if (rl) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const { success } = await rl.limit(ip);
    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429 },
      );
    }
  }

  try {
    const cached = await prisma.publicReport.findFirst({
      where: {
        suiAddress: address,
        expiresAt: { gt: new Date() },
      },
      orderBy: { generatedAt: 'desc' },
    });

    if (cached) {
      await prisma.publicReport.update({
        where: { id: cached.id },
        data: { viewCount: { increment: 1 } },
      });
      return NextResponse.json(cached.reportData as unknown as WalletReportData);
    }

    const report = await generateWalletReport(address);

    await prisma.publicReport.create({
      data: {
        suiAddress: address,
        reportData: JSON.parse(JSON.stringify(report)),
        expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      },
    });

    return NextResponse.json(report);
  } catch (err) {
    console.error('[report] Generation failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 502 },
    );
  }
}
