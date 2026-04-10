import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/lib/generated/prisma/client';

const VALID_STYLES = ['conservative', 'balanced', 'growth'] as const;
type FinancialStyle = (typeof VALID_STYLES)[number];

/**
 * POST /api/user/financial-profile
 *
 * Stores the user's self-reported financial profile into
 * UserPreferences.limits.financialProfile — merging with existing limits
 * so other keys (allowanceId, agentBudget, etc.) are preserved.
 *
 * Body: { address: string; style?: FinancialStyle; notes?: string }
 */
export async function POST(request: NextRequest) {
  let body: { address?: string; style?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { address, style, notes } = body;

  if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

  if (style && !VALID_STYLES.includes(style as FinancialStyle)) {
    return NextResponse.json(
      { error: `Invalid style. Must be one of: ${VALID_STYLES.join(', ')}` },
      { status: 400 },
    );
  }

  // Read existing limits so we merge rather than overwrite
  const existing = await prisma.userPreferences.findUnique({
    where: { address },
    select: { limits: true },
  });

  const existingLimits = (existing?.limits ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = {
    ...existingLimits,
    financialProfile: {
      style: style ?? null,
      notes: notes ?? '',
    },
  };

  await prisma.userPreferences.upsert({
    where: { address },
    create: {
      address,
      contacts: [],
      limits: merged as Prisma.InputJsonValue,
      dcaSchedules: [],
    },
    update: {
      limits: merged as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ ok: true });
}
