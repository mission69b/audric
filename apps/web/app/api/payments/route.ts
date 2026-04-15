import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { generateSlug } from '@/lib/slug';

export const runtime = 'nodejs';

interface LineItem {
  description: string;
  amount: number;
  quantity?: number;
}

/**
 * POST /api/payments -- Create a payment link or invoice.
 * Body must include { type: 'link' | 'invoice' }.
 */
export async function POST(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.headers.get('x-sui-address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

  const rl = rateLimit(`pay:${address}`, 20, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  let body: {
    type?: 'link' | 'invoice';
    amount?: number;
    label?: string;
    memo?: string;
    expiresInHours?: number;
    lineItems?: LineItem[];
    recipientEmail?: string;
    recipientName?: string;
    dueDays?: number;
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

  if (body.amount != null && (typeof body.amount !== 'number' || body.amount < 0)) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  if (type === 'invoice') {
    if (!body.amount || body.amount <= 0) {
      return NextResponse.json({ error: 'Invoice amount must be positive' }, { status: 400 });
    }
    if (!body.label || body.label.trim().length === 0) {
      return NextResponse.json({ error: 'Invoice label is required' }, { status: 400 });
    }
  }

  const user = await prisma.user.findUnique({ where: { suiAddress: address } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
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
      suiAddress: address,
      type,
      amount: body.amount ?? null,
      label: body.label?.trim() ?? null,
      memo: body.memo ?? null,
      expiresAt,
      ...(type === 'invoice' && {
        lineItems: body.lineItems ? JSON.parse(JSON.stringify(body.lineItems)) : null,
        dueDate,
        recipientName: body.recipientName ?? null,
        recipientEmail: body.recipientEmail ?? null,
      }),
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';
  const url = `${baseUrl}/pay/${payment.slug}`;

  return NextResponse.json({
    id: payment.id,
    slug: payment.slug,
    nonce: payment.nonce,
    url,
    type: payment.type,
    amount: payment.amount,
    label: payment.label,
    status: payment.status,
    ...(type === 'invoice' && {
      dueDate: dueDate?.toISOString() ?? null,
      recipientName: payment.recipientName,
      recipientEmail: payment.recipientEmail,
    }),
    ...(type === 'link' && {
      expiresAt: payment.expiresAt?.toISOString() ?? null,
    }),
    createdAt: payment.createdAt.toISOString(),
  }, { status: 201 });
}

/**
 * GET /api/payments -- List the authenticated user's payments.
 * Query params: ?type=link|invoice (optional filter)
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

  const typeFilter = request.nextUrl.searchParams.get('type');
  const where: Record<string, unknown> = { userId: user.id };
  if (typeFilter === 'link' || typeFilter === 'invoice') {
    where.type = typeFilter;
  }

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';
  const now = new Date();

  return NextResponse.json(
    payments.map((p) => {
      const isExpired = p.expiresAt && p.expiresAt < now && p.status === 'active';
      const isOverdue = p.type === 'invoice' && p.dueDate && p.dueDate < now && p.status === 'active';

      return {
        id: p.id,
        slug: p.slug,
        url: `${baseUrl}/pay/${p.slug}`,
        type: p.type,
        amount: p.amount,
        label: p.label,
        currency: p.currency,
        status: isExpired ? 'expired' : isOverdue ? 'overdue' : p.status,
        paymentMethod: p.paymentMethod,
        paidAt: p.paidAt?.toISOString() ?? null,
        paidBy: p.paidBy,
        txDigest: p.txDigest,
        ...(p.type === 'invoice' && {
          recipientName: p.recipientName,
          recipientEmail: p.recipientEmail,
          dueDate: p.dueDate?.toISOString() ?? null,
        }),
        ...(p.type === 'link' && {
          expiresAt: p.expiresAt?.toISOString() ?? null,
        }),
        createdAt: p.createdAt.toISOString(),
      };
    }),
  );
}
