import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest, assertOwns } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * DELETE /api/user/memories/[id]?address=0x... — soft-delete a single memory.
 *
 * Auth: zkLogin JWT (header `x-zklogin-jwt`) + `assertOwns(?address)`.
 * SPEC 30 Phase 1A.6 closed the prior wide-open posture (per-memory
 * destructive action gated only by URL params).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;

  const address = request.nextUrl.searchParams.get('address');

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

  const ownership = assertOwns(auth.verified, address);
  if (ownership) return ownership;

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const memory = await prisma.userMemory.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!memory || memory.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.userMemory.update({
    where: { id },
    data: { active: false },
  });

  return NextResponse.json({ deleted: true });
}
