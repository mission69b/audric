import { NextRequest, NextResponse } from 'next/server';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const VALID_FEATURES = ['hf_alert', 'briefing', 'rate_alert'] as const;

/**
 * GET /api/user/notification-prefs?address=0x...
 * Returns the user's notification preferences.
 */
export async function GET(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.nextUrl.searchParams.get('address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: {
      id: true,
      notificationPrefs: {
        select: { feature: true, enabled: true },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const prefs: Record<string, boolean> = {};
  for (const f of VALID_FEATURES) {
    prefs[f] = true;
  }
  for (const p of user.notificationPrefs) {
    prefs[p.feature] = p.enabled;
  }

  return NextResponse.json({ prefs });
}

/**
 * PUT /api/user/notification-prefs
 * Body: { address, feature, enabled }
 * Toggles a single notification preference.
 */
export async function PUT(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  let body: { address?: string; feature?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { address, feature, enabled } = body;

  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  if (!feature || !VALID_FEATURES.includes(feature as typeof VALID_FEATURES[number])) {
    return NextResponse.json(
      { error: `Invalid feature. Must be one of: ${VALID_FEATURES.join(', ')}` },
      { status: 400 },
    );
  }

  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress: address },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await prisma.notificationPrefs.upsert({
    where: { userId_feature: { userId: user.id, feature } },
    update: { enabled },
    create: { userId: user.id, feature, enabled },
  });

  return NextResponse.json({ ok: true, feature, enabled });
}
