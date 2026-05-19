import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/payments/[slug]
 *
 * Public route — no auth required. Called by `/pay/[slug]` PayClient to
 * hydrate the receipt screen, and by the page's `generateMetadata` to
 * build the OG/Twitter tags.
 *
 * Ported from `apps/web/app/api/payments/[slug]/route.ts` GET handler
 * for Session 4 (v0.7c Phase 6). Behaviour preservation:
 *   - Same status-derivation logic (expired vs overdue vs raw status).
 *   - Same response shape (slug / nonce / type / recipient / amount /
 *     currency / label / memo / status / paymentMethod / paidAt / paidBy
 *     / txDigest / invoice-fields / link-fields / createdAt).
 *   - Same null-on-missing pattern for optional fields.
 *
 * PATCH (cancel) + DELETE handlers from the legacy route are intentionally
 * NOT ported. Per Session 4 audit, the only legacy consumer was
 * `components/panels/PayPanel.tsx` which dies with `/new` in v0.7e
 * Tier B sweep. If a v2 surface ever needs cancel/delete, port them then.
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
  const isOverdue =
    payment.type === "invoice" &&
    payment.dueDate &&
    payment.dueDate < now &&
    payment.status === "active";
  const effectiveStatus = isExpired
    ? "expired"
    : isOverdue
      ? "overdue"
      : payment.status;

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
    ...(payment.type === "invoice" && {
      lineItems: payment.lineItems,
      dueDate: payment.dueDate?.toISOString() ?? null,
      billToName: payment.recipientName,
      billToEmail: payment.recipientEmail,
      senderName: payment.senderName,
    }),
    ...(payment.type === "link" && {
      expiresAt: payment.expiresAt?.toISOString() ?? null,
    }),
    createdAt: payment.createdAt.toISOString(),
  });
}
