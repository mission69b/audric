-- [S.261 — 2026-05-23] Schema trim follow-on to S.254.
--
-- S.254 (2026-05-22) dropped dead TABLES (`ConversationLog`, `WatchAddress`,
-- `LinkedWallet`) + the `UserPreferences.contacts` column. This migration
-- drops the dead COLUMNS that survived that pass on the `User` model.
-- Each target verified via grep across web-v2 + engine + sdk for ZERO
-- runtime read/write call sites before deletion.
--
--   * `email` (String, UNIQUE)             — never written by Prisma in app
--     code. Always read via `decodeJwtClaim(session.jwt, "email")` from the
--     zkLogin JWT. The DB column was a relic of the pre-zkLogin / Resend
--     verify-link era.
--
--   * `emailVerified` (Boolean, default false) — schema comment in
--     `app/api/user/status/route.ts:31` (S.254 era) already documented this
--     as dead: *"the Resend verify-link flow is gone. The DB column stays
--     for legacy / debugging but is no longer authoritative."* The
--     authoritative source is the JWT's `email_verified` claim via
--     `isJwtEmailVerified(jwt)`.
--
--   * `timezoneOffset` (Int, default 0)    — DOA. Never written or read in
--     app code. Default 0 for every row in production. Possibly intended
--     for a localized session-window calculation that never shipped.
--
--   * `tosAcceptedAt` (DateTime?)          — partially-dead. Written by the
--     `POST /api/user/tos-accept` route + read by `GET /api/user/status`
--     (which exposes a `tosAccepted: boolean` flag in its response), but
--     no UI consumer ever read the flag back. The TOS modal that used to
--     call `acceptTos()` from `useUserStatus` was retired with the apps/web
--     archive. Companion changes shipped in this commit:
--       - DELETED `app/api/user/tos-accept/route.ts`
--       - REMOVED `tosAcceptedAt` select + `tosAccepted` field from
--         `app/api/user/status/route.ts`
--       - REMOVED `tosAccepted` + `acceptTos` from `hooks/use-user-status.ts`
--
-- Indexes `User_email_idx` and `User_emailVerified_timezoneOffset_idx` are
-- dropped explicitly because Postgres cleans up indexes referencing dropped
-- columns automatically, but explicit DROP IF EXISTS keeps the migration
-- readable + idempotent.
--
-- IRREVERSIBLE. Take a Neon PITR snapshot if you need a rollback path.

-- DropIndex
DROP INDEX IF EXISTS "User_email_idx";
DROP INDEX IF EXISTS "User_emailVerified_timezoneOffset_idx";

-- DropIndex (UNIQUE on email)
DROP INDEX IF EXISTS "User_email_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN IF EXISTS "email";
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerified";
ALTER TABLE "User" DROP COLUMN IF EXISTS "timezoneOffset";
ALTER TABLE "User" DROP COLUMN IF EXISTS "tosAcceptedAt";
