import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const SUI_RPC = process.env.SUI_RPC_URL ?? 'https://fullnode.mainnet.sui.io:443';
const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

type Params = { params: Promise<{ slug: string }> };

/**
 * POST /api/invoices/[slug]/verify
 * Called by the invoice page to check if USDC payment arrived on-chain.
 * Public — no auth required (slug is the secret).
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const { slug } = await params;

  const invoice = await prisma.invoice.findUnique({ where: { slug } });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (invoice.status !== 'pending') {
    return NextResponse.json({ status: invoice.status, paidAt: invoice.paidAt?.toISOString() ?? null });
  }

  // Check overdue (but still allow payment)
  const isOverdue = invoice.dueDate && invoice.dueDate < new Date();

  try {
    const res = await fetch(SUI_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'suix_queryTransactionBlocks',
        params: [
          {
            filter: { ToAddress: invoice.suiAddress },
            options: { showEffects: false, showInput: true, showBalanceChanges: true, showTimestampMs: true },
          },
          null,
          20,
          true,
        ],
      }),
    });

    if (!res.ok) return NextResponse.json({ status: isOverdue ? 'overdue' : 'pending', paidAt: null });

    const json = await res.json() as {
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
    const invoiceCreatedAt = invoice.createdAt.getTime();

    for (const tx of txs) {
      const txTime = tx.timestampMs ? Number(tx.timestampMs) : null;
      if (txTime !== null && txTime < invoiceCreatedAt) continue;

      const changes = tx.balanceChanges ?? [];
      for (const change of changes) {
        const isUSDC = change.coinType === USDC_TYPE;
        const isRecipient = change.owner.AddressOwner === invoice.suiAddress;
        const amountUsdc = Number(change.amount) / 1_000_000;

        if (!isUSDC || !isRecipient || amountUsdc <= 0) continue;
        if (Math.abs(amountUsdc - invoice.amount) > 0.01) continue;

        const sender = tx.transaction?.data?.sender ?? null;
        const updated = await prisma.invoice.update({
          where: { slug, status: 'pending' },
          data: { status: 'paid', paidAt: new Date(), paidBy: sender, txDigest: tx.digest },
        }).catch(() => null);

        return NextResponse.json({
          status: 'paid',
          paidAt: updated?.paidAt?.toISOString() ?? new Date().toISOString(),
          txDigest: tx.digest,
          amountReceived: amountUsdc,
        });
      }
    }

    return NextResponse.json({ status: isOverdue ? 'overdue' : 'pending', paidAt: null });
  } catch {
    return NextResponse.json({ status: isOverdue ? 'overdue' : 'pending', paidAt: null });
  }
}
