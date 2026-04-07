-- Backfill: copy existing ServicePurchase rows into AppEvent so the activity
-- feed only needs to query one table. Uses NOT EXISTS to skip any that were
-- already written by the dual-write path (recordPurchase $transaction).

INSERT INTO "AppEvent" ("id", "address", "type", "title", "details", "digest", "createdAt")
SELECT
  'sp-' || sp."id",
  sp."address",
  'pay',
  'Paid $' || to_char(sp."amountUsd", 'FM990.000') || ' for ' || replace(replace(sp."serviceId", '-', ' '), '_', ' '),
  jsonb_build_object('service', sp."serviceId", 'amount', sp."amountUsd", 'productId', sp."productId"),
  NULL,
  sp."createdAt"
FROM "ServicePurchase" sp
WHERE NOT EXISTS (
  SELECT 1 FROM "AppEvent" ae
  WHERE ae."address" = sp."address"
    AND ae."type" = 'pay'
    AND ae."createdAt" = sp."createdAt"
);
