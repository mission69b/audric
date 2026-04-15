import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';
import { generateSlug } from '@/lib/slug';
import { isValidSuiAddress } from '@mysten/sui/utils';

export const runtime = 'nodejs';

/**
 * POST /api/internal/payments
 * Called by the engine's create_payment_link and create_invoice tools.
 * Auth: x-internal-key + x-sui-address
 *
 * Body must include { type: 'link' | 'invoice' }.
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
    type?: 'link' | 'invoice';
    amount?: number;
    currency?: string;
    label?: string;
    memo?: string;
    expiresInHours?: number;
    recipientName?: string;
    recipientEmail?: string;
    dueDays?: number;
    items?: { description: string; amount: number }[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const type = body.type ?? 'link';
  if (type !== 'link' && type !== 'invoice') {
    return NextResponse.json({ error: 'type must be "link" or "invoice"' }, { status: 400 });
  }

  if (body.amount !== undefined && (typeof body.amount !== 'number' || body.amount <= 0)) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  if (type === 'invoice') {
    if (!body.amount || body.amount <= 0) {
      return NextResponse.json({ error: 'Invoice amount must be positive' }, { status: 400 });
    }
    if (!body.label || typeof body.label !== 'string' || !body.label.trim()) {
      return NextResponse.json({ error: 'Invoice label is required' }, { status: 400 });
    }
  }

  const slug = generateSlug(type === 'invoice' ? 10 : 8);

  const expiresAt =
    body.expiresInHours && body.expiresInHours > 0
      ? new Date(Date.now() + body.expiresInHours * 3_600_000)
      : null;

  const dueDate =
    type === 'invoice' && body.dueDays && body.dueDays > 0
      ? new Date(Date.now() + body.dueDays * 86_400_000)
      : null;

  const payment = await prisma.payment.create({
    data: {
      slug,
      userId: user.id,
      suiAddress,
      type,
      amount: body.amount ?? null,
      currency: body.currency ?? 'USDC',
      label: body.label?.trim() ?? null,
      memo: body.memo ?? null,
      expiresAt,
      ...(type === 'invoice' && {
        lineItems: body.items ? JSON.parse(JSON.stringify(body.items)) : null,
        dueDate,
        recipientName: body.recipientName ?? null,
        recipientEmail: body.recipientEmail ?? null,
      }),
    },
    select: {
      slug: true,
      nonce: true,
      type: true,
      amount: true,
      currency: true,
      label: true,
      memo: true,
      dueDate: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';
  const url = `${baseUrl}/pay/${payment.slug}`;

  return NextResponse.json(
    {
      slug: payment.slug,
      nonce: payment.nonce,
      url,
      type: payment.type,
      amount: payment.amount,
      currency: payment.currency,
      label: payment.label,
      memo: payment.memo,
      ...(type === 'invoice' && {
        dueDate: payment.dueDate?.toISOString() ?? null,
      }),
      ...(type === 'link' && {
        expiresAt: payment.expiresAt?.toISOString() ?? null,
      }),
    },
    { status: 201 },
  );
}

/**
 * PATCH /api/internal/payments
 * Cancel a payment by slug (owner only, via internal key).
 * Body: { slug, action: 'cancel' }
 */
export async function PATCH(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const suiAddress = request.headers.get('x-sui-address');
  if (!suiAddress || !isValidSuiAddress(suiAddress)) {
    return NextResponse.json({ error: 'Missing or invalid x-sui-address' }, { status: 400 });
  }

  let body: { slug: string; action: 'cancel' };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.slug || body.action !== 'cancel') {
    return NextResponse.json({ error: 'slug and action=cancel required' }, { status: 400 });
  }

  const payment = await prisma.payment.findUnique({ where: { slug: body.slug } });
  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  if (payment.suiAddress !== suiAddress) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  if (payment.status === 'paid') return NextResponse.json({ error: 'Cannot cancel a paid payment' }, { status: 409 });
  if (payment.status === 'cancelled') return NextResponse.json({ error: 'Already cancelled' }, { status: 409 });

  const updated = await prisma.payment.update({
    where: { slug: body.slug },
    data: { status: 'cancelled' },
  });

  return NextResponse.json({ slug: updated.slug, status: updated.status });
}

/**
 * GET /api/internal/payments
 * Returns the user's payments (most recent 20).
 * Optional query param: ?type=link|invoice
 */
export async function GET(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const suiAddress = request.headers.get('x-sui-address');
  if (!suiAddress || !isValidSuiAddress(suiAddress)) {
    return NextResponse.json({ error: 'Missing or invalid x-sui-address' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { suiAddress }, select: { id: true } });
  if (!user) return NextResponse.json({ payments: [] });

  const typeFilter = request.nextUrl.searchParams.get('type');
  const where: Record<string, unknown> = { userId: user.id };
  if (typeFilter === 'link' || typeFilter === 'invoice') {
    where.type = typeFilter;
  }

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      slug: true,
      nonce: true,
      type: true,
      amount: true,
      currency: true,
      label: true,
      status: true,
      paymentMethod: true,
      dueDate: true,
      expiresAt: true,
      paidAt: true,
      createdAt: true,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';
  const now = new Date();

  return NextResponse.json({
    payments: payments.map((p) => {
      const isExpired = p.expiresAt && p.expiresAt < now && p.status === 'active';
      const isOverdue = p.type === 'invoice' && p.dueDate && p.dueDate < now && p.status === 'active';

      return {
        slug: p.slug,
        url: `${baseUrl}/pay/${p.slug}`,
        type: p.type,
        amount: p.amount,
        currency: p.currency,
        label: p.label,
        status: isExpired ? 'expired' : isOverdue ? 'overdue' : p.status,
        paymentMethod: p.paymentMethod,
        paidAt: p.paidAt?.toISOString() ?? null,
        ...(p.type === 'invoice' && {
          dueDate: p.dueDate?.toISOString() ?? null,
        }),
        ...(p.type === 'link' && {
          expiresAt: p.expiresAt?.toISOString() ?? null,
        }),
        createdAt: p.createdAt.toISOString(),
      };
    }),
  });
}
