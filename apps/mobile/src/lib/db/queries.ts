import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  chat,
  type ChatRow,
  document,
  message,
  type MessageRow,
  stream,
  suggestion,
  user,
  vote,
} from "./schema";

// Query layer — the native mirror of web-v3's `lib/db/queries.ts`, same function
// names + semantics. Every call no-ops (or returns empty) when the DB is absent
// (`getDb()` → null), so callers never branch on "is there a DB".

// Create the user row if it does not exist. Called at ONBOARDING (first entry into
// the authed app). Idempotent: a returning user's row is left untouched. `id` is the
// Sui address (dev stub `0xde…` today; the derived address once Phase 0 lands).
export async function upsertUser(input: {
  id: string;
  email?: string | null;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .insert(user)
    .values({ id: input.id, email: input.email ?? null })
    .onConflictDoNothing();
}

// Ensure the chat thread exists (create-if-absent). Idempotent per turn — the first
// message of a thread creates it; every later turn is a no-op conflict.
export async function saveChat(input: {
  id: string;
  userId: string;
  title: string;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .insert(chat)
    .values({
      id: input.id,
      userId: input.userId,
      title: input.title,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}

export async function getChatById(id: string): Promise<ChatRow | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(chat).where(eq(chat.id, id)).limit(1);
  return rows[0] ?? null;
}

// Persist messages. Conflict-on-id is ignored so re-sending an already-saved id
// (mobile posts the FULL history each turn) never duplicates a row.
export type SaveMessageInput = {
  id: string;
  chatId: string;
  role: string;
  parts: unknown;
  attachments?: unknown;
  createdAt?: Date;
};

export async function saveMessages(rows: SaveMessageInput[]): Promise<void> {
  const db = getDb();
  if (!db || rows.length === 0) return;
  await db
    .insert(message)
    .values(
      rows.map((r) => ({
        id: r.id,
        chatId: r.chatId,
        role: r.role,
        parts: r.parts,
        attachments: r.attachments ?? [],
        createdAt: r.createdAt ?? new Date(),
      }))
    )
    .onConflictDoNothing();
}

// Newest-first list of a user's threads (drawer history).
export async function getChatsByUserId(userId: string): Promise<ChatRow[]> {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(chat)
    .where(eq(chat.userId, userId))
    .orderBy(desc(chat.createdAt));
}

// A thread's messages in send order (opening a past chat).
export async function getMessagesByChatId(
  chatId: string
): Promise<MessageRow[]> {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(message)
    .where(eq(message.chatId, chatId))
    .orderBy(asc(message.createdAt));
}

// Delete a thread + its messages, but ONLY if it belongs to this user (ownership
// check guards the unauthenticated dev route). FK order: messages first, then chat.
export async function deleteChatById(input: {
  id: string;
  userId: string;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  const owned = await db
    .select({ id: chat.id })
    .from(chat)
    .where(and(eq(chat.id, input.id), eq(chat.userId, input.userId)))
    .limit(1);
  if (owned.length === 0) return;
  await db.delete(message).where(eq(message.chatId, input.id));
  await db.delete(chat).where(eq(chat.id, input.id));
}

// "Delete all chats" — remove every thread this user owns, plus each thread's FK
// children (votes, messages, resumable streams) in FK-safe order. Mirrors web-v3's
// `deleteAllChatsByUserId`. Returns the number of chats removed (0 when none / no DB).
export async function deleteAllChatsByUserId(input: {
  userId: string;
}): Promise<{ deletedCount: number }> {
  const db = getDb();
  if (!db) return { deletedCount: 0 };
  const owned = await db
    .select({ id: chat.id })
    .from(chat)
    .where(eq(chat.userId, input.userId));
  if (owned.length === 0) return { deletedCount: 0 };
  const chatIds = owned.map((c) => c.id);
  await db.delete(vote).where(inArray(vote.chatId, chatIds));
  await db.delete(message).where(inArray(message.chatId, chatIds));
  await db.delete(stream).where(inArray(stream.chatId, chatIds));
  await db.delete(chat).where(eq(chat.userId, input.userId));
  return { deletedCount: chatIds.length };
}

// "Purge all my data" also drops artifact Documents (+ their Suggestion children).
// Mirrors web-v3's `deleteAllDocumentsByUserId`. Mobile never creates documents, but
// a web-app user has them, and the purge copy promises "artifacts" are removed.
export async function deleteAllDocumentsByUserId(input: {
  userId: string;
}): Promise<{ deletedCount: number }> {
  const db = getDb();
  if (!db) return { deletedCount: 0 };
  await db.delete(suggestion).where(eq(suggestion.userId, input.userId));
  const deleted = await db
    .delete(document)
    .where(eq(document.userId, input.userId))
    .returning({ id: document.id });
  return { deletedCount: deleted.length };
}

// "Forget all my memories" — bump the user's memory epoch so recall/save move to a
// fresh namespace and every prior memory is never recalled again. The old encrypted
// Walrus blobs are left to expire on their own. Returns the new epoch (0 when no DB).
// Mirrors web-v3's `incrementMemoryEpoch`; mobile omits web-v3's `updatedAt` bump
// (that column isn't in this minimal mirror).
export async function incrementMemoryEpoch(userId: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const [row] = await db
    .update(user)
    .set({ memoryEpoch: sql`${user.memoryEpoch} + 1` })
    .where(eq(user.id, userId))
    .returning({ memoryEpoch: user.memoryEpoch });
  return row?.memoryEpoch ?? 0;
}
