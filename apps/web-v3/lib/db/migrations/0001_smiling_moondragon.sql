-- Private Memory "forget all" epoch. Recall/save namespace the memory under
-- `address` (epoch 0) or `address#vN` (epoch N); bumping it makes prior
-- memories un-recallable while the encrypted Walrus blobs expire on their own.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "memoryEpoch" integer DEFAULT 0 NOT NULL;
