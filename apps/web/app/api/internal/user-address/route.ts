import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

export const runtime = 'nodejs';

/**
 * GET /api/internal/user-address?userId=...
 * Returns the Sui address for a user ID.
 */
export async function GET(request: NextRequest) {
  const authResult = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in authResult) return authResult.error;

  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { suiAddress: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ address: user.suiAddress });
}
