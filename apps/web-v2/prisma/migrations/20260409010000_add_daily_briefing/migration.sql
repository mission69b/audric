-- CreateTable
CREATE TABLE "DailyBriefing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "emailSentAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "chargeDigest" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyBriefing_userId_date_key" ON "DailyBriefing"("userId", "date");

-- CreateIndex
CREATE INDEX "DailyBriefing_userId_dismissedAt_idx" ON "DailyBriefing"("userId", "dismissedAt");

-- AddForeignKey
ALTER TABLE "DailyBriefing" ADD CONSTRAINT "DailyBriefing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
