-- SPEC_AUDRIC_STREAM_RESUME Phase 1 (2026-05-24) — track the active
-- resumable-stream id per chat so GET /api/chat/[id]/stream can
-- resume in-flight streams after page reload / cold start / mobile
-- tab swap. Nullable: most chats have no in-flight stream at rest.
-- Additive column only; no backfill needed (existing rows correctly
-- have no active stream at migration time).

ALTER TABLE "Chat" ADD COLUMN "activeStreamId" TEXT;
