import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * [SPEC 9 v0.1.3 P9.3] GET /api/goals/list?address=0x...&status=in_progress|completed|dismissed
 *
 * Returns the user's persistent cross-session goals (the LLM-promoted
 * `update_todo {persist: true}` items, distinct from `SavingsGoal`).
 * Default `status=in_progress` for the `<OpenGoalsSidebar />` hydration.
 *
 * Mutation surface (per v0.1.3 R5) is split across siblings:
 *   - POST /api/goals/dismiss  → status='dismissed' (no longer relevant)
 *   - POST /api/goals/complete → status='completed' (user did it)
 *
 * There is intentionally NO `dismiss_goal` engine tool — sidebar
 * dismissal is a host-only concern; engine reads goals via the
 * `<financial_context>` block read-only.
 */
export async function GET(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.nextUrl.searchParams.get('address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const statusParam = request.nextUrl.searchParams.get('status');
  const status =
    statusParam === 'completed' || statusParam === 'dismissed'
      ? statusParam
      : 'in_progress';

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const goals = await prisma.goal.findMany({
    where: { userId: user.id, status },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      content: true,
      status: true,
      sourceSessionId: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
    },
  });

  return NextResponse.json({ goals });
}
