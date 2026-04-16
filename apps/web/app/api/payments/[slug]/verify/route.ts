import { NextRequest, NextResponse } from 'next/server';
import type { InputJsonValue } from '@/lib/generated/prisma/internal/prismaNamespace';
import { prisma } from '@/lib/prisma';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const SUI_RPC =
  process.env.SUI_RPC_URL ??
  (process.env.NEXT_PUBLIC_SUI_NETWORK === 'testnet'
    ? 'https://fullnode.testnet.sui.io:443'
    : 'https://fullnode.mainnet.sui.io:443');
const USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

type Params = { params: Promise<{ slug: string }> };

/**
 * POST /api/payments/[slug]/verify
 *
 * Two modes:
 *   1. Body includes { digest } -- look up that specific transaction on-chain.
 *   2. No body / empty body   -- poll recent inbound txs (legacy behaviour).
 *
 * On success: marks payment as paid, stores pay_received AppEvent.
 * Rate-limited to 10 requests per minute per slug.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;

  const rl = rateLimit(`verify:${slug}`, 10, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const payment = await prisma.payment.findUnique({ where: { slug } });
  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (payment.status !== 'active') {
    return NextResponse.json({
      status: payment.status,
      paidAt: payment.paidAt?.toISOString() ?? null,
      txDigest: payment.txDigest ?? null,
    });
  }

  const isExpired = payment.expiresAt && payment.expiresAt < new Date();
  if (isExpired) {
    return NextResponse.json({ status: 'expired', paidAt: null });
  }

  let body: { digest?: string; paymentMethod?: string; senderName?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    // empty body = polling mode
  }

  const senderName = body?.senderName?.slice(0, 100);

  try {
    if (body?.digest) {
      return await verifyByDigest(payment, body.digest, body.paymentMethod, senderName);
    }
    return await verifyByPolling(payment);
  } catch {
    const effectiveStatus = getEffectiveStatus(payment);
    return NextResponse.json({ status: effectiveStatus, paidAt: null });
  }
}

interface PaymentRecord {
  id: string;
  slug: string;
  nonce: string;
  suiAddress: string;
  type: string;
  amount: number | null;
  label: string | null;
  status: string;
  dueDate: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
}

function getEffectiveStatus(payment: PaymentRecord): string {
  if (payment.type === 'invoice' && payment.dueDate && payment.dueDate < new Date()) {
    return 'overdue';
  }
  return payment.status;
}

async function verifyByDigest(
  payment: PaymentRecord,
  digest: string,
  paymentMethod?: string,
  senderName?: string,
) {
  if (!digest.match(/^[A-Za-z0-9+/=]{32,88}$/)) {
    return NextResponse.json({ error: 'Invalid transaction digest' }, { status: 400 });
  }

  const existing = await prisma.payment.findFirst({
    where: { txDigest: digest, status: 'paid' },
    select: { slug: true },
  });
  if (existing && existing.slug !== payment.slug) {
    return NextResponse.json(
      { error: 'This transaction has already been used for another payment' },
      { status: 409 },
    );
  }

  const res = await fetch(SUI_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_getTransactionBlock',
      params: [digest, { showEffects: true, showInput: true, showBalanceChanges: true }],
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to verify on-chain' }, { status: 502 });
  }

  const json = (await res.json()) as {
    result?: {
      digest: string;
      timestampMs?: string;
      transaction?: { data?: { sender?: string } };
      effects?: { status?: { status?: string } };
      balanceChanges?: Array<{
        owner: { AddressOwner?: string };
        coinType: string;
        amount: string;
      }>;
    };
  };

  const tx = json.result;
  if (!tx) {
    return NextResponse.json({ error: 'Transaction not found on-chain' }, { status: 404 });
  }

  if (tx.effects?.status?.status !== 'success') {
    return NextResponse.json({ error: 'Transaction did not succeed' }, { status: 400 });
  }

  if (tx.timestampMs) {
    const txTime = Number(tx.timestampMs);
    if (txTime < payment.createdAt.getTime()) {
      return NextResponse.json(
        { error: 'Transaction predates the payment creation' },
        { status: 400 },
      );
    }
  }

  const changes = tx.balanceChanges ?? [];
  let matchedAmount: number | null = null;

  for (const change of changes) {
    const isUSDC = change.coinType === USDC_TYPE;
    const isRecipient = change.owner.AddressOwner === payment.suiAddress;
    const amountUsdc = Number(change.amount) / 1_000_000;

    if (!isUSDC || !isRecipient || amountUsdc <= 0) continue;

    if (payment.amount !== null && Math.abs(amountUsdc - payment.amount) > 0.01) continue;

    matchedAmount = amountUsdc;
    break;
  }

  if (matchedAmount === null) {
    return NextResponse.json(
      { error: 'Transaction does not contain a matching USDC transfer to the recipient' },
      { status: 400 },
    );
  }

  const sender = tx.transaction?.data?.sender ?? null;
  return markPaid(payment, digest, sender, matchedAmount, paymentMethod ?? 'manual', senderName);
}

async function verifyByPolling(payment: PaymentRecord) {
  const res = await fetch(SUI_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_queryTransactionBlocks',
      params: [
        {
          filter: { ToAddress: payment.suiAddress },
          options: { showEffects: false, showInput: true, showBalanceChanges: true },
        },
        null,
        20,
        true,
      ],
    }),
  });

  if (!res.ok) {
    const effectiveStatus = getEffectiveStatus(payment);
    return NextResponse.json({ status: effectiveStatus, paidAt: null });
  }

  const json = (await res.json()) as {
    result?: {
      data: Array<{
        digest: string;
        timestampMs?: string;
        transaction?: { data?: { sender?: string } };
        balanceChanges?: Array<{
          owner: { AddressOwner?: string };
          coinType: string;
          amount: string;
        }>;
      }>;
    };
  };

  const txs = json.result?.data ?? [];
  const createdAtMs = payment.createdAt.getTime();

  for (const tx of txs) {
    const txTime = tx.timestampMs ? Number(tx.timestampMs) : null;
    if (txTime !== null && txTime < createdAtMs) continue;

    const changes = tx.balanceChanges ?? [];
    for (const change of changes) {
      const isUSDC = change.coinType === USDC_TYPE;
      const isRecipient = change.owner.AddressOwner === payment.suiAddress;
      const amountUsdc = Number(change.amount) / 1_000_000;

      if (!isUSDC || !isRecipient || amountUsdc <= 0) continue;
      if (payment.amount !== null && Math.abs(amountUsdc - payment.amount) > 0.01) continue;

      const alreadyUsed = await prisma.payment.findFirst({
        where: { txDigest: tx.digest, status: 'paid' },
        select: { slug: true },
      });
      if (alreadyUsed && alreadyUsed.slug !== payment.slug) continue;

      const sender = tx.transaction?.data?.sender ?? null;
      return markPaid(payment, tx.digest, sender, amountUsdc, 'unknown');
    }
  }

  const effectiveStatus = getEffectiveStatus(payment);
  return NextResponse.json({ status: effectiveStatus, paidAt: null });
}

async function markPaid(
  payment: PaymentRecord,
  digest: string,
  sender: string | null,
  amountReceived: number,
  paymentMethod: string,
  senderName?: string,
) {
  const updated = await prisma.payment
    .update({
      where: { slug: payment.slug, status: 'active' },
      data: {
        status: 'paid',
        paidAt: new Date(),
        paidBy: sender,
        txDigest: digest,
        paymentMethod,
        senderName: senderName ?? null,
      },
    })
    .catch(() => null);

  if (!updated) {
    const current = await prisma.payment.findUnique({
      where: { slug: payment.slug },
      select: { status: true, paidAt: true, txDigest: true },
    });
    if (current?.status === 'paid') {
      return NextResponse.json({
        status: 'paid',
        paidAt: current.paidAt?.toISOString() ?? new Date().toISOString(),
        txDigest: current.txDigest ?? digest,
        amountReceived,
      });
    }
    return NextResponse.json(
      { error: 'This transaction has already been used for another payment' },
      { status: 409 },
    );
  }

  await prisma.appEvent
    .create({
      data: {
        address: payment.suiAddress,
        type: 'pay_received',
        title: `Received ${amountReceived.toFixed(2)} USDC${payment.label ? ` for ${payment.label}` : ''}`,
        digest,
        details: {
          slug: payment.slug,
          nonce: payment.nonce,
          paymentType: payment.type,
          amount: amountReceived,
          paymentMethod,
          sender,
          senderName: senderName ?? null,
          label: payment.label,
        } as unknown as InputJsonValue,
        source: 'payment',
      },
    })
    .catch(() => {});

  return NextResponse.json({
    status: 'paid',
    paidAt: updated.paidAt?.toISOString() ?? new Date().toISOString(),
    txDigest: digest,
    amountReceived,
  });
}
