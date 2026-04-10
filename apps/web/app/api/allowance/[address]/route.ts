import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';
import { isValidSuiAddress } from '@mysten/sui/utils';

export const runtime = 'nodejs';

interface LimitsConfig {
  agent?: {
    enabled?: boolean;
    dailyLimitUsdc?: number;
    permissions?: string[];
  };
}

/**
 * GET /api/allowance/[address]
 * Called by the engine's allowance_status tool.
 * Auth: x-internal-key
 *
 * Returns the agent spending allowance for a wallet address.
 * Reads from UserPreferences.limits and calculates daily spend
 * from AppEvent records in the last 24 hours.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const { address } = await params;
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const prefs = await prisma.userPreferences.findUnique({
    where: { address },
    select: { limits: true },
  }).catch(() => null);

  const limits = (prefs?.limits as LimitsConfig | null)?.agent;

  if (!limits?.enabled) {
    return NextResponse.json({
      enabled: false,
      dailyLimit: 0,
      spent: 0,
      remaining: 0,
      permissions: [],
      resetsAt: null,
    });
  }

  const dailyLimitUsdc = limits.dailyLimitUsdc ?? 50;
  const permissions = limits.permissions ?? ['savings', 'send', 'pay'];

  // Calculate daily spend from AppEvent records in the last 24 hours.
  // AppEvent.details is { amountUsdc?: number } for tracked tx types.
  const since = new Date(Date.now() - 86_400_000);
  const TX_TYPES = new Set(['send', 'deposit', 'withdraw', 'borrow', 'repay', 'swap', 'pay']);

  const events = await prisma.appEvent.findMany({
    where: {
      address,
      type: { in: [...TX_TYPES] },
      createdAt: { gte: since },
    },
    select: { details: true },
  }).catch(() => [] as { details: unknown }[]);

  const spent = events.reduce((sum, e) => {
    const d = e.details as { amountUsdc?: number } | null;
    return sum + (d?.amountUsdc ?? 0);
  }, 0);

  const remaining = Math.max(0, dailyLimitUsdc - spent);

  // Resets at the same time tomorrow (rolling 24-hour window reset at midnight UTC)
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);

  return NextResponse.json({
    enabled: true,
    dailyLimit: dailyLimitUsdc,
    spent,
    remaining,
    permissions,
    resetsAt: tomorrow.toISOString(),
  });
}
