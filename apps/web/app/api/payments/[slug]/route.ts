import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';

export const runtime = 'nodejs';

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/payments/[slug] -- Public: get payment details (no auth required for payers).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;

  const payment = await prisma.payment.findUnique({ where: { slug } });
  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  const now = new Date();
  const isExpired = payment.expiresAt && payment.expiresAt < now && payment.status === 'active';
  const isOverdue =
    payment.type === 'invoice' && payment.dueDate && payment.dueDate < now && payment.status === 'active';
  const effectiveStatus = isExpired ? 'expired' : isOverdue ? 'overdue' : payment.status;

  const user = await prisma.user.findUnique({
    where: { id: payment.userId },
    select: { displayName: true },
  });

  return NextResponse.json({
    slug: payment.slug,
    nonce: payment.nonce,
    type: payment.type,
    recipientAddress: payment.suiAddress,
    recipientName: user?.displayName ?? null,
    amount: payment.amount,
    currency: payment.currency,
    label: payment.label,
    memo: payment.memo,
    status: effectiveStatus,
    paymentMethod: payment.paymentMethod,
    paidAt: payment.paidAt?.toISOString() ?? null,
    paidBy: payment.paidBy,
    txDigest: payment.txDigest,
    ...(payment.type === 'invoice' && {
      lineItems: payment.lineItems,
      dueDate: payment.dueDate?.toISOString() ?? null,
      billToName: payment.recipientName,
      billToEmail: payment.recipientEmail,
      senderName: payment.senderName,
    }),
    ...(payment.type === 'link' && {
      expiresAt: payment.expiresAt?.toISOString() ?? null,
    }),
    createdAt: payment.createdAt.toISOString(),
  });
}

/**
 * PATCH /api/payments/[slug] -- Update payment (cancel, mark paid).
 * - status=paid + txDigest: mark as paid (public, no auth)
 * - status=cancelled: cancel (auth required, owner only)
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug } = await params;

  let body: {
    status?: string;
    paidBy?: string;
    txDigest?: string;
    paymentMethod?: string;
    senderName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const payment = await prisma.payment.findUnique({ where: { slug } });
  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  if (body.status === 'paid' && body.txDigest) {
    if (payment.status !== 'active') {
      return NextResponse.json({ error: `Cannot mark ${payment.status} payment as paid` }, { status: 409 });
    }
    if (!body.txDigest.match(/^[A-Za-z0-9+/=]{32,88}$/)) {
      return NextResponse.json({ error: 'Invalid transaction digest' }, { status: 400 });
    }
    if (body.paidBy && !isValidSuiAddress(body.paidBy)) {
      return NextResponse.json({ error: 'Invalid payer address' }, { status: 400 });
    }

    const updated = await prisma.payment.update({
      where: { slug, status: 'active' },
      data: {
        status: 'paid',
        paidAt: new Date(),
        paidBy: body.paidBy ?? null,
        txDigest: body.txDigest,
        paymentMethod: body.paymentMethod ?? 'unknown',
        senderName: body.senderName ?? null,
      },
    }).catch(() => null);

    if (!updated) {
      return NextResponse.json({ error: 'Payment already processed' }, { status: 409 });
    }

    return NextResponse.json({ status: updated.status, txDigest: updated.txDigest });
  }

  if (body.status === 'cancelled') {
    const jwt = request.headers.get('x-zklogin-jwt');
    const jwtResult = validateJwt(jwt);
    if ('error' in jwtResult) return jwtResult.error;

    const address = request.headers.get('x-sui-address');
    if (address !== payment.suiAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (payment.status === 'paid') {
      return NextResponse.json({ error: 'Cannot cancel a paid payment' }, { status: 409 });
    }
    if (payment.status === 'cancelled') {
      return NextResponse.json({ error: 'Already cancelled' }, { status: 409 });
    }

    const updated = await prisma.payment.update({
      where: { slug },
      data: { status: 'cancelled' },
    });
    return NextResponse.json({ status: updated.status });
  }

  return NextResponse.json({ error: 'Invalid update' }, { status: 400 });
}

/**
 * DELETE /api/payments/[slug] -- Delete payment (owner only).
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

  const payment = await prisma.payment.findUnique({ where: { slug } });
  if (!payment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (payment.suiAddress !== address) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  await prisma.payment.delete({ where: { slug } });
  return NextResponse.json({ ok: true });
}
