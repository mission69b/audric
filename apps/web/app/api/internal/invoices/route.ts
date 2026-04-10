import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';
import { generateSlug } from '@/lib/slug';
import { isValidSuiAddress } from '@mysten/sui/utils';

export const runtime = 'nodejs';

/**
 * POST /api/internal/invoices
 * Called by the engine's create_invoice tool.
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
    amount: number;
    label: string;
    memo?: string;
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

  if (!body.amount || typeof body.amount !== 'number' || body.amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }
  if (!body.label || typeof body.label !== 'string' || !body.label.trim()) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 });
  }

  const slug = generateSlug();
  const dueDate = body.dueDays && body.dueDays > 0
    ? new Date(Date.now() + body.dueDays * 86_400_000)
    : null;

  const invoice = await prisma.invoice.create({
    data: {
      slug,
      userId: user.id,
      suiAddress,
      amount: body.amount,
      currency: 'USDC',
      label: body.label.trim(),
      memo: body.memo ?? null,
      recipientName: body.recipientName ?? null,
      recipientEmail: body.recipientEmail ?? null,
      dueDate,
      items: JSON.parse(JSON.stringify(body.items ?? [])),
    },
    select: { slug: true, amount: true, currency: true, label: true, memo: true, dueDate: true, createdAt: true },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';

  return NextResponse.json({
    slug: invoice.slug,
    url: `${baseUrl}/invoice/${invoice.slug}`,
    amount: invoice.amount,
    currency: invoice.currency,
    label: invoice.label,
    memo: invoice.memo,
    dueDate: invoice.dueDate?.toISOString() ?? null,
  }, { status: 201 });
}

/**
 * PATCH /api/internal/invoices
 * Cancel an invoice by slug (owner only, via internal key).
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

  const invoice = await prisma.invoice.findUnique({ where: { slug: body.slug } });
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (invoice.suiAddress !== suiAddress) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  if (invoice.status === 'paid') return NextResponse.json({ error: 'Cannot cancel a paid invoice' }, { status: 409 });
  if (invoice.status === 'cancelled') return NextResponse.json({ error: 'Invoice already cancelled' }, { status: 409 });

  const updated = await prisma.invoice.update({
    where: { slug: body.slug },
    data: { status: 'cancelled' },
  });

  return NextResponse.json({ slug: updated.slug, status: updated.status });
}

/**
 * GET /api/internal/invoices
 * Returns the user's invoices (most recent 20).
 */
export async function GET(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get('x-internal-key'));
  if ('error' in auth) return auth.error;

  const suiAddress = request.headers.get('x-sui-address');
  if (!suiAddress || !isValidSuiAddress(suiAddress)) {
    return NextResponse.json({ error: 'Missing or invalid x-sui-address' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { suiAddress }, select: { id: true } });
  if (!user) return NextResponse.json({ invoices: [] });

  const invoices = await prisma.invoice.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { slug: true, amount: true, currency: true, label: true, status: true, dueDate: true, paidAt: true, createdAt: true },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://audric.ai';
  const now = new Date();

  return NextResponse.json({
    invoices: invoices.map((inv) => ({
      slug: inv.slug,
      url: `${baseUrl}/invoice/${inv.slug}`,
      amount: inv.amount,
      currency: inv.currency,
      label: inv.label,
      status: inv.status === 'pending' && inv.dueDate && inv.dueDate < now ? 'overdue' : inv.status,
      paidAt: inv.paidAt?.toISOString() ?? null,
      dueDate: inv.dueDate?.toISOString() ?? null,
      createdAt: inv.createdAt.toISOString(),
    })),
  });
}
