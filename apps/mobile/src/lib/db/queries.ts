import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "./client";
import { chat, type ChatRow, message, type MessageRow, user } from "./schema";

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
