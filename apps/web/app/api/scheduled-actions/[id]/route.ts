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
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult;
  return { valid: true };
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

  if (body.action === 'confirm') {
    const newConfirmations = existing.confirmationsCompleted + 1;
    update.confirmationsCompleted = newConfirmations;
    update.totalExecutions = existing.totalExecutions + 1;
    update.totalAmountUsdc = existing.totalAmountUsdc + existing.amount;
    update.lastExecutedAt = new Date();

    if (existing.source === 'behavior_detected' && existing.stage === 2
        && newConfirmations >= existing.confirmationsRequired) {
      update.stage = 3;
    }

    try {
      const interval = CronExpressionParser.parse(existing.cronExpr, { tz: 'UTC' });
      update.nextRunAt = interval.next().toDate();
    } catch { /* keep existing */ }
  } else if (body.action === 'skip') {
    update.lastSkippedAt = new Date();
    try {
      const interval = CronExpressionParser.parse(existing.cronExpr, { tz: 'UTC' });
      update.nextRunAt = interval.next().toDate();
    } catch { /* keep existing */ }
  } else if (body.action === 'delete') {
    update.enabled = false;
  } else if (body.action === 'accept_proposal') {
    if (existing.source !== 'behavior_detected') {
      return NextResponse.json({ error: 'Only behavior-detected actions can be accepted' }, { status: 400 });
    }
    update.stage = 2;
    update.enabled = true;
    update.declinedAt = null;
    update.confirmationsCompleted = 0;
    update.confirmationsRequired = 3;
    try {
      const interval = CronExpressionParser.parse(existing.cronExpr, { tz: 'UTC' });
      update.nextRunAt = interval.next().toDate();
    } catch { /* keep existing */ }
  } else if (body.action === 'decline_proposal') {
    if (existing.source !== 'behavior_detected') {
      return NextResponse.json({ error: 'Only behavior-detected actions can be declined' }, { status: 400 });
    }
    update.declinedAt = new Date();
    update.enabled = false;
  } else if (body.action === 'pause_pattern') {
    update.pausedAt = new Date();
    update.enabled = false;
  } else if (body.action === 'resume_pattern') {
    update.pausedAt = null;
    update.enabled = true;
    try {
      const interval = CronExpressionParser.parse(existing.cronExpr, { tz: 'UTC' });
      update.nextRunAt = interval.next().toDate();
    } catch { /* keep existing */ }
  }

  const action = await prisma.scheduledAction.update({
    where: { id },
    data: update,
  });

  return NextResponse.json({ action });
}
