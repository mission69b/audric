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

const VALID_PERMISSIONS = new Set(['savings', 'send', 'pay', 'credit', 'swap', 'stake']);

async function buildAllowanceResponse(address: string) {
  const prefs = await prisma.userPreferences.findUnique({
    where: { address },
    select: { limits: true },
  }).catch(() => null);

  const limits = (prefs?.limits as LimitsConfig | null)?.agent;

  if (!limits?.enabled) {
    return { enabled: false, dailyLimit: 0, spent: 0, remaining: 0, permissions: [], resetsAt: null };
  }

  const dailyLimitUsdc = limits.dailyLimitUsdc ?? 50;
  const permissions = limits.permissions ?? ['savings', 'send', 'pay', 'credit', 'swap', 'stake'];

  const since = new Date(Date.now() - 86_400_000);
  const TX_TYPES = new Set(['send', 'deposit', 'withdraw', 'borrow', 'repay', 'swap', 'pay']);
  const events = await prisma.appEvent.findMany({
    where: { address, type: { in: [...TX_TYPES] }, createdAt: { gte: since } },
    select: { details: true },
  }).catch(() => [] as { details: unknown }[]);

  const spent = events.reduce((sum, e) => {
    const d = e.details as { amountUsdc?: number } | null;
    return sum + (d?.amountUsdc ?? 0);
  }, 0);

  const remaining = Math.max(0, dailyLimitUsdc - spent);
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);

  return { enabled: true, dailyLimit: dailyLimitUsdc, spent, remaining, permissions, resetsAt: tomorrow.toISOString() };
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

  return NextResponse.json(await buildAllowanceResponse(address));
}

/**
 * PATCH /api/allowance/[address]
 * Called by toggle_allowance, update_daily_limit, update_permissions engine tools.
 * Auth: x-internal-key + x-sui-address must match address param.
 *
 * Body (one of):
 *   { action: 'toggle', enabled: boolean }
 *   { action: 'setLimit', dailyLimitUsdc: number }
 *   { action: 'setPermissions', permissions: string[] }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const { address } = await params;
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const callerAddress = request.headers.get('x-sui-address');
  if (!callerAddress || callerAddress.toLowerCase() !== address.toLowerCase()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== 'string') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const prefs = await prisma.userPreferences.findUnique({
    where: { address },
    select: { limits: true },
  }).catch(() => null);

  const existing = ((prefs?.limits as LimitsConfig | null)?.agent) ?? {};

  let patch: LimitsConfig['agent'];

  if (body.action === 'toggle') {
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: '`enabled` must be boolean' }, { status: 400 });
    }
    patch = { ...existing, enabled: body.enabled };

  } else if (body.action === 'setLimit') {
    const limit = Number(body.dailyLimitUsdc);
    if (!isFinite(limit) || limit < 0 || limit > 10_000) {
      return NextResponse.json({ error: '`dailyLimitUsdc` must be 0–10000' }, { status: 400 });
    }
    patch = { ...existing, enabled: true, dailyLimitUsdc: limit };

  } else if (body.action === 'setPermissions') {
    if (!Array.isArray(body.permissions)) {
      return NextResponse.json({ error: '`permissions` must be an array' }, { status: 400 });
    }
    const permissions = (body.permissions as unknown[])
      .map(String)
      .filter((p) => VALID_PERMISSIONS.has(p));
    patch = { ...existing, permissions };

  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  // Merge agent config into existing limits (don't wipe other keys)
  const existingRow = await prisma.userPreferences.findUnique({
    where: { address },
    select: { limits: true },
  });
  const prevLimits = (existingRow?.limits && typeof existingRow.limits === 'object' && !Array.isArray(existingRow.limits))
    ? existingRow.limits as Record<string, unknown>
    : {};
  const mergedLimits = { ...prevLimits, agent: patch };

  await prisma.userPreferences.upsert({
    where: { address },
    update: { limits: mergedLimits },
    create: { address, limits: mergedLimits },
  });

  return NextResponse.json(await buildAllowanceResponse(address));
}
