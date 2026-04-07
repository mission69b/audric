-- CreateTable
CREATE TABLE "AppEvent" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" JSONB,
    "digest" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppEvent_address_createdAt_idx" ON "AppEvent"("address", "createdAt");

-- CreateIndex
CREATE INDEX "AppEvent_address_type_createdAt_idx" ON "AppEvent"("address", "type", "createdAt");
