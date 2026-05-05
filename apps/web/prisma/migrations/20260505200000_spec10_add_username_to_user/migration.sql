-- [SPEC 10 v0.2.1 Phase A.2] Audric Passport Identity — username + audit fields on User
--
-- Adds the 4 fields needed for `username.audric.sui` leaf-subname identity:
--
--   * username              — bare label (e.g. "alice"); full handle is
--                             computed at render time as "alice.audric.sui".
--                             NULL for unclaimed users (most current users
--                             post-migration); unique across non-NULL values.
--   * usernameClaimedAt     — first claim timestamp; NULL if never claimed.
--   * usernameLastChangedAt — most recent rename timestamp; NULL if never
--                             changed (renames are FREE UNLIMITED per D4).
--   * usernameMintTxDigest  — on-chain digest of the leaf creation tx;
--                             useful for support / audit / "show me when I
--                             claimed it" UX. Updated on every rename.
--
-- Why a unique index on `username`:
--   PostgreSQL's standard semantics allow multiple NULL values to coexist
--   in a UNIQUE column, which is exactly what we want: every unclaimed user
--   shares NULL, and any claimed user MUST be unique. The DB-side check
--   lets /api/identity/check?username=alice fail-fast on a same-Audric
--   collision before hitting the SuiNS chain RPC (which is the slower
--   defense-in-depth check; SuiNS itself enforces uniqueness on-chain).
--
-- Backfill: NONE required. All existing User rows get NULL for the 4
-- new fields, which is the correct "not yet claimed" state. Users will
-- claim their handle via the picker introduced in Phase B.1.
--
-- Contacts (UserPreferences.contacts) are NOT touched here — they remain
-- a Json column. The shape evolution from `{name, address}` (legacy) to
-- `{name, identifier, resolvedAddress, audricUsername?, addedAt, source}`
-- (unified per SPEC 10 D7) is handled by a Zod parse boundary in
-- `apps/web/lib/identity/contact-schema.ts` — additive, lazy-on-read,
-- behavior-preserving by construction. See the SPEC 10 build-plan
-- addendum (B-5) for the rationale.

ALTER TABLE "User"
  ADD COLUMN "username"              TEXT,
  ADD COLUMN "usernameClaimedAt"     TIMESTAMP(3),
  ADD COLUMN "usernameLastChangedAt" TIMESTAMP(3),
  ADD COLUMN "usernameMintTxDigest"  TEXT;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
