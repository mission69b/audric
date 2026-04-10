import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { generateSlug } from '@/lib/slug';

export const runtime = 'nodejs';

/**
 * POST /api/payment-links — Create a new payment link
 */
export async function POST(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.headers.get('x-sui-address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

  const rl = rateLimit(`pl:${address}`, 20, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  let body: { amount?: number; label?: string; memo?: string; expiresInHours?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.amount != null && (typeof body.amount !== 'number' || body.amount < 0)) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }
  if (body.expiresInHours != null && (typeof body.expiresInHours !== 'number' || body.expiresInHours <= 0)) {
    return NextResponse.json({ error: 'expiresInHours must be a positive number' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { suiAddress: address } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const slug = generateSlug();
  const expiresAt = body.expiresInHours
    ? new Date(Date.now() + body.expiresInHours * 3600_000)
    : null;

  const link = await prisma.paymentLink.create({
    data: {
      slug,
      userId: user.id,
      suiAddress: address,
      amount: body.amount ?? null,
      label: body.label ?? null,
      memo: body.memo ?? null,
      expiresAt,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';

  return NextResponse.json({
    id: link.id,
    slug: link.slug,
    url: `${baseUrl}/pay/${link.slug}`,
    amount: link.amount,
    label: link.label,
    status: link.status,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
  });
}

/**
 * GET /api/payment-links — List the authenticated user's payment links
 */
export async function GET(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.headers.get('x-sui-address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { suiAddress: address } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const links = await prisma.paymentLink.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';

  return NextResponse.json(
    links.map((l) => ({
      id: l.id,
      slug: l.slug,
      url: `${baseUrl}/pay/${l.slug}`,
      amount: l.amount,
      label: l.label,
      status: l.status,
      paidAt: l.paidAt?.toISOString() ?? null,
      paidBy: l.paidBy,
      txDigest: l.txDigest,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
  );
}
