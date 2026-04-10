import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const SUI_RPC = process.env.SUI_RPC_URL ?? 'https://fullnode.mainnet.sui.io:443';
const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

type Params = { params: Promise<{ slug: string }> };

/**
 * POST /api/payment-links/[slug]/verify
 * Called by the payment page to check if a USDC transfer has arrived on-chain.
 * Public — no auth required (the slug is the secret).
 *
 * Queries Sui for recent coin transfers to the recipient address,
 * checks for a matching USDC amount, and marks the link as paid if found.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const { slug } = await params;

  const link = await prisma.paymentLink.findUnique({ where: { slug } });
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (link.status !== 'active') {
    return NextResponse.json({ status: link.status, paidAt: link.paidAt?.toISOString() ?? null });
  }

  // Check expiry
  if (link.expiresAt && link.expiresAt < new Date()) {
    return NextResponse.json({ status: 'expired', paidAt: null });
  }

  try {
    // Query Sui for recent transactions affecting the recipient address
    const res = await fetch(SUI_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'suix_queryTransactionBlocks',
        params: [
          {
            filter: { ToAddress: link.suiAddress },
            options: { showEffects: false, showInput: true, showBalanceChanges: true, showTimestampMs: true },
          },
          null,  // cursor
          20,    // limit — check last 20 inbound txs
          true,  // descending
        ],
      }),
    });

    if (!res.ok) return NextResponse.json({ status: 'active', paidAt: null });

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
    const linkCreatedAt = link.createdAt.getTime();

    for (const tx of txs) {
      // Skip transactions that predate the link creation
      const txTime = tx.timestampMs ? Number(tx.timestampMs) : null;
      if (txTime !== null && txTime < linkCreatedAt) continue;

      const changes = tx.balanceChanges ?? [];
      for (const change of changes) {
        const isUSDC = change.coinType === USDC_TYPE;
        const isRecipient = change.owner.AddressOwner === link.suiAddress;
        const amountUsdc = Number(change.amount) / 1_000_000; // USDC has 6 decimals

        if (!isUSDC || !isRecipient) continue;
        if (amountUsdc <= 0) continue;

        // If the link has a fixed amount, require an exact match (within 0.01 USDC rounding)
        if (link.amount !== null && Math.abs(amountUsdc - link.amount) > 0.01) continue;

        // Match found — mark as paid
        const sender = tx.transaction?.data?.sender ?? null;
        const updated = await prisma.paymentLink.update({
          where: { slug, status: 'active' },
          data: {
            status: 'paid',
            paidAt: new Date(),
            paidBy: sender,
            txDigest: tx.digest,
          },
        }).catch(() => null); // race condition: another request may have already marked it paid

        return NextResponse.json({
          status: 'paid',
          paidAt: updated?.paidAt?.toISOString() ?? new Date().toISOString(),
          txDigest: tx.digest,
          amountReceived: amountUsdc,
        });
      }
    }

    return NextResponse.json({ status: 'active', paidAt: null });
  } catch {
    return NextResponse.json({ status: 'active', paidAt: null });
  }
}
