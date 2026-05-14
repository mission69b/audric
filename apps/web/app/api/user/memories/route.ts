import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest, assertOwns } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/user/memories?address=0x... — list active memories.
 *
 * Auth: zkLogin JWT (header `x-zklogin-jwt`) + `assertOwns(?address)`.
 * SPEC 30 Phase 1A.6 closed the prior wide-open posture — pre-fix any
 * caller could read any user's silent-profile memories (private
 * inferred financial / behavioural data) by URL substitution.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;

  const address = request.nextUrl.searchParams.get('address');

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

  const ownership = assertOwns(auth.verified, address);
  if (ownership) return ownership;

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ memories: [] });
  }

  const memories = await prisma.userMemory.findMany({
    where: {
      userId: user.id,
      active: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: { extractedAt: 'desc' },
    select: {
      id: true,
      memoryType: true,
      content: true,
      confidence: true,
      extractedAt: true,
      expiresAt: true,
    },
  });

  return NextResponse.json({ memories });
}

/**
 * DELETE /api/user/memories?address=0x... — clear all active memories.
 *
 * Auth: zkLogin JWT + `assertOwns`. Pre-fix any caller could wipe any
 * user's silent profile via URL substitution (DoS-class destructive
 * action). SPEC 30 Phase 1A.6 binds the JWT identity to the target
 * address so only the owner can clear their own memories.
 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;

  const address = request.nextUrl.searchParams.get('address');

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

  const ownership = assertOwns(auth.verified, address);
  if (ownership) return ownership;

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ cleared: 0 });
  }

  const result = await prisma.userMemory.updateMany({
    where: {
      userId: user.id,
      active: true,
    },
    data: { active: false },
  });

  return NextResponse.json({ cleared: result.count });
}
