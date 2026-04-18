import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * GET /api/user/goals?address=0x...
 * Returns active savings goals for the user.
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
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const goals = await prisma.savingsGoal.findMany({
    where: { userId: user.id, status: { in: ['active', 'completed'] } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      emoji: true,
      targetAmount: true,
      deadline: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ goals });
}

/**
 * POST /api/user/goals
 * Body: { address, name, emoji?, targetAmount, deadline? }
 */
export async function POST(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  let body: {
    address?: string;
    name?: string;
    emoji?: string;
    targetAmount?: number;
    deadline?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { address, name, emoji, targetAmount, deadline } = body;
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  if (!name || typeof name !== 'string' || name.length > 100) {
    return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  }
  if (!targetAmount || typeof targetAmount !== 'number' || targetAmount < 0.01 || targetAmount > 1_000_000) {
    return NextResponse.json({ error: 'Invalid targetAmount' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const activeCount = await prisma.savingsGoal.count({
    where: { userId: user.id, status: 'active' },
  });
  if (activeCount >= 10) {
    return NextResponse.json({ error: 'Maximum 10 active goals' }, { status: 400 });
  }

  const goal = await prisma.savingsGoal.create({
    data: {
      userId: user.id,
      name: name.trim(),
      emoji: emoji?.trim() || '🎯',
      targetAmount,
      deadline: deadline ? new Date(deadline) : undefined,
    },
    select: {
      id: true,
      name: true,
      emoji: true,
      targetAmount: true,
      deadline: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ goal }, { status: 201 });
}
