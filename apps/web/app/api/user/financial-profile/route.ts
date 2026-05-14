import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/lib/generated/prisma/client';
import { authenticateRequest, assertOwns } from '@/lib/auth';

const VALID_STYLES = ['conservative', 'balanced', 'growth'] as const;
type FinancialStyle = (typeof VALID_STYLES)[number];

/**
 * POST /api/user/financial-profile
 *
 * Stores the user's self-reported financial profile into
 * UserPreferences.limits.financialProfile — merging with existing limits
 * so other keys (permissionPreset, agentBudget, etc.) are preserved.
 *
 * Auth: zkLogin JWT (header `x-zklogin-jwt`) + `assertOwns(body.address)`.
 * SPEC 30 Phase 1A.6 closed the prior wide-open posture — pre-fix any
 * caller could overwrite any user's financial profile by URL
 * substitution.
 *
 * Body: { address: string; style?: FinancialStyle; notes?: string }
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;

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

  const ownership = assertOwns(auth.verified, address);
  if (ownership) return ownership;

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
    },
    update: {
      limits: merged as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ ok: true });
}
