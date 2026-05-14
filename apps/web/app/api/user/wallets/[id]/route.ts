import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  assertOwns,
  isValidSuiAddress,
} from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * DELETE /api/user/wallets/[id]
 * Header: x-zklogin-jwt
 * Query: address (primary Sui address for ownership verification)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // [SPEC 30 Phase 1A.3] Bind JWT identity to ?address before mutating.
  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const address = request.nextUrl.searchParams.get('address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const ownership = assertOwns(auth.verified, address);
  if (ownership) return ownership;

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const wallet = await prisma.linkedWallet.findFirst({
    where: { id, userId: user.id },
  });

  if (!wallet) {
    return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
  }

  await prisma.linkedWallet.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
