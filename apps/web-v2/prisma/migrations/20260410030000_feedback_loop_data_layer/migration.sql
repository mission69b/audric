-- AlterTable: AppEvent — add feedback loop fields
ALTER TABLE "AppEvent" ADD COLUMN "adviceLogId" TEXT;
ALTER TABLE "AppEvent" ADD COLUMN "goalId" TEXT;
ALTER TABLE "AppEvent" ADD COLUMN "suiTxVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppEvent" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'chat';

-- CreateIndex
CREATE INDEX "AppEvent_adviceLogId_idx" ON "AppEvent"("adviceLogId");
CREATE INDEX "AppEvent_goalId_idx" ON "AppEvent"("goalId");

-- CreateTable
CREATE TABLE "AdviceLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "adviceText" TEXT NOT NULL,
    "adviceType" TEXT NOT NULL,
    "targetAmount" DOUBLE PRECISION,
    "goalId" TEXT,
    "actionTaken" BOOLEAN NOT NULL DEFAULT false,
    "appEventId" TEXT,
    "followUpDue" TIMESTAMP(3),
    "followUpSent" BOOLEAN NOT NULL DEFAULT false,
    "outcomeStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdviceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdviceLog_userId_idx" ON "AdviceLog"("userId");
CREATE INDEX "AdviceLog_outcomeStatus_idx" ON "AdviceLog"("outcomeStatus");
CREATE INDEX "AdviceLog_followUpDue_idx" ON "AdviceLog"("followUpDue");
CREATE INDEX "AdviceLog_createdAt_idx" ON "AdviceLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AdviceLog" ADD CONSTRAINT "AdviceLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdviceLog" ADD CONSTRAINT "AdviceLog_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "SavingsGoalDeposit" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountUsdc" DOUBLE PRECISION NOT NULL,
    "appEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsGoalDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavingsGoalDeposit_goalId_idx" ON "SavingsGoalDeposit"("goalId");
CREATE INDEX "SavingsGoalDeposit_userId_idx" ON "SavingsGoalDeposit"("userId");

-- AddForeignKey
ALTER TABLE "SavingsGoalDeposit" ADD CONSTRAINT "SavingsGoalDeposit_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SavingsGoalDeposit" ADD CONSTRAINT "SavingsGoalDeposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
