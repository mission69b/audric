import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';
import { generateSlug } from '@/lib/slug';
import { isValidSuiAddress } from '@mysten/sui/utils';

export const runtime = 'nodejs';

/**
 * POST /api/internal/payment-links
 * Called by the engine's create_payment_link tool.
 * Auth: x-internal-key + x-sui-address
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const suiAddress = request.headers.get('x-sui-address');
  if (!suiAddress || !isValidSuiAddress(suiAddress)) {
    return NextResponse.json({ error: 'Missing or invalid x-sui-address' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { suiAddress }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  let body: {
    amount?: number;
    currency?: string;
    label?: string;
    memo?: string;
    expiresInHours?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.amount !== undefined && (typeof body.amount !== 'number' || body.amount <= 0)) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const slug = generateSlug();
  const expiresAt =
    body.expiresInHours && body.expiresInHours > 0
      ? new Date(Date.now() + body.expiresInHours * 3_600_000)
      : null;

  const link = await prisma.paymentLink.create({
    data: {
      slug,
      userId: user.id,
      suiAddress,
      amount: body.amount ?? null,
      currency: body.currency ?? 'USDC',
      label: body.label ?? null,
      memo: body.memo ?? null,
      expiresAt,
    },
    select: { slug: true, amount: true, currency: true, label: true, memo: true, expiresAt: true, createdAt: true },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';

  return NextResponse.json({
    slug: link.slug,
    url: `${baseUrl}/pay/${link.slug}`,
    amount: link.amount,
    currency: link.currency,
    label: link.label,
    memo: link.memo,
    expiresAt: link.expiresAt?.toISOString() ?? null,
  }, { status: 201 });
}

/**
 * GET /api/internal/payment-links
 * Returns the user's payment links (most recent 20).
 */
export async function GET(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const suiAddress = request.headers.get('x-sui-address');
  if (!suiAddress || !isValidSuiAddress(suiAddress)) {
    return NextResponse.json({ error: 'Missing or invalid x-sui-address' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { suiAddress }, select: { id: true } });
  if (!user) return NextResponse.json({ links: [] });

  const links = await prisma.paymentLink.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { slug: true, amount: true, currency: true, label: true, status: true, expiresAt: true, paidAt: true, createdAt: true },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';
  const now = new Date();

  return NextResponse.json({
    links: links.map((l) => ({
      slug: l.slug,
      url: `${baseUrl}/pay/${l.slug}`,
      amount: l.amount,
      currency: l.currency,
      label: l.label,
      status: l.status === 'active' && l.expiresAt && l.expiresAt < now ? 'expired' : l.status,
      paidAt: l.paidAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}
