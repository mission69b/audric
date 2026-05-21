-- [v0.7e Persistent Chats (S.247) — 2026-05-22] Add Chat / Message / Vote.
--
-- Activates the dormant chat-persistence stack that the Vercel AI SDK
-- chatbot template shipped with web-v2 in v0.7c. Per LOCK-1 (prisma rewrite)
-- this REPLACES the drizzle layer at `apps/web-v2/lib/db/{schema,queries,
-- migrations}` — Phase 2.2 of BENEFITS_SPEC_v07e_persistent_chats.md
-- removes the drizzle directory and deps once Phase 1 ships.
--
-- LOCK-2 (vote KEEP / artifact STRIP): Vote table ports for eval-loop
-- signal collection. Document + Suggestion tables intentionally NOT
-- ported — Audric has no artifact panel surface.
--
-- LOCK-4 (engine StreamCheckpointStore wins): Stream table intentionally
-- NOT ported — engine v2.2.0 Slice C owns resume-on-reload. Dual-tracking
-- through a parallel drizzle Stream registry would create silent drift.
--
-- FK pivot: Chat.userSuiAddress → User.suiAddress (not User.id) because
-- session.user.id post-zkLogin = canonical Sui address per
-- `audric-auth.ts:289`. Routing via suiAddress saves a lookup hop on
-- every chat-save and matches every other write surface in the app.
--
-- Title is nullable on first insert so the route can persist with a
-- placeholder and kick off the async Haiku summariser (LOCK-5) without
-- blocking the user-perceived first turn. The sidebar shows "Generating
-- title…" or a first-50-chars fallback while null.
--
-- Sample analytics queries:
--   -- Chats created per day (last 14d)
--   SELECT DATE("createdAt") AS d, COUNT(*) AS chats
--   FROM "Chat" WHERE "createdAt" > NOW() - INTERVAL '14 days'
--   GROUP BY 1 ORDER BY 1 DESC;
--
--   -- Vote signal density (assistant turns with feedback)
--   SELECT "isUpvoted", COUNT(*) FROM "Vote" GROUP BY 1;
--
-- Cascade is safe — deleting a User cascades to their Chats; deleting a
-- Chat cascades to its Messages and Votes.

CREATE TABLE "Chat" (
    "id"             TEXT         NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "title"          TEXT,
    "visibility"     TEXT         NOT NULL DEFAULT 'private',
    "userSuiAddress" TEXT         NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Chat_userSuiAddress_createdAt_idx"
    ON "Chat" ("userSuiAddress", "createdAt");

CREATE INDEX "Chat_visibility_idx" ON "Chat" ("visibility");

CREATE TABLE "Message" (
    "id"          TEXT         NOT NULL,
    "chatId"      TEXT         NOT NULL,
    "role"        TEXT         NOT NULL,
    "parts"       JSONB        NOT NULL,
    "attachments" JSONB        NOT NULL DEFAULT '[]',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Message_chatId_createdAt_idx"
    ON "Message" ("chatId", "createdAt");

CREATE TABLE "Vote" (
    "chatId"    TEXT    NOT NULL,
    "messageId" TEXT    NOT NULL,
    "isUpvoted" BOOLEAN NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("chatId", "messageId")
);

ALTER TABLE "Chat"
    ADD CONSTRAINT "Chat_userSuiAddress_fkey"
    FOREIGN KEY ("userSuiAddress") REFERENCES "User" ("suiAddress")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message"
    ADD CONSTRAINT "Message_chatId_fkey"
    FOREIGN KEY ("chatId") REFERENCES "Chat" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Vote"
    ADD CONSTRAINT "Vote_chatId_fkey"
    FOREIGN KEY ("chatId") REFERENCES "Chat" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Vote"
    ADD CONSTRAINT "Vote_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "Message" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
