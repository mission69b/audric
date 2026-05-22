-- CreateIndex (partial unique -- only non-null txDigest values)
CREATE UNIQUE INDEX "Payment_txDigest_key" ON "Payment"("txDigest");
