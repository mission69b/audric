import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const MAX_WATCH_ADDRESSES = 10;

async function resolveUserId(request: NextRequest): Promise<string | null> {
  const address = request.headers.get('x-sui-address');
  if (!address) return null;
  const user = await prisma.user.findUnique({ where: { suiAddress: address }, select: { id: true } });
  return user?.id ?? null;
}

/**
 * GET /api/user/watch-addresses
 * Returns all watched addresses for the authenticated user.
 */
export async function GET(request: NextRequest) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const addresses = await prisma.watchAddress.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ addresses });
}

/**
 * POST /api/user/watch-addresses
 * Body: { address, label? }
 * Adds a Sui address to the watch list.
 */
export async function POST(request: NextRequest) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { address, label } = body as { address?: string; label?: string };

  if (!address || !address.startsWith('0x') || address.length < 40) {
    return NextResponse.json({ error: 'Invalid Sui address' }, { status: 400 });
  }

  const count = await prisma.watchAddress.count({ where: { userId } });
  if (count >= MAX_WATCH_ADDRESSES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_WATCH_ADDRESSES} watched addresses` },
      { status: 400 },
    );
  }

  const existing = await prisma.watchAddress.findUnique({
    where: { userId_address: { userId, address } },
  });
  if (existing) {
    return NextResponse.json({ error: 'Address already watched' }, { status: 409 });
  }

  const entry = await prisma.watchAddress.create({
    data: { userId, address, label: label || null },
  });

  return NextResponse.json({ entry }, { status: 201 });
}

/**
 * DELETE /api/user/watch-addresses
 * Body: { address }
 * Removes an address from the watch list.
 */
export async function DELETE(request: NextRequest) {
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { address } = body as { address?: string };

  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 });
  }

  await prisma.watchAddress.deleteMany({
    where: { userId, address },
  });

  return NextResponse.json({ ok: true });
}
