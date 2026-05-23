-- V07E_INVOICE_DEPRECATION / S.269 item 7 (2026-05-23)
-- Founder lock Q1-Q5 (V07E_INVOICE_DEPRECATION.md):
--   Q1 = A (ship as last item of S.269, today)
--   Q2 = C (delete prod rows directly — no archive)
--   Q3 = A (engine MINOR bump, 2.16.0 → 2.17.0)
--   Q4 = A (wipe invoice mentions from docs/copy)
--   Q5 = A (Phase 4 same-day as Phase 3)
--
-- Pre-migration prod state (queried 2026-05-23 via prisma):
--   - 50 invoice rows total ($1,020,408.99 sum)
--   - 46 active invoices ($1,020,351 — likely one $1M+ test row)
--   - 3 paid invoices ($7.99 — small test transactions)
--   - 1 cancelled invoice ($50)
-- Operational risk of dropping the 3 paid rows: $7.99. Q2=C accepted.
--
-- After this migration the only legal `Payment.type` is 'link' (enforced
-- by CHECK constraint). Invoice tools were already removed from the
-- engine in 2.17.0 (Phase 1) and the API rejects type=invoice writes
-- with 410 Gone (Phase 4); this migration drops the now-orphaned rows
-- and columns from the schema.

BEGIN;

-- Sanity check: rows we expect to delete. If this is wildly different
-- from the pre-flight count (50), an operator should pause and verify
-- before letting the migration proceed.
DO $$
DECLARE
  invoice_count INT;
  paid_count INT;
BEGIN
  SELECT COUNT(*) INTO invoice_count FROM "Payment" WHERE type = 'invoice';
  SELECT COUNT(*) INTO paid_count FROM "Payment" WHERE type = 'invoice' AND status = 'paid';
  RAISE NOTICE '[V07E_INVOICE_DEPRECATION] Deleting % invoice rows (% paid)', invoice_count, paid_count;
END $$;

-- Step 1: delete invoice rows. Safe pre-Phase-4 because:
--   - engine 2.17.0 has no create/list/cancel_invoice tools
--   - /api/internal/payments POST rejects type=invoice with 410 Gone
--   - GET /api/payments/[slug] still resolves invoice rows up until
--     this DELETE — graceful pre-cutover; after, those slugs 404
--     (the row is gone), which is the correct end-state per founder
--     Q4 (clean slate).
DELETE FROM "Payment" WHERE type = 'invoice';

-- Step 2: drop the invoice-only index. Must happen before the
-- column drop because Postgres rejects "DROP COLUMN" if a
-- still-existent index references it.
DROP INDEX IF EXISTS "Payment_dueDate_status_idx";

-- Step 3: drop the 6 invoice-only columns. Each column was nullable
-- and unused on type='link' rows, so the drop is safe and reversible
-- via re-add (data is gone but the schema can be reinstated).
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "lineItems";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "dueDate";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "recipientName";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "recipientEmail";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "sentAt";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "reminderSentAt";

-- Step 4: enforce that no further invoice rows can ever be inserted.
-- Postgres CHECK constraint catches any code path that bypasses the
-- API gate (Phase 4) and writes directly to the table.
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_type_link_only"
  CHECK ("type" = 'link');

COMMIT;
