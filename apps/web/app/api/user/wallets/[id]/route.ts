import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
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
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const { id } = await params;
  const address = request.nextUrl.searchParams.get('address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

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
