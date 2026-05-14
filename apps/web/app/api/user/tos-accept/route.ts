import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, assertOwns, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * POST /api/user/tos-accept
 * Body: { address }
 * Stamps tosAcceptedAt on the user record (idempotent).
 */
export async function POST(request: NextRequest) {
  // [SPEC 30 Phase 1A.3] Verify JWT signature AND bind body.address.
  // Pre-Phase-1A any verified-JWT holder could stamp tosAcceptedAt on
  // any user account. Idempotent + low impact, but the IDOR class fix
  // applies uniformly across every JWT-bearing route.
  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;

  let body: { address?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { address } = body;
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const ownership = assertOwns(auth.verified, address);
  if (ownership) return ownership;

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true, tosAcceptedAt: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (!user.tosAcceptedAt) {
    await prisma.user.update({
      where: { id: user.id },
      data: { tosAcceptedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
