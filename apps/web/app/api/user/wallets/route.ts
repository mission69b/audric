import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const MAX_LINKED_WALLETS = 10;

/**
 * GET /api/user/wallets
 * Header: x-zklogin-jwt
 * Query: address (primary Sui address)
 */
export async function GET(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.nextUrl.searchParams.get('address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: {
      id: true,
      suiAddress: true,
      linkedWallets: {
        orderBy: { addedAt: 'asc' },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    primary: user.suiAddress,
    wallets: user.linkedWallets,
  });
}

/**
 * POST /api/user/wallets
 * Header: x-zklogin-jwt
 * Body: { address (primary), suiAddress (to link), label? }
 */
export async function POST(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { address, suiAddress, label } = body as {
    address?: string;
    suiAddress?: string;
    label?: string;
  };

  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid primary address' }, { status: 400 });
  }

  if (!suiAddress || !isValidSuiAddress(suiAddress)) {
    return NextResponse.json({ error: 'Invalid wallet address to link' }, { status: 400 });
  }

  if (address === suiAddress) {
    return NextResponse.json({ error: 'Cannot link your primary wallet' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true, _count: { select: { linkedWallets: true } } },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (user._count.linkedWallets >= MAX_LINKED_WALLETS) {
    return NextResponse.json({ error: `Maximum ${MAX_LINKED_WALLETS} linked wallets` }, { status: 400 });
  }

  try {
    const wallet = await prisma.linkedWallet.create({
      data: {
        userId: user.id,
        suiAddress,
        label: typeof label === 'string' ? label.slice(0, 50) : null,
      },
    });
    return NextResponse.json({ wallet }, { status: 201 });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      return NextResponse.json({ error: 'Wallet already linked' }, { status: 409 });
    }
    throw err;
  }
}
