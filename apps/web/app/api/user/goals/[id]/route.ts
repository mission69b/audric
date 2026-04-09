import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * PATCH /api/user/goals/[id]
 * Body: { address, name?, emoji?, targetAmount?, deadline? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const { id } = await params;

  let body: {
    address?: string;
    name?: string;
    emoji?: string;
    targetAmount?: number;
    deadline?: string | null;
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

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const goal = await prisma.savingsGoal.findFirst({
    where: { id, userId: user.id },
  });
  if (!goal) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = String(name).trim().slice(0, 100);
  if (emoji !== undefined) data.emoji = String(emoji).trim() || '🎯';
  if (targetAmount !== undefined && typeof targetAmount === 'number' && targetAmount >= 0.01) {
    data.targetAmount = targetAmount;
  }
  if (deadline !== undefined) {
    data.deadline = deadline ? new Date(deadline) : null;
  }

  const updated = await prisma.savingsGoal.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      emoji: true,
      targetAmount: true,
      deadline: true,
      currentMilestone: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ goal: updated });
}

/**
 * DELETE /api/user/goals/[id]
 * Body: { address }
 * Soft-deletes by setting status = "archived".
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const { id } = await params;

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

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const goal = await prisma.savingsGoal.findFirst({
    where: { id, userId: user.id },
  });
  if (!goal) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  await prisma.savingsGoal.update({
    where: { id },
    data: { status: 'archived' },
  });

  return NextResponse.json({ ok: true });
}
