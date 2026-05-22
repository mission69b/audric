-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "suiAddress" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'link',
    "status" TEXT NOT NULL DEFAULT 'active',
    "amount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USDC',
    "label" TEXT,
    "memo" TEXT,
    "senderName" TEXT,
    "lineItems" JSONB,
    "dueDate" TIMESTAMP(3),
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "sentAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "txDigest" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_slug_key" ON "Payment"("slug");

-- CreateIndex
CREATE INDEX "Payment_userId_status_idx" ON "Payment"("userId", "status");

-- CreateIndex
CREATE INDEX "Payment_suiAddress_idx" ON "Payment"("suiAddress");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_dueDate_status_idx" ON "Payment"("dueDate", "status");

-- Migrate PaymentLink rows into Payment (type = 'link')
INSERT INTO "Payment" (
    "id", "slug", "nonce", "userId", "suiAddress",
    "type", "status", "amount", "currency", "label", "memo",
    "paidAt", "paidBy", "txDigest", "expiresAt",
    "createdAt", "updatedAt"
)
SELECT
    "id", "slug", gen_random_uuid()::text, "userId", "suiAddress",
    'link', "status", "amount", "currency", "label", "memo",
    "paidAt", "paidBy", "txDigest", "expiresAt",
    "createdAt", "updatedAt"
FROM "PaymentLink";

-- Migrate Invoice rows into Payment (type = 'invoice')
-- Prefix invoice IDs with 'inv_' to avoid any collision with PaymentLink IDs
INSERT INTO "Payment" (
    "id", "slug", "nonce", "userId", "suiAddress",
    "type", "status", "amount", "currency", "label", "memo",
    "lineItems", "dueDate", "recipientName", "recipientEmail",
    "sentAt", "reminderSentAt",
    "paidAt", "paidBy", "txDigest",
    "createdAt", "updatedAt"
)
SELECT
    'inv_' || "id", "slug", gen_random_uuid()::text, "userId", "suiAddress",
    'invoice',
    CASE WHEN "status" = 'pending' THEN 'active' ELSE "status" END,
    "amount", "currency", "label", "memo",
    "items", "dueDate", "recipientName", "recipientEmail",
    "sentAt", "reminderSentAt",
    "paidAt", "paidBy", "txDigest",
    "createdAt", "updatedAt"
FROM "Invoice";

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "PaymentLink" DROP CONSTRAINT "PaymentLink_userId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_userId_fkey";

-- DropTable
DROP TABLE "PaymentLink";

-- DropTable
DROP TABLE "Invoice";
