import type { InferSelectModel } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────────
// @audric/accounts — the shared substrate (identity · credit · API keys).
// ONE source of truth for these tables, imported by BOTH audric/web-v3 (consumer)
// and apps/console (the t2000 developer platform), pointing at ONE Postgres.
// Migrations are orchestrated from web-v3 (its drizzle.config sees these tables
// via re-export) — no journal split. (SPEC_T2000_API_V2 §2.)
// ─────────────────────────────────────────────────────────────────────────────

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
  /** Standing "custom instructions" — always injected into the system prompt,
   *  EVERY turn (unlike relevance-recalled Private Memory). Holds behavioral
   *  directives the user sets explicitly: language to respond in, tone, persona,
   *  what to call them, response format. Separate from memory by design (memory
   *  = facts recalled when relevant; this = behavior applied unconditionally). */
  customInstructions: text("customInstructions"),
  /** When the welcome email was sent (auto on first sign-in OR the one-off
   *  blast). Gates the welcome to exactly once across both paths; null means
   *  "never welcomed", so a missed/failed send self-heals on the next sign-in
   *  (the `isNew` insert-vs-update flag couldn't — it only ever fires once). */
  welcomeEmailSentAt: timestamp("welcomeEmailSentAt"),
  /** This user's own referral code (lazily generated); shared as
   *  `audric.ai/?ref=<code>`. Unique short code, not the @audric handle. */
  referralCode: varchar("referralCode", { length: 12 }).unique(),
  /** The referrer's user.id, captured once at signup from a `?ref=` cookie.
   *  Immutable after set; drives the referral reward on first paid action. */
  referredBy: text("referredBy"),
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
      enum: [
        "topup",
        "debit",
        "recharge",
        "grant",
        "refund",
        "adjustment",
        "referral",
      ],
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

// Private Inference API keys (SPEC_AUDRIC_API v1). A Pro/Max subscriber mints
// `sk-…` keys to call the OpenAI-compatible API (api.t2000.ai). We store ONLY
// the SHA-256 hash of the key (never the secret) + a short prefix for display
// ("sk-…a1b2"). Calls debit the same CreditLedger as in-app turns; the
// per-token billing rail is reused 1:1 (no separate price book).
export const apiKey = pgTable(
  "ApiKey",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => user.id),
    /** SHA-256 hex of the full secret. Unique → O(1) auth lookup. */
    hashedKey: text("hashedKey").notNull(),
    /** Display-only tail, e.g. "sk-…a1b2" (never the full secret). */
    keyPrefix: varchar("keyPrefix", { length: 16 }).notNull(),
    /** User-set label, e.g. "production agent". */
    name: varchar("name", { length: 64 }),
    lastUsedAt: timestamp("lastUsedAt"),
    /** Soft-delete: set on revoke. Revoked keys never authenticate. */
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    hashUnique: uniqueIndex("ApiKey_hashedKey_unique").on(t.hashedKey),
    userIdx: index("ApiKey_userId_idx").on(t.userId),
  })
);

export type ApiKey = InferSelectModel<typeof apiKey>;
