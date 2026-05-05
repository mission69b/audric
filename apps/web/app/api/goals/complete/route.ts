import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * [SPEC 9 v0.1.3 P9.3 R5] POST /api/goals/complete
 * Body: { address: string, goalId: string }
 *
 * Sets a Goal row's status to 'completed' and stamps `completedAt`.
 * Distinct from 'dismissed': the user actually did the thing.
 *
 * Per v0.1.3 R5 this is host-only — there is NO `complete_goal` engine
 * tool. The LLM observes completion via the `<financial_context>` block
 * (which omits completed goals from `<open_goals>` since the query filters
 * `status: 'in_progress'`); when the agent reasons that a goal was
 * achieved (HF stabilised, target balance hit) it can suggest the user
 * tap the sidebar's complete button — but doesn't auto-complete.
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
      { error: `Cannot complete goal with status '${goal.status}'` },
      { status: 409 },
    );
  }

  const updated = await prisma.goal.update({
    where: { id: goal.id },
    data: { status: 'completed', completedAt: new Date() },
    select: { id: true, status: true, updatedAt: true, completedAt: true },
  });

  return NextResponse.json({ goal: updated });
}
