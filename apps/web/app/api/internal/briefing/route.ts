import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';

/**
 * GET /api/internal/briefing?walletAddress=0x...&date=2026-04-09
 * Check if a briefing already exists for this user+date (idempotency guard).
 */
export async function GET(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const walletAddress = request.nextUrl.searchParams.get('walletAddress');
  const date = request.nextUrl.searchParams.get('date');

  if (!walletAddress || !date) {
    return NextResponse.json({ error: 'Missing walletAddress or date' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: walletAddress },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ exists: false });
  }

  const existing = await prisma.dailyBriefing.findUnique({
    where: { userId_date: { userId: user.id, date } },
    select: { id: true },
  });

  return NextResponse.json({ exists: !!existing });
}

/**
 * POST /api/internal/briefing
 * Called by the t2000 ECS cron to store a generated briefing.
 * Body: { walletAddress, date, content, emailSentAt?, chargeDigest? }
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  let body: {
    walletAddress?: string;
    date?: string;
    content?: unknown;
    emailSentAt?: string;
    chargeDigest?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { walletAddress, date, content, emailSentAt, chargeDigest } = body;

  if (!walletAddress || !date || !content) {
    return NextResponse.json({ error: 'Missing walletAddress, date, or content' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: walletAddress },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await prisma.dailyBriefing.upsert({
    where: { userId_date: { userId: user.id, date } },
    create: {
      userId: user.id,
      date,
      content: content as object,
      emailSentAt: emailSentAt ? new Date(emailSentAt) : null,
      chargeDigest: chargeDigest ?? null,
    },
    update: {
      content: content as object,
      emailSentAt: emailSentAt ? new Date(emailSentAt) : undefined,
      chargeDigest: chargeDigest ?? undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
