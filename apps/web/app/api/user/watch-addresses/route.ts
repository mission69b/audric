import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

export const runtime = 'nodejs';

const MAX_WATCH_ADDRESSES = 10;

/**
 * Resolve the verified caller's `User.id` from their zkLogin JWT.
 *
 * SPEC 30 Phase 1A.6 (2026-05-14): pre-fix this helper trusted the
 * `x-sui-address` request header — the EXACT class of forgeable input
 * the original SPEC 30 reporter PoC demonstrated swapping via Burp.
 * The helper now requires a verified JWT (signature + JWKS + Enoki-
 * derived address) and uses ONLY that derived address to look up the
 * User row. Returns the response object on auth failure so callers
 * short-circuit cleanly.
 */
async function resolveCallerUserId(
  request: NextRequest,
): Promise<{ userId: string } | { error: NextResponse }> {
  const auth = await authenticateRequest(request);
  if ('error' in auth) return { error: auth.error };

  const user = await prisma.user.findUnique({
    where: { suiAddress: auth.verified.suiAddress },
    select: { id: true },
  });

  if (!user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { userId: user.id };
}

/**
 * GET /api/user/watch-addresses
 * Returns all watched addresses for the authenticated user.
 */
export async function GET(request: NextRequest) {
  const result = await resolveCallerUserId(request);
  if ('error' in result) return result.error;

  const addresses = await prisma.watchAddress.findMany({
    where: { userId: result.userId },
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
  const result = await resolveCallerUserId(request);
  if ('error' in result) return result.error;

  const body = await request.json();
  const { address, label } = body as { address?: string; label?: string };

  if (!address || !address.startsWith('0x') || address.length < 40) {
    return NextResponse.json({ error: 'Invalid Sui address' }, { status: 400 });
  }

  const count = await prisma.watchAddress.count({ where: { userId: result.userId } });
  if (count >= MAX_WATCH_ADDRESSES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_WATCH_ADDRESSES} watched addresses` },
      { status: 400 },
    );
  }

  const existing = await prisma.watchAddress.findUnique({
    where: { userId_address: { userId: result.userId, address } },
  });
  if (existing) {
    return NextResponse.json({ error: 'Address already watched' }, { status: 409 });
  }

  const entry = await prisma.watchAddress.create({
    data: { userId: result.userId, address, label: label || null },
  });

  return NextResponse.json({ entry }, { status: 201 });
}

/**
 * DELETE /api/user/watch-addresses
 * Body: { address }
 * Removes an address from the watch list.
 */
export async function DELETE(request: NextRequest) {
  const result = await resolveCallerUserId(request);
  if ('error' in result) return result.error;

  const body = await request.json();
  const { address } = body as { address?: string };

  if (!address) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 });
  }

  await prisma.watchAddress.deleteMany({
    where: { userId: result.userId, address },
  });

  return NextResponse.json({ ok: true });
}
