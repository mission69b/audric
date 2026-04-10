import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';

export const runtime = 'nodejs';

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/payment-links/[slug] — Public: get link details (no auth required for payers)
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;

  const link = await prisma.paymentLink.findUnique({ where: { slug } });
  if (!link) {
    return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
  }

  const isExpired = link.expiresAt && link.expiresAt < new Date();
  const effectiveStatus = isExpired && link.status === 'active' ? 'expired' : link.status;

  const user = await prisma.user.findUnique({
    where: { id: link.userId },
    select: { displayName: true },
  });

  return NextResponse.json({
    slug: link.slug,
    recipientAddress: link.suiAddress,
    recipientName: user?.displayName ?? null,
    amount: link.amount,
    label: link.label,
    memo: link.memo,
    currency: link.currency,
    status: effectiveStatus,
    paidAt: link.paidAt?.toISOString() ?? null,
    txDigest: link.txDigest,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
  });
}

/**
 * PATCH /api/payment-links/[slug] — Update link (cancel, mark paid)
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug } = await params;

  let body: { status?: string; paidBy?: string; txDigest?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const link = await prisma.paymentLink.findUnique({ where: { slug } });
  if (!link) {
    return NextResponse.json({ error: 'Payment link not found' }, { status: 404 });
  }

  if (body.status === 'paid' && body.txDigest) {
    if (link.status !== 'active') {
      return NextResponse.json({ error: `Cannot mark ${link.status} link as paid` }, { status: 409 });
    }
    if (!body.txDigest.match(/^[A-Za-z0-9+/=]{32,88}$/)) {
      return NextResponse.json({ error: 'Invalid transaction digest' }, { status: 400 });
    }
    if (body.paidBy && !isValidSuiAddress(body.paidBy)) {
      return NextResponse.json({ error: 'Invalid payer address' }, { status: 400 });
    }

    const updated = await prisma.paymentLink.update({
      where: { slug },
      data: {
        status: 'paid',
        paidAt: new Date(),
        paidBy: body.paidBy ?? null,
        txDigest: body.txDigest,
      },
    });
    return NextResponse.json({ status: updated.status, txDigest: updated.txDigest });
  }

  if (body.status === 'cancelled') {
    const jwt = request.headers.get('x-zklogin-jwt');
    const jwtResult = validateJwt(jwt);
    if ('error' in jwtResult) return jwtResult.error;

    const address = request.headers.get('x-sui-address');
    if (address !== link.suiAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (link.status !== 'active') {
      return NextResponse.json({ error: `Cannot cancel ${link.status} link` }, { status: 409 });
    }

    const updated = await prisma.paymentLink.update({
      where: { slug },
      data: { status: 'cancelled' },
    });
    return NextResponse.json({ status: updated.status });
  }

  return NextResponse.json({ error: 'Invalid update' }, { status: 400 });
}

/**
 * DELETE /api/payment-links/[slug] — Delete link (owner only)
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { slug } = await params;

  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.headers.get('x-sui-address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 });
  }

  const link = await prisma.paymentLink.findUnique({ where: { slug } });
  if (!link) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (link.suiAddress !== address) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  await prisma.paymentLink.delete({ where: { slug } });
  return NextResponse.json({ ok: true });
}
