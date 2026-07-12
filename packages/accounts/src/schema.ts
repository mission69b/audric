import type { InferSelectModel } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  json,
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

// Structured per-request usage events for the Private API (SPEC_T2000_API_V2 §6).
// The /v1 route WRITES one row per metered completion; the console READS them
// for the My-usage screen (tokens by model · spend · requests). Distinct from
// CreditLedger (which only carries a debit + description string) so dashboards
// have queryable dimensions. `ref` (= completion id) is unique → idempotent,
// mirrors the matching ledger debit.
export const apiUsageEvent = pgTable(
  "ApiUsageEvent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => user.id),
    /** The ApiKey row that authenticated the call (soft-deleted on revoke). */
    keyId: uuid("keyId")
      .notNull()
      .references(() => apiKey.id),
    model: varchar("model", { length: 96 }).notNull(),
    inputTokens: integer("inputTokens").notNull().default(0),
    outputTokens: integer("outputTokens").notNull().default(0),
    /** Micro-USD charged for this request (positive magnitude of the debit). */
    costMicros: bigint("costMicros", { mode: "number" }).notNull().default(0),
    privacyTier: varchar("privacyTier", {
      enum: ["private", "confidential"],
    }).notNull(),
    /** Completion id — unique, mirrors the CreditLedger debit ref (idempotent). */
    ref: text("ref"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => ({
    userTimeIdx: index("ApiUsageEvent_userId_createdAt_idx").on(
      t.userId,
      t.createdAt
    ),
    refUnique: uniqueIndex("ApiUsageEvent_ref_unique").on(t.ref),
  })
);

export type ApiUsageEvent = InferSelectModel<typeof apiUsageEvent>;

// The curated storefront categories (agents.t2000.ai chips). Server-validated
// at declaration time (`/v1/agent/service/prepare`) — never free text. Extend
// deliberately; every value here becomes a public filter chip.
export const AGENT_CATEGORIES = [
  "ai-models",
  "data-feeds",
  "finance",
  "research",
  "dev-tools",
  "creative",
  "other",
] as const;

export type AgentCategory = (typeof AGENT_CATEGORIES)[number];

// Agent ID directory index (SPEC_AGENT_ID B.1 gate 6 — the "default profile"
// layer). A lightweight, queryable cache of on-chain `agent_id::registry`
// identities so agents are browsable/searchable (the Sui-native 8004scan) WITHOUT
// reading the chain per view. Keyed by the agent's Sui address (= the identity).
// Write-through on register (instant for agents onboarded via us); a poll-cron
// backfills numericId + third-party registrations + active/owner (fast-follow).
// Rich/owned profile (services, image) lives off-chain via metadataUri (Walrus,
// gate 8); this table holds only the cheap, directory-level fields.
export const agentProfile = pgTable(
  "AgentProfile",
  {
    /** The agent's Sui address — the canonical identity + primary key. */
    address: text("address").primaryKey().notNull(),
    /** ERC-8004-style numeric id (from the registry counter). Null until the
     *  cron decodes the AgentRegistered event (write-through doesn't have it). */
    numericId: integer("numericId"),
    /** Display name — defaults to a generated `agent-<6hex>`; the agent can
     *  override via its owned profile (gate 8). */
    name: text("name").notNull(),
    /** The confirmed owner Passport (set by OwnerLinked); null = autonomous. */
    owner: text("owner"),
    /** A proposed owner awaiting confirmation (two-sided link). Null once
     *  confirmed (→ owner) or never proposed. Powers "agents awaiting your
     *  confirmation" in the console. */
    pendingOwner: text("pendingOwner"),
    /** Off-chain rich profile pointer (registration-v1 JSON on Walrus). */
    metadataUri: text("metadataUri"),
    active: boolean("active").notNull().default(true),
    // Editable rich-profile fields (gate 8c — DB-backed "owned profile"). Set by
    // the agent (signed request) now; owner-editable + Walrus-pinned later (paid).
    // Identity stays on-chain; this is the convenience presentation layer.
    displayName: text("displayName"),
    imageUrl: text("imageUrl"),
    description: text("description"),
    // Off-chain social links (rich profile — owner/agent-editable). Full https
    // URLs; rendered as link-outs on the directory profile.
    website: text("website"),
    twitter: text("twitter"),
    github: text("github"),
    // Synced from chain by the cron (directory columns): the agent's MCP service
    // endpoint + its declared payment methods (e.g. ["x402"]) → Service / x402.
    mcpEndpoint: text("mcpEndpoint"),
    paymentMethods: json("paymentMethods").$type<string[]>(),
    // Off-chain directory category (curated enum — see AGENT_CATEGORIES).
    // Validated server-side.
    category: text("category"),
    /** The register transaction digest (CREATED TX) — captured at submit-time
     *  write-through. Null for third-party agents we didn't sponsor (the cron
     *  has no cheap way to backfill it); surfaced as a Suiscan link when set. */
    registerDigest: text("registerDigest"),
    /** Owner-side "remove from my console" (S.690). Off-chain display state —
     *  hides the agent from the owner's My-agents/earnings surfaces (and
     *  dismisses an unwanted ownership proposal). The chain record persists
     *  (the registry has no delete); the cron never touches this field. */
    archivedAt: timestamp("archivedAt"),
    /** ADMIN delist (S.701) — platform-level directory moderation for keyless
     *  junk/test registrations (the registry is permissionless + append-only;
     *  the on-chain record persists, our directory just stops listing it).
     *  Set only by ops scripts; the cron never touches this field. */
    delistedAt: timestamp("delistedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    activeCreatedIdx: index("AgentProfile_active_createdAt_idx").on(
      t.active,
      t.createdAt
    ),
    ownerIdx: index("AgentProfile_owner_idx").on(t.owner),
    pendingOwnerIdx: index("AgentProfile_pendingOwner_idx").on(t.pendingOwner),
  })
);

export type AgentProfile = InferSelectModel<typeof agentProfile>;
