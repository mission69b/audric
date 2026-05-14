import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth';

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
 * PATCH /api/payments/[slug] -- Cancel a payment (auth required, owner only).
 * All "mark paid" transitions go through POST /api/payments/[slug]/verify.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug } = await params;

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.status !== 'cancelled') {
    return NextResponse.json({ error: 'Only status=cancelled is supported' }, { status: 400 });
  }

  // [SPEC 30 Phase 1A.3] Pre-Phase-1A this route trusted the
  // `x-sui-address` header — the EXACT class of input the reporter PoC
  // demonstrated swapping via Burp. Replace with the verified JWT
  // identity so the address can no longer be spoofed.
  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;
  const address = auth.verified.suiAddress;

  const payment = await prisma.payment.findUnique({ where: { slug } });
  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  if (address !== payment.suiAddress) {
    // [SPEC 30 Phase 1A.3] Collapse "not yours" → 404 to prevent
    // payment-slug enumeration. Pre-Phase-1A this returned 403 which
    // confirmed the slug existed but belonged to someone else.
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  if (payment.status === 'paid') {
    return NextResponse.json({ error: 'Cannot cancel a paid payment' }, { status: 409 });
  }
  if (payment.status === 'cancelled') {
    return NextResponse.json({ error: 'Already cancelled' }, { status: 409 });
  }

  const isExpired = payment.expiresAt && payment.expiresAt < new Date();
  if (isExpired) {
    return NextResponse.json({ error: 'Cannot cancel an expired payment' }, { status: 409 });
  }

  const updated = await prisma.payment.update({
    where: { slug },
    data: { status: 'cancelled' },
  });
  return NextResponse.json({ status: updated.status });
}

/**
 * DELETE /api/payments/[slug] -- Delete payment (owner only).
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { slug } = await params;

  const auth = await authenticateRequest(request);
  if ('error' in auth) return auth.error;
  const address = auth.verified.suiAddress;

  const payment = await prisma.payment.findUnique({ where: { slug } });
  if (!payment || payment.suiAddress !== address) {
    // Same 404-collapse rule as PATCH: "not yours" === "not found"
    // for slug enumeration safety.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.payment.delete({ where: { slug } });
  return NextResponse.json({ ok: true });
}
