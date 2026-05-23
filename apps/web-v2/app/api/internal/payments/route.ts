import { isValidSuiAddress } from "@mysten/sui/utils";
import { type NextRequest, NextResponse } from "next/server";
import { audricWebUrl } from "@/lib/audric-web-url";
import { validateInternalKey } from "@/lib/internal-auth";
import { prisma } from "@/lib/prisma";
import { generateSlug } from "@/lib/slug";

/**
 * POST /api/internal/payments
 * Called by the engine's create_payment_link tool.
 * Auth: x-internal-key + x-sui-address
 *
 * [V07E_INVOICE_DEPRECATION / S.269 item 7 — 2026-05-23] Pre-deprecation
 * the body discriminated on `{ type: 'link' | 'invoice' }` and the engine
 * had matching `create_invoice` / `create_payment_link` tools. Phase 1
 * deleted the invoice tools; Phase 4 (this layer) makes the rejection
 * structural — `type='invoice'` returns 410 Gone with a hint that
 * payment links cover the use case. Pre-existing invoice rows in DB
 * keep resolving via GET /api/payments/[slug] until Phase 5 drops them.
 *
 * Body shape post-deprecation: `{ amount, label?, memo?, expiresInHours? }`.
 * The `type` field is no longer accepted; if present and not "link", we
 * reject. The 6 invoice-only fields (`recipientName`, `recipientEmail`,
 * `dueDays`, `items`) are also rejected — defensive against any
 * un-updated caller.
 */
export async function POST(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get("x-internal-key"));
  if ("error" in auth) {
    return auth.error;
  }

  const suiAddress = request.headers.get("x-sui-address");
  if (!suiAddress || !isValidSuiAddress(suiAddress)) {
    return NextResponse.json(
      { error: "Missing or invalid x-sui-address" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: {
    type?: "link" | "invoice";
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // [V07E_INVOICE_DEPRECATION Phase 4] Reject invoice intents at the
  // API layer. Payment links cover the use case — encode invoice
  // context in label/memo.
  if (body.type === "invoice") {
    return NextResponse.json(
      {
        error:
          "Invoices have been deprecated — use payment links instead. Encode invoice context in the label and memo (e.g. label='Web design — March 2026', memo='Net 30').",
      },
      { status: 410 }
    );
  }
  if (body.type !== undefined && body.type !== "link") {
    return NextResponse.json(
      { error: 'type must be "link" (the only supported type)' },
      { status: 400 }
    );
  }

  if (
    body.amount == null ||
    typeof body.amount !== "number" ||
    body.amount <= 0
  ) {
    return NextResponse.json(
      { error: "Amount must be a positive number" },
      { status: 400 }
    );
  }

  if (body.label && body.label.length > 200) {
    return NextResponse.json(
      { error: "Label must be 200 characters or fewer" },
      { status: 400 }
    );
  }
  if (body.memo && body.memo.length > 500) {
    return NextResponse.json(
      { error: "Memo must be 500 characters or fewer" },
      { status: 400 }
    );
  }

  const slug = generateSlug(8);

  const expiresAt =
    body.expiresInHours && body.expiresInHours > 0
      ? new Date(Date.now() + body.expiresInHours * 3_600_000)
      : null;

  const payment = await prisma.payment.create({
    data: {
      slug,
      userId: user.id,
      suiAddress,
      type: "link",
      amount: body.amount,
      currency: body.currency ?? "USDC",
      label: body.label?.trim() ?? null,
      memo: body.memo ?? null,
      expiresAt,
    },
    select: {
      slug: true,
      nonce: true,
      amount: true,
      currency: true,
      label: true,
      memo: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  const url = audricWebUrl(`/pay/${payment.slug}`);

  return NextResponse.json(
    {
      slug: payment.slug,
      nonce: payment.nonce,
      url,
      amount: payment.amount,
      currency: payment.currency,
      label: payment.label,
      memo: payment.memo,
      expiresAt: payment.expiresAt?.toISOString() ?? null,
    },
    { status: 201 }
  );
}

/**
 * PATCH /api/internal/payments
 * Cancel a payment by slug (owner only, via internal key).
 * Body: { slug, action: 'cancel' }
 */
export async function PATCH(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get("x-internal-key"));
  if ("error" in auth) {
    return auth.error;
  }

  const suiAddress = request.headers.get("x-sui-address");
  if (!suiAddress || !isValidSuiAddress(suiAddress)) {
    return NextResponse.json(
      { error: "Missing or invalid x-sui-address" },
      { status: 400 }
    );
  }

  let body: { slug: string; action: "cancel" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.slug || body.action !== "cancel") {
    return NextResponse.json(
      { error: "slug and action=cancel required" },
      { status: 400 }
    );
  }

  const payment = await prisma.payment.findUnique({
    where: { slug: body.slug },
  });
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  if (payment.suiAddress !== suiAddress) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  if (payment.status === "paid") {
    return NextResponse.json(
      { error: "Cannot cancel a paid payment" },
      { status: 409 }
    );
  }
  if (payment.status === "cancelled") {
    return NextResponse.json({ error: "Already cancelled" }, { status: 409 });
  }

  const updated = await prisma.payment.update({
    where: { slug: body.slug },
    data: { status: "cancelled" },
  });

  return NextResponse.json({ slug: updated.slug, status: updated.status });
}

/**
 * GET /api/internal/payments
 * Returns the user's payments (most recent 20).
 *
 * [V07E_INVOICE_DEPRECATION Phase 4] `?type=invoice` is rejected with 410
 * Gone. `?type=link` is accepted (still the canonical filter the engine
 * tool sends). No filter (or any other value) returns all rows of the
 * user — defensive: pre-Phase-5 invoice rows still exist in DB and the
 * agent shouldn't have to learn a different filter to surface them.
 */
export async function GET(request: NextRequest) {
  const auth = validateInternalKey(request.headers.get("x-internal-key"));
  if ("error" in auth) {
    return auth.error;
  }

  const suiAddress = request.headers.get("x-sui-address");
  if (!suiAddress || !isValidSuiAddress(suiAddress)) {
    return NextResponse.json(
      { error: "Missing or invalid x-sui-address" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { suiAddress },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ payments: [] });
  }

  const typeFilter = request.nextUrl.searchParams.get("type");
  if (typeFilter === "invoice") {
    return NextResponse.json(
      {
        error:
          "Invoices have been deprecated — list payment links instead (filter ?type=link or omit type).",
      },
      { status: 410 }
    );
  }

  const where: Record<string, unknown> = { userId: user.id };
  if (typeFilter === "link") {
    where.type = typeFilter;
  }

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      slug: true,
      nonce: true,
      amount: true,
      currency: true,
      label: true,
      status: true,
      paymentMethod: true,
      expiresAt: true,
      paidAt: true,
      createdAt: true,
    },
  });

  const now = new Date();

  return NextResponse.json({
    payments: payments.map((p) => {
      const isExpired =
        p.expiresAt && p.expiresAt < now && p.status === "active";

      return {
        slug: p.slug,
        url: audricWebUrl(`/pay/${p.slug}`),
        amount: p.amount,
        currency: p.currency,
        label: p.label,
        status: isExpired ? "expired" : p.status,
        paymentMethod: p.paymentMethod,
        paidAt: p.paidAt?.toISOString() ?? null,
        expiresAt: p.expiresAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      };
    }),
  });
}
