import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * [SPEC 9 v0.1.3 P9.3 R5] POST /api/goals/dismiss
 * Body: { address: string, goalId: string }
 *
 * Sets a Goal row's status to 'dismissed'. Distinct from 'completed':
 *   - dismissed = "no longer relevant" (user didn't do the thing and
 *     doesn't intend to — e.g. plan changed, irrelevant after a swap).
 *   - completed = "I did it" (use POST /api/goals/complete instead).
 *
 * Per v0.1.3 R5 this is host-only — there is NO `dismiss_goal` engine
 * tool. The LLM never needs to dismiss a goal it didn't itself promote;
 * surfacing such a tool would bloat the system prompt with ~50 tokens
 * of description for a flow only the sidebar UI fires.
 */
export async function POST(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  let body: { address?: string; goalId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { address, goalId } = body;
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  if (!goalId || typeof goalId !== 'string' || goalId.length === 0) {
    return NextResponse.json({ error: 'Invalid goalId' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId: user.id },
    select: { id: true, status: true },
  });
  if (!goal) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  if (goal.status !== 'in_progress') {
    return NextResponse.json(
      { error: `Cannot dismiss goal with status '${goal.status}'` },
      { status: 409 },
    );
  }

  const updated = await prisma.goal.update({
    where: { id: goal.id },
    data: { status: 'dismissed' },
    select: { id: true, status: true, updatedAt: true },
  });

  return NextResponse.json({ goal: updated });
}
