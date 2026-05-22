-- CreateTable
CREATE TABLE "UserFinancialProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "riskAppetite" TEXT NOT NULL DEFAULT 'moderate',
    "financialLiteracy" TEXT NOT NULL DEFAULT 'intermediate',
    "prefersBriefResponses" BOOLEAN NOT NULL DEFAULT false,
    "prefersExplainers" BOOLEAN NOT NULL DEFAULT true,
    "currencyFraming" TEXT NOT NULL DEFAULT 'usdc',
    "primaryGoals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "knownPatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "riskConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "literacyConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inferenceVersion" INTEGER NOT NULL DEFAULT 1,
    "lastInferredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFinancialProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memoryType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "originalQuote" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceSessionId" TEXT,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserFinancialProfile_userId_key" ON "UserFinancialProfile"("userId");

-- CreateIndex
CREATE INDEX "UserFinancialProfile_userId_idx" ON "UserFinancialProfile"("userId");

-- CreateIndex
CREATE INDEX "UserMemory_userId_idx" ON "UserMemory"("userId");

-- CreateIndex
CREATE INDEX "UserMemory_userId_active_idx" ON "UserMemory"("userId", "active");

-- CreateIndex
CREATE INDEX "UserMemory_expiresAt_idx" ON "UserMemory"("expiresAt");

-- AddForeignKey
ALTER TABLE "UserFinancialProfile" ADD CONSTRAINT "UserFinancialProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
