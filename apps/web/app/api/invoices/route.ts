import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { generateSlug } from '@/lib/slug';

export const runtime = 'nodejs';

interface InvoiceItem {
  description: string;
  amount: number;
  quantity?: number;
}

/**
 * POST /api/invoices — Create a new invoice
 */
export async function POST(request: NextRequest) {
  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  const address = request.headers.get('x-sui-address');
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

  const rl = rateLimit(`inv:${address}`, 15, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  let body: {
    amount: number;
    label: string;
    items?: InvoiceItem[];
    memo?: string;
    recipientEmail?: string;
    recipientName?: string;
    dueDays?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.amount || body.amount <= 0) {
    return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });
  }
  if (!body.label || body.label.trim().length === 0) {
    return NextResponse.json({ error: 'Label is required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { suiAddress: address } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const slug = generateSlug(10);
  const dueDate = body.dueDays
    ? new Date(Date.now() + body.dueDays * 86_400_000)
    : null;

  const invoice = await prisma.invoice.create({
    data: {
      slug,
      userId: user.id,
      suiAddress: address,
      amount: body.amount,
      label: body.label.trim(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: (body.items ?? []) as any,
      memo: body.memo ?? null,
      recipientEmail: body.recipientEmail ?? null,
      recipientName: body.recipientName ?? null,
      dueDate,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';

  return NextResponse.json({
    id: invoice.id,
    slug: invoice.slug,
    url: `${baseUrl}/invoice/${invoice.slug}`,
    amount: invoice.amount,
    label: invoice.label,
    status: invoice.status,
    dueDate: invoice.dueDate?.toISOString() ?? null,
    createdAt: invoice.createdAt.toISOString(),
  });
}

/**
 * GET /api/invoices — List the authenticated user's invoices
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

  const invoices = await prisma.invoice.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';

  return NextResponse.json(
    invoices.map((inv) => ({
      id: inv.id,
      slug: inv.slug,
      url: `${baseUrl}/invoice/${inv.slug}`,
      amount: inv.amount,
      label: inv.label,
      recipientName: inv.recipientName,
      recipientEmail: inv.recipientEmail,
      status: inv.status,
      paidAt: inv.paidAt?.toISOString() ?? null,
      txDigest: inv.txDigest,
      dueDate: inv.dueDate?.toISOString() ?? null,
      createdAt: inv.createdAt.toISOString(),
    })),
  );
}
