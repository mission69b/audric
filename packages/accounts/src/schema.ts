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
    /** The ApiKey row that authenticated the call (soft-deleted on revoke).
     * NULL for source='chat' rows — in-app turns have no API key. */
    keyId: uuid("keyId").references(() => apiKey.id),
    model: varchar("model", { length: 96 }).notNull(),
    /** Where the tokens were served: the /v1 API or in-app Audric chat.
     * Chat rows joined the stream 2026-07-20 (S.777) — earlier chat usage
     * was ledger-only and is NOT backfilled. */
    source: varchar("source", { enum: ["api", "chat"] })
      .notNull()
      .default("api"),
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

// ── Services (t2 ACP Phase 1 — SPEC_ACP_SUI §4.1) ──────────────────────────
// A structured, fixed-price unit of deliverable work attached to an Agent ID.
// THE seller primitive: sellers register services (name/price/SLA/schema),
// buyers fund a2a_escrow Jobs against them. Registry data lives here (D-2:
// DB now, chain-anchor later); the MONEY is always on-chain in the Job.
export const agentService = pgTable(
  "AgentService",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    /** The selling agent's Sui address (= its Agent ID). */
    agentAddress: text("agentAddress")
      .notNull()
      .references(() => agentProfile.address),
    /** Machine name, unique per agent — `t2 job create --service <slug>`. */
    slug: varchar("slug", { length: 48 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description").notNull(),
    /** Fixed price in micro-USDC (1 USDC = 1_000_000) — exact, no float. */
    priceMicroUsdc: bigint("priceMicroUsdc", { mode: "number" }).notNull(),
    /** Delivery SLA in minutes → the Job's deliver-by deadline at create. */
    slaMinutes: integer("slaMinutes").notNull(),
    /** Buyer review window (minutes) after delivery; lapse = auto-release. */
    reviewWindowMinutes: integer("reviewWindowMinutes").notNull().default(1440),
    /** Buyer share (bps) if they reject — fixed into the Job at create. */
    rejectSplitBps: integer("rejectSplitBps").notNull().default(8000),
    /** What the buyer must provide: a JSON-schema object (validated at buy
     *  time) or a free-text string. Null = no requirements. */
    requirements: json("requirements").$type<unknown>(),
    /** What the buyer receives (deliverable description). */
    deliverable: text("deliverable").notNull(),
    /** Retire = soft-delete (existing funded jobs keep settling on-chain). */
    retiredAt: timestamp("retiredAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    agentSlugUnique: uniqueIndex("AgentService_agent_slug_unique").on(
      t.agentAddress,
      t.slug
    ),
    agentIdx: index("AgentService_agentAddress_idx").on(t.agentAddress),
    liveIdx: index("AgentService_retiredAt_createdAt_idx").on(
      t.retiredAt,
      t.createdAt
    ),
  })
);

export type AgentService = InferSelectModel<typeof agentService>;

// Content-addressed job-spec store (t2 ACP Phase 1). The buyer's requirements
// payload, keyed by its sha256 — the SAME hash the buyer pins on-chain as the
// Job's `spec_hash`, so the content is tamper-evident (recompute + compare).
// This is the readable side of the spec channel until/unless specs move to
// Walrus; the hash contract wouldn't change.
export const jobSpec = pgTable("JobSpec", {
  /** sha256 hex (no 0x) of the exact UTF-8 content. */
  hash: varchar("hash", { length: 64 }).primaryKey().notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type JobSpec = InferSelectModel<typeof jobSpec>;

// ── Escrow job index (t2 ACP Phase 1, item 4 — the provider inbox) ─────────
// A read-model of on-chain a2a_escrow Jobs, built from the contract's own
// Move events (JobCreated/Delivered/Released/Rejected/Refunded) by the
// GraphQL event indexer in web-v3. The chain is the source of truth; these
// rows are a queryable cache ("jobs where seller = me") that captures EVERY
// job regardless of entry path — sponsored routes, CLI, or someone calling
// the contract directly. Never write these rows from app code paths; only
// the indexer (idempotent upserts keyed on jobId + monotonic state).
export const escrowJob = pgTable(
  "EscrowJob",
  {
    /** The on-chain Job object id. */
    jobId: text("jobId").primaryKey().notNull(),
    buyer: text("buyer").notNull(),
    seller: text("seller").notNull(),
    /** Escrowed amount in micro-USDC. */
    amountMicroUsdc: bigint("amountMicroUsdc", { mode: "number" }).notNull(),
    feeBps: integer("feeBps").notNull(),
    rejectSplitBps: integer("rejectSplitBps").notNull(),
    deliverByMs: bigint("deliverByMs", { mode: "number" }).notNull(),
    reviewWindowMs: bigint("reviewWindowMs", { mode: "number" }).notNull(),
    /** Lifecycle: funded → delivered → released | rejected; funded → refunded. */
    state: varchar("state", { length: 12 }).notNull(),
    /** Base64 delivery hash once delivered. */
    deliveryHash: text("deliveryHash"),
    /** Protocol fee actually taken at settlement (release/reject), micro-USDC. */
    feeAmountMicroUsdc: bigint("feeAmountMicroUsdc", { mode: "number" }),
    /** True when a lapsed review window was cranked (vs buyer accept). */
    byTimeout: boolean("byTimeout"),
    createdTxDigest: text("createdTxDigest").notNull(),
    /** On-chain timestamps (ms) from the events. */
    createdAtMs: bigint("createdAtMs", { mode: "number" }).notNull(),
    updatedAtMs: bigint("updatedAtMs", { mode: "number" }).notNull(),
  },
  (t) => ({
    sellerIdx: index("EscrowJob_seller_state_idx").on(t.seller, t.state),
    buyerIdx: index("EscrowJob_buyer_idx").on(t.buyer),
    createdIdx: index("EscrowJob_createdAtMs_idx").on(t.createdAtMs),
  })
);

export type EscrowJob = InferSelectModel<typeof escrowJob>;

// ── Job reviews (t2 ACP Phase 1, item 6) ────────────────────────────────────
// Receipt-bound star reviews on RELEASED escrow Jobs — the store-era pattern
// (one review per settlement, buyer-signed, upsert to edit) rebuilt on the
// Job object id as the binding key. Eligibility is proven against the CHAIN
// at write time (job exists, state == released, signer == buyer, buyer !=
// seller) — a review can never exist without the money having moved.
export const jobReview = pgTable(
  "JobReview",
  {
    /** The released Job object id — the receipt. One review per job. */
    jobId: text("jobId").primaryKey().notNull(),
    seller: text("seller").notNull(),
    buyer: text("buyer").notNull(),
    /** 1–5. */
    stars: integer("stars").notNull(),
    /** Optional short review text (≤400 chars, enforced at the API). */
    text: text("text"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    sellerIdx: index("JobReview_seller_createdAt_idx").on(
      t.seller,
      t.createdAt
    ),
  })
);

export type JobReview = InferSelectModel<typeof jobReview>;

// Generic named cursor for pollers (currently just the escrow-job event
// indexer; the value is an opaque GraphQL pagination cursor).
export const indexerCursor = pgTable("IndexerCursor", {
  name: varchar("name", { length: 32 }).primaryKey().notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type IndexerCursor = InferSelectModel<typeof indexerCursor>;
