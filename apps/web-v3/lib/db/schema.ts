import { user } from "@audric/accounts/schema";
import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// The identity · credit · API-key substrate now lives in @audric/accounts
// (shared with apps/console — SPEC_T2000_API_V2 §2). `user` is imported for the
// FK references below; all three tables + types are re-exported so existing
// `@/lib/db/schema` imports keep working unchanged. Migrations are still
// orchestrated here (drizzle.config reads this file, which surfaces the tables).
export {
  type AgentProfile,
  type ApiKey,
  type ApiUsageEvent,
  agentProfile,
  apiKey,
  apiUsageEvent,
  type CreditLedger,
  creditLedger,
  type User,
  user,
} from "@audric/accounts/schema";

// Referral tracking ("Give $X, Get $X"). One row per referred signup; status
// flips pending -> rewarded on the referee's first qualifying PAID action
// (handled in the Stripe webhook). The reward credits themselves are
// `CreditLedger` rows (type "referral", ref-unique) — this table tracks the
// relationship + reward state. See SPEC_AUDRIC_REFERRALS.md.
export const referral = pgTable(
  "Referral",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    referrerId: text("referrerId")
      .notNull()
      .references(() => user.id),
    refereeId: text("refereeId")
      .notNull()
      .references(() => user.id),
    code: text("code").notNull(),
    status: varchar("status", { enum: ["pending", "rewarded", "rejected"] })
      .notNull()
      .default("pending"),
    rewardedAt: timestamp("rewardedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    // One referral relationship per referee — a user can be referred only once.
    refereeUnique: uniqueIndex("Referral_referee_unique").on(t.refereeId),
    referrerIdx: index("Referral_referrer_idx").on(t.referrerId),
  })
);

export type Referral = InferSelectModel<typeof referral>;

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

export type Chat = InferSelectModel<typeof chat>;

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

export type DBMessage = InferSelectModel<typeof message>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chatId, table.messageId] }),
  })
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    // For kind:'image' — which image model produced it (lightbox "Details" +
    // audit). Null for non-image / pre-existing docs.
    model: text("model"),
    userId: text("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
    // Powers the daily free-image count (COUNT image docs / user / day).
    userKindCreatedIdx: index("Document_userId_kind_createdAt_idx").on(
      table.userId,
      table.kind,
      table.createdAt
    ),
  })
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: text("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;
