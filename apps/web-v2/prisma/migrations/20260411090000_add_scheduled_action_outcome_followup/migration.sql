-- CreateTable
CREATE TABLE "ScheduledAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "asset" TEXT NOT NULL DEFAULT 'USDC',
    "targetAsset" TEXT,
    "cronExpr" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "confirmationsRequired" INTEGER NOT NULL DEFAULT 5,
    "confirmationsCompleted" INTEGER NOT NULL DEFAULT 0,
    "totalExecutions" INTEGER NOT NULL DEFAULT 0,
    "totalAmountUsdc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastExecutedAt" TIMESTAMP(3),
    "lastSkippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutcomeCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adviceLogId" TEXT NOT NULL,
    "checkType" TEXT NOT NULL,
    "expectedValue" DOUBLE PRECISION,
    "actualValue" DOUBLE PRECISION,
    "deltaUsdc" DOUBLE PRECISION,
    "onTrack" BOOLEAN,
    "suiQueryAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutcomeCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpQueue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "adviceLogId" TEXT,
    "outcomeCheckId" TEXT,
    "message" TEXT NOT NULL,
    "ctaType" TEXT,
    "ctaAmount" DOUBLE PRECISION,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveryMethod" TEXT NOT NULL DEFAULT 'in_app',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledAction_userId_enabled_idx" ON "ScheduledAction"("userId", "enabled");
CREATE INDEX "ScheduledAction_nextRunAt_enabled_idx" ON "ScheduledAction"("nextRunAt", "enabled");

-- CreateIndex
CREATE INDEX "OutcomeCheck_userId_idx" ON "OutcomeCheck"("userId");
CREATE INDEX "OutcomeCheck_adviceLogId_idx" ON "OutcomeCheck"("adviceLogId");

-- CreateIndex
CREATE INDEX "FollowUpQueue_userId_sentAt_idx" ON "FollowUpQueue"("userId", "sentAt");
CREATE INDEX "FollowUpQueue_scheduledFor_sentAt_idx" ON "FollowUpQueue"("scheduledFor", "sentAt");
CREATE INDEX "FollowUpQueue_triggerType_idx" ON "FollowUpQueue"("triggerType");

-- AddForeignKey
ALTER TABLE "ScheduledAction" ADD CONSTRAINT "ScheduledAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeCheck" ADD CONSTRAINT "OutcomeCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutcomeCheck" ADD CONSTRAINT "OutcomeCheck_adviceLogId_fkey" FOREIGN KEY ("adviceLogId") REFERENCES "AdviceLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpQueue" ADD CONSTRAINT "FollowUpQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
