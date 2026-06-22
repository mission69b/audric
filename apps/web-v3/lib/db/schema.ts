import type { InferSelectModel } from "drizzle-orm";
import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Audric v3: the user id is the zkLogin Sui address (text, 0x… 66 chars),
// not a uuid — it's supplied at sign-in (no defaultRandom). Upserted by the
// session mint route (verified email captured there too, §6b).
export const user = pgTable("User", {
  id: text("id").primaryKey().notNull(),
  email: varchar("email", { length: 100 }),
  password: varchar("password", { length: 64 }),
  name: text("name"),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  isAnonymous: boolean("isAnonymous").notNull().default(false),
  // @audric handle (Identity) — the bare leaf label; on-chain it's
  // `<username>.audric.sui`, displayed as `username@audric`. Unique mirror of
  // the on-chain leaf for fast collision checks.
  username: varchar("username", { length: 20 }).unique(),
  usernameUpdatedAt: timestamp("usernameUpdatedAt"),
  usernameMintTxDigest: text("usernameMintTxDigest"),
  // Credit rail (Phase 5). Balance is derived from CreditLedger (SUM), not
  // stored here. These are the funding-edge + config fields.
  stripeCustomerId: text("stripeCustomerId"),
  /** Saved Stripe PaymentMethod for off-session auto-recharge (card-only). */
  defaultPaymentMethodId: text("defaultPaymentMethodId"),
  autoRechargeEnabled: boolean("autoRechargeEnabled").notNull().default(false),
  /** Whole-USD threshold/amount for auto-recharge. */
  autoRechargeThresholdUsd: integer("autoRechargeThresholdUsd")
    .notNull()
    .default(5),
  autoRechargeAmountUsd: integer("autoRechargeAmountUsd").notNull().default(20),
  /** Closed-loop credit terms acceptance (recorded at first top-up). */
  closedLoopAcceptedAt: timestamp("closedLoopAcceptedAt"),
  /** Subscription (scaffold — inert until Stripe Price IDs are provisioned). */
  subscriptionTier: varchar("subscriptionTier", {
    enum: ["free", "pro", "proPlus", "max"],
  })
    .notNull()
    .default("free"),
  subscriptionStatus: varchar("subscriptionStatus", { length: 32 }),
  stripeSubscriptionId: text("stripeSubscriptionId"),
  /** Private Memory "forget all" epoch. Recall + save use namespace
   *  `address` (epoch 0) or `address#vN` (epoch N), so bumping it makes prior
   *  memories un-recallable (a clean slate); the old encrypted Walrus blobs
   *  expire on their own. (Provable on-chain erasure awaits a MemWal forget op.) */
  memoryEpoch: integer("memoryEpoch").notNull().default(0),
  /** When the welcome email was sent (auto on first sign-in OR the one-off
   *  blast). Gates the welcome to exactly once across both paths; null means
   *  "never welcomed", so a missed/failed send self-heals on the next sign-in
   *  (the `isNew` insert-vs-update flag couldn't — it only ever fires once). */
  welcomeEmailSentAt: timestamp("welcomeEmailSentAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type User = InferSelectModel<typeof user>;

// Append-only credit ledger (Phase 5, SPEC_AUDRIC_TOPUP_METERING). Balance =
// SUM(amountMicros) per user. Signed micro-USD (1 USD = 1_000_000) so tiny
// per-token debits stay exact (no float). `ref` is unique (when set) so a
// Stripe event / metered turn is only ever applied ONCE (idempotency).
export const creditLedger = pgTable(
  "CreditLedger",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => user.id),
    amountMicros: bigint("amountMicros", { mode: "number" }).notNull(),
    type: varchar("type", {
      enum: ["topup", "debit", "recharge", "grant", "refund", "adjustment"],
    }).notNull(),
    description: text("description"),
    ref: text("ref"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("CreditLedger_userId_idx").on(t.userId),
    refUnique: uniqueIndex("CreditLedger_ref_unique").on(t.ref),
  })
);

export type CreditLedger = InferSelectModel<typeof creditLedger>;

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
    userId: text("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
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
