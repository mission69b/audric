import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/lib/generated/prisma/client';
import { PERMISSION_PRESETS, type UserPermissionConfig } from '@t2000/engine';

/**
 * GET /api/user/preferences?address=0x...
 *
 * Returns user preferences for the given Sui address.
 *
 * [SIMPLIFICATION DAY 5] `allowanceId` and `dcaSchedules` were dropped from
 * UserPreferences along with the on-chain allowance billing flow and the
 * never-shipped DCA scheduler. The remaining surface is `contacts`, `limits`
 * (which still hosts the financial profile + permission preset + agent
 * config — see `lib/engine/engine-context.ts`), and the inferred
 * `permissionPreset` for client-side display.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

  // Register address with indexer so on-chain transactions get tracked in stats.
  // Fire-and-forget — table may not exist if DB hasn't been shared yet.
  prisma.$executeRaw`
    INSERT INTO "Agent" (address, created_at)
    VALUES (${address}, NOW())
    ON CONFLICT (address) DO NOTHING
  `.catch(() => {});

  const prefs = await prisma.userPreferences.findUnique({
    where: { address },
  });

  if (!prefs) {
    return NextResponse.json({ contacts: [], limits: null, permissionPreset: 'balanced' });
  }

  const limitsObj = (prefs.limits && typeof prefs.limits === 'object' && !Array.isArray(prefs.limits))
    ? prefs.limits as Record<string, unknown>
    : null;
  const permissionPreset = limitsObj?.permissionPreset ?? 'balanced';

  return NextResponse.json({
    contacts: prefs.contacts,
    limits: prefs.limits,
    permissionPreset,
  });
}

/**
 * POST /api/user/preferences
 *
 * Upserts user preferences for a Sui address.
 * Body: { address: string, contacts?: Contact[], limits?: object, permissionPreset?: ... }
 *
 * IMPORTANT: `limits` is shallow-merged with existing limits so callers can
 * update individual keys (financialProfile, permission preset, agent config)
 * without wiping others.
 */
export async function POST(request: NextRequest) {
  let body: {
    address?: string;
    contacts?: unknown;
    limits?: unknown;
    permissionPreset?: 'conservative' | 'balanced' | 'aggressive';
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { address, contacts, permissionPreset } = body;
  let { limits } = body;

  if (permissionPreset && permissionPreset in PERMISSION_PRESETS) {
    const config: UserPermissionConfig = PERMISSION_PRESETS[permissionPreset];
    limits = { ...(typeof limits === 'object' && limits ? limits as Record<string, unknown> : {}), ...config, permissionPreset };
  }

  if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

  // Merge incoming limits with existing so callers don't accidentally wipe keys.
  let mergedLimits: Prisma.InputJsonValue | undefined;
  if (limits !== undefined) {
    const existing = await prisma.userPreferences.findUnique({
      where: { address },
      select: { limits: true },
    });
    const prev = (existing?.limits && typeof existing.limits === 'object' && !Array.isArray(existing.limits))
      ? existing.limits as Record<string, unknown>
      : {};
    mergedLimits = { ...prev, ...(limits as Record<string, unknown>) } as Prisma.InputJsonValue;
  }

  const update: Prisma.UserPreferencesUpdateInput = {};
  if (contacts !== undefined) update.contacts = contacts as Prisma.InputJsonValue;
  if (mergedLimits !== undefined) update.limits = mergedLimits;

  const prefs = await prisma.userPreferences.upsert({
    where: { address },
    create: {
      address,
      contacts: (contacts ?? []) as Prisma.InputJsonValue,
      limits: (mergedLimits ?? limits) as Prisma.InputJsonValue | undefined,
    },
    update,
  });

  return NextResponse.json({
    contacts: prefs.contacts,
    limits: prefs.limits,
  });
}
