import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { validateInternalKey } from '@/lib/internal-auth';
import { prisma } from '@/lib/prisma';
import { CronExpressionParser } from 'cron-parser';

export const runtime = 'nodejs';

const VALID_ACTION_TYPES = ['save', 'swap', 'repay'] as const;

function authenticateRequest(request: NextRequest): { error: NextResponse } | { valid: true } {
  const internalKey = request.headers.get('x-internal-key');
  if (internalKey) return validateInternalKey(internalKey);

  const jwt = request.headers.get('x-zklogin-jwt');
  return validateJwt(jwt);
}

/**
 * GET /api/scheduled-actions?address=0x...
 * Auth: x-zklogin-jwt (client) OR x-internal-key (engine tool)
 */
export async function GET(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if ('error' in authResult) return authResult.error;

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

  const actions = await prisma.scheduledAction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ actions });
}

/**
 * POST /api/scheduled-actions
 * Body: { address, actionType, amount, asset?, targetAsset?, cronExpr }
 * Auth: x-zklogin-jwt (client) OR x-internal-key (engine tool)
 */
export async function POST(request: NextRequest) {
  const authResult = authenticateRequest(request);
  if ('error' in authResult) return authResult.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { address, actionType, amount, asset, targetAsset, cronExpr } = body as {
    address?: string;
    actionType?: string;
    amount?: number;
    asset?: string;
    targetAsset?: string;
    cronExpr?: string;
  };

  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  if (!actionType || !VALID_ACTION_TYPES.includes(actionType as typeof VALID_ACTION_TYPES[number])) {
    return NextResponse.json({ error: `Invalid actionType. Must be one of: ${VALID_ACTION_TYPES.join(', ')}` }, { status: 400 });
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  if (!cronExpr || typeof cronExpr !== 'string') {
    return NextResponse.json({ error: 'cronExpr is required' }, { status: 400 });
  }

  let nextRunAt: Date;
  try {
    const interval = CronExpressionParser.parse(cronExpr, { tz: 'UTC' });
    nextRunAt = interval.next().toDate();
  } catch {
    return NextResponse.json({ error: 'Invalid cron expression' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const action = await prisma.scheduledAction.create({
    data: {
      userId: user.id,
      actionType,
      amount,
      asset: (asset as string) ?? 'USDC',
      targetAsset: (targetAsset as string) ?? null,
      cronExpr,
      nextRunAt,
    },
  });

  return NextResponse.json({ action }, { status: 201 });
}
