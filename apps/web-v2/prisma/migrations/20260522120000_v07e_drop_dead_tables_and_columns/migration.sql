-- [v0.7e Phase 5 cleanup / S.254 — 2026-05-22]
--
-- Drop dead Prisma models + columns identified in the cross-repo audit
-- following the apps/web archive. Each target verified via grep for
-- ZERO call sites in web-v2 + engine + sdk before deletion.
--
--   * ConversationLog (model + table)  — zero writers anywhere; the only
--     consumer was the retention cron (DELETE-only). Cron + route deleted
--     alongside this migration. Was a v0.6-era audit log of every chat
--     message + tool call (alongside Anthropic billing telemetry);
--     superseded by AI SDK's native message persistence (Chat + Message
--     models in S.247) which already captures everything we need.
--
--   * WatchAddress (model + table)     — zero call sites. Multi-wallet
--     watch-only addresses feature retired silently in early 2026.
--
--   * LinkedWallet  (model + table)    — zero call sites. Multi-wallet
--     linking feature retired silently; current zkLogin flow is single-
--     wallet-per-Google-account by construction.
--
--   * UserPreferences.contacts (column) — retired in S.243 ("Contacts
--     Phase 2 - Prisma drop"). web-v2 `/api/user/preferences` already
--     returns `contacts: []` ignoring the underlying column; nothing
--     writes to it. Privacy policy updated in the same commit to remove
--     "Saved contacts" from the "What we collect" list.
--
-- ServicePurchase (model + table) is INTENTIONALLY PRESERVED. The
-- `pay_api` engine tool that wrote new rows was deleted in S.245, but
-- the historical commerce rows are still useful for analytics and the
-- upcoming Audric Store SPEC will reuse this table shape.
--
-- UserPreferences.limits is PRESERVED — heavily used by the USD-aware
-- permission resolver (see chat/route.ts line ~561).
--
-- IRREVERSIBLE. Take a Neon PITR snapshot if you need a rollback path.

-- DropForeignKey
ALTER TABLE "ConversationLog" DROP CONSTRAINT IF EXISTS "ConversationLog_userId_fkey";
ALTER TABLE "WatchAddress" DROP CONSTRAINT IF EXISTS "WatchAddress_userId_fkey";
ALTER TABLE "LinkedWallet" DROP CONSTRAINT IF EXISTS "LinkedWallet_userId_fkey";

-- DropTable
DROP TABLE IF EXISTS "ConversationLog";
DROP TABLE IF EXISTS "WatchAddress";
DROP TABLE IF EXISTS "LinkedWallet";

-- AlterTable (drop UserPreferences.contacts column)
ALTER TABLE "UserPreferences" DROP COLUMN IF EXISTS "contacts";
