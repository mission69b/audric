import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';

export const runtime = 'nodejs';

type Params = { params: Promise<{ slug: string }> };

interface InvoiceItem {
  description: string;
  amount: number;
  quantity?: number;
}

/**
 * GET /api/invoices/[slug] — Public: get invoice details
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;

  const invoice = await prisma.invoice.findUnique({ where: { slug } });
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const isOverdue = invoice.dueDate && invoice.dueDate < new Date() && invoice.status === 'pending';
  const effectiveStatus = isOverdue ? 'overdue' : invoice.status;

  const user = await prisma.user.findUnique({
    where: { id: invoice.userId },
    select: { displayName: true },
  });

  return NextResponse.json({
    slug: invoice.slug,
    senderAddress: invoice.suiAddress,
    senderName: user?.displayName ?? null,
    recipientName: invoice.recipientName,
    recipientEmail: invoice.recipientEmail,
    amount: invoice.amount,
    currency: invoice.currency,
    label: invoice.label,
    items: invoice.items as unknown as InvoiceItem[],
    memo: invoice.memo,
    status: effectiveStatus,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    txDigest: invoice.txDigest,
    dueDate: invoice.dueDate?.toISOString() ?? null,
    createdAt: invoice.createdAt.toISOString(),
  });
}

/**
 * PATCH /api/invoices/[slug] — Update invoice (mark paid, cancel, send reminder)
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug } = await params;

  let body: { status?: string; paidBy?: string; txDigest?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({ where: { slug } });
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (body.status === 'paid' && body.txDigest) {
    if (invoice.status !== 'pending') {
      return NextResponse.json({ error: `Cannot mark ${invoice.status} invoice as paid` }, { status: 409 });
    }
    if (!body.txDigest.match(/^[A-Za-z0-9+/=]{32,88}$/)) {
      return NextResponse.json({ error: 'Invalid transaction digest' }, { status: 400 });
    }
    if (body.paidBy && !isValidSuiAddress(body.paidBy)) {
      return NextResponse.json({ error: 'Invalid payer address' }, { status: 400 });
    }

    const updated = await prisma.invoice.update({
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
    if (address !== invoice.suiAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Cannot cancel a paid invoice' }, { status: 409 });
    }

    const updated = await prisma.invoice.update({
      where: { slug },
      data: { status: 'cancelled' },
    });
    return NextResponse.json({ status: updated.status });
  }

  return NextResponse.json({ error: 'Invalid update' }, { status: 400 });
}

/**
 * DELETE /api/invoices/[slug] — Delete invoice (owner only)
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

  const invoice = await prisma.invoice.findUnique({ where: { slug } });
  if (!invoice) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (invoice.suiAddress !== address) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  await prisma.invoice.delete({ where: { slug } });
  return NextResponse.json({ ok: true });
}
