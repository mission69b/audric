import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * GET /api/user/memories?address=0x... — list active memories.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

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
 */
export async function DELETE(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

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
