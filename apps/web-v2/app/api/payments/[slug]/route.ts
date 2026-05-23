import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/payments/[slug]
 *
 * Public route — no auth required. Called by `/pay/[slug]` PayClient to
 * hydrate the receipt screen, and by the page's `generateMetadata` to
 * build the OG/Twitter tags.
 *
 * [V07E_INVOICE_DEPRECATION / S.269 item 7 — 2026-05-23] Phase 3 collapses
 * the response shape to the link path. Pre-deprecation the handler split
 * the response on `payment.type` to spread invoice-specific fields
 * (`lineItems`, `dueDate`, `billToName`, `billToEmail`, `senderName`) for
 * `type='invoice'` rows. Phase 5 drops those columns from the schema,
 * so the spread is removed now in service of column drop. Existing
 * `type='invoice'` rows still resolve via this handler (the row exists
 * until Phase 5 migration deletes it) but only the link-shape fields
 * surface. PayClient renders them as plain payment links — graceful
 * degradation; their slug URLs still resolve to a payable amount.
 *
 * `overdue` derivation is also dropped — invoice-only signal whose
 * column source (`dueDate`) is gone in Phase 5. Status remains the raw
 * payment.status; `expired` derivation stays (link-applicable).
 *
 * Runtime: nodejs (the Next.js 16 Cache Components default — the legacy
 * `export const runtime = 'nodejs'` is rejected at build time).
 */

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;

  const payment = await prisma.payment.findUnique({ where: { slug } });
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const now = new Date();
  const isExpired =
    payment.expiresAt && payment.expiresAt < now && payment.status === "active";
  const effectiveStatus = isExpired ? "expired" : payment.status;

  const user = await prisma.user.findUnique({
    where: { id: payment.userId },
    select: { displayName: true },
  });

  return NextResponse.json({
    slug: payment.slug,
    nonce: payment.nonce,
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
    expiresAt: payment.expiresAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  });
}
