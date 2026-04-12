import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * DELETE /api/user/memories/[id]?address=0x... — soft-delete a single memory.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const address = request.nextUrl.searchParams.get('address');

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

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
