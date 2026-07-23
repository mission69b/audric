import {
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Mobile-local Drizzle schema. A DELIBERATELY MINIMAL mirror of the subset of
// web-v3's tables this app writes to, the same way `catalog.ts` mirrors
// `models.ts`/`tiers.ts`. Drizzle maps to a physical table by its NAME string, so
// these definitions target the EXACT same rows web-v3 owns on the shared Neon DB —
// they are not a second schema, just the columns the native app touches.
//
// Source of truth is web-v3's `lib/db/schema.ts` (User in `@audric/accounts`, Chat
// + Message_v2 in web-v3). Keep column names/types in lockstep with it. The full
// table (all of User's credit/Stripe/memory columns) is created + owned by web-v3;
// every column omitted here is NOT NULL-with-a-DB-default there, so a partial
// INSERT from mobile is valid and the DB fills the rest.

// User — id is the Sui address (text). We only ever create the row (id + email) at
// onboarding; all other columns default server-side. Never a wallet write.
// `memoryEpoch` mirrors web-v3's forget-all epoch (`@audric/accounts`): bumping it
// moves recall/save to a fresh namespace so prior memories are never recalled again.
// It's `NOT NULL default 0` there, so it's always present on an existing row — mobile
// only ever UPDATEs it (never inserts it), which is why `upsertUser` can still omit it.
export const user = pgTable("User", {
  id: text("id").primaryKey().notNull(),
  email: varchar("email", { length: 100 }),
  memoryEpoch: integer("memoryEpoch").notNull().default(0),
});

// Chat — one thread. `createdAt` has NO default in web-v3, so it must be supplied
// on insert. `visibility` mirrors web-v3's enum + default.
export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
});

// Message_v2 — a single turn's message, `parts` + `attachments` as JSON exactly
// like web-v3 (the UIMessage shape `useChat` speaks). `createdAt` + `attachments`
// are NOT NULL with no default → both supplied on insert.
export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

// FK children of Chat / User that a user-wide purge must clear BEFORE the parent
// rows, or Postgres' FK constraints block the delete. Mobile never writes any of
// these (web-v3 owns votes, resumable streams, and artifact documents), but a user
// who also uses the web app WILL have such rows pointing at their chats/account —
// so a correct "delete/purge all" from the phone has to clear them too. These are
// DELIBERATELY MINIMAL mirrors: only the columns the bulk deletes filter on.
export const vote = pgTable("Vote_v2", {
  chatId: uuid("chatId").notNull(),
  messageId: uuid("messageId").notNull(),
});

export const stream = pgTable("Stream", {
  id: uuid("id").notNull().defaultRandom(),
  chatId: uuid("chatId").notNull(),
});

// Document (artifacts) + Suggestion — cleared by "Purge all my data". Suggestion is
// an FK child of Document, so it goes first (mirrors web-v3 `deleteAllDocumentsByUserId`).
export const document = pgTable("Document", {
  id: uuid("id").notNull().defaultRandom(),
  userId: text("userId").notNull(),
});

export const suggestion = pgTable("Suggestion", {
  id: uuid("id").notNull().defaultRandom(),
  userId: text("userId").notNull(),
});

export type ChatRow = typeof chat.$inferSelect;
export type MessageRow = typeof message.$inferSelect;
