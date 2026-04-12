import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { validateInternalKey } from '@/lib/internal-auth';
import { prisma } from '@/lib/prisma';
import { CronExpressionParser } from 'cron-parser';

export const runtime = 'nodejs';

function authenticateRequest(request: NextRequest): { error: NextResponse } | { valid: true } {
  const internalKey = request.headers.get('x-internal-key');
  if (internalKey) return validateInternalKey(internalKey);

  const jwt = request.headers.get('x-zklogin-jwt');
  return validateJwt(jwt);
}

/**
 * PATCH /api/scheduled-actions/[id]
 * Body: { address, ...fields }
 * Auth: x-zklogin-jwt (client) OR x-internal-key (engine tool)
 * Supports: pause/resume (enabled), edit amount, confirm, skip, delete (soft).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = authenticateRequest(request);
  if ('error' in authResult) return authResult.error;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const address = body.address as string | undefined;
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

  const existing = await prisma.scheduledAction.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Scheduled action not found' }, { status: 404 });
  }

  const update: Record<string, unknown> = {};

  // Pause / resume
  if (typeof body.enabled === 'boolean') {
    update.enabled = body.enabled;
    // Revoking autonomous resets trust ladder
    if (!body.enabled && existing.confirmationsCompleted >= existing.confirmationsRequired) {
      update.confirmationsCompleted = 0;
    }
  }

  // Edit amount (does NOT reset trust ladder)
  if (typeof body.amount === 'number' && body.amount > 0) {
    update.amount = body.amount;
  }

  // Change action type (resets trust ladder)
  const VALID_ACTION_TYPES = ['save', 'swap', 'repay'];
  if (typeof body.actionType === 'string' && body.actionType !== existing.actionType) {
    if (!VALID_ACTION_TYPES.includes(body.actionType)) {
      return NextResponse.json({ error: `Invalid actionType. Must be one of: ${VALID_ACTION_TYPES.join(', ')}` }, { status: 400 });
    }
    update.actionType = body.actionType;
    update.confirmationsCompleted = 0;
  }

  // Confirm execution (increment trust ladder)
  if (body.action === 'confirm') {
    update.confirmationsCompleted = existing.confirmationsCompleted + 1;
    update.totalExecutions = existing.totalExecutions + 1;
    update.totalAmountUsdc = existing.totalAmountUsdc + existing.amount;
    update.lastExecutedAt = new Date();

    try {
      const interval = CronExpressionParser.parse(existing.cronExpr, { tz: 'UTC' });
      update.nextRunAt = interval.next().toDate();
    } catch { /* keep existing */ }
  }

  // Skip execution
  if (body.action === 'skip') {
    update.lastSkippedAt = new Date();
    try {
      const interval = CronExpressionParser.parse(existing.cronExpr, { tz: 'UTC' });
      update.nextRunAt = interval.next().toDate();
    } catch { /* keep existing */ }
  }

  // Delete (soft — disable)
  if (body.action === 'delete') {
    update.enabled = false;
  }

  const action = await prisma.scheduledAction.update({
    where: { id },
    data: update,
  });

  return NextResponse.json({ action });
}
