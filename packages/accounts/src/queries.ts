import "server-only";

import {
  and,
  avg,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
  sum,
} from "drizzle-orm";
import { db } from "./db";
import {
  type AgentService,
  type AgentProfile,
  type ApiKey,
  agentService,
  agentProfile,
  apiKey,
  apiUsageEvent,
  creditLedger,
  type AgentToken,
  agentToken,
  type EscrowJob,
  escrowJob,
  type FeeClaim,
  feeClaim,
  indexerCursor,
  type JobReview,
  jobReview,
  jobSpec,
  type User,
  user,
} from "./schema";

// ── Identity ─────────────────────────────────────────────────────────────────

export async function getUserById(id: string): Promise<User | undefined> {
  const [row] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  return row;
}

/** Resolve a claimed @handle (the unique `username` column) to its user —
 *  powers agents.t2000.ai/@handle vanity URLs. Case-insensitive would need a
 *  citext/index migration; handles are minted lowercase, so exact-match works
 *  against lowercased input. */
export async function getUserByUsername(
  username: string
): Promise<User | undefined> {
  const [row] = await db
    .select()
    .from(user)
    .where(eq(user.username, username.toLowerCase()))
    .limit(1);
  return row;
}

/** Batched reverse lookup: user ids (= Passport addresses) → claimed
 *  @handles. Powers the store's `@handle · #id` card lines — one query per
 *  page render, only rows that actually claimed a username come back. */
export async function getUsernamesByIds(
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ id: user.id, username: user.username })
    .from(user)
    .where(inArray(user.id, ids));
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.username) {
      map.set(row.id, row.username);
    }
  }
  return map;
}

// ── Agent ID directory (gate 6) ──────────────────────────────────────────────

/** A generated default display name from the address (e.g. `agent-3948c`). The
 *  agent overrides it via its owned profile (gate 8). */
export function defaultAgentName(address: string): string {
  return `agent-${address.replace(/^0x/, "").slice(0, 6)}`;
}

/** Write-through upsert on register. Sets a generated name on first insert;
 *  re-registers/refreshes are a no-op-ish touch (name preserved). The cron
 *  later backfills numericId/owner/active. */
export async function upsertAgentProfile(opts: {
  address: string;
  numericId?: number | null;
  owner?: string | null;
  pendingOwner?: string | null;
  active?: boolean;
  metadataUri?: string | null;
  mcpEndpoint?: string | null;
  paymentMethods?: string[] | null;
  /** Off-chain directory category (curated enum) — preserve-on-undefined,
   *  the cron never clears it. */
  category?: string | null;
  /** The register tx digest (CREATED TX). Only the register write-through has
   *  it — always preserve-on-undefined (the cron + third-party path never
   *  carry it, so they must not clobber a captured digest). */
  registerDigest?: string | null;
  /** The on-chain `updated_at_ms` (the cron reads it from the record). When
   *  provided, `updatedAt` reflects real chain-state-change time rather than
   *  "last synced" — gives an honest 8004scan-style LAST UPDATED. */
  chainUpdatedAtMs?: number | null;
  /** When true (the cron, which reads full chain state), null values CLEAR the
   *  field (e.g. pendingOwner cleared after a confirm). Write-through omits it,
   *  so a bare touch never clobbers. */
  authoritative?: boolean;
}): Promise<void> {
  const now = new Date();
  const auth = opts.authoritative === true;
  // `pick`: the cron (authoritative) writes nulls through to clear; the
  // write-through path leaves unset fields untouched (undefined).
  const pick = <T>(v: T | null | undefined): T | null | undefined =>
    auth ? (v ?? null) : (v ?? undefined);
  // LAST UPDATED tracks on-chain state changes (chain `updated_at_ms`); fall
  // back to wall-clock for the bare write-through that has no chain timestamp.
  const updatedAt =
    opts.chainUpdatedAtMs == null ? now : new Date(opts.chainUpdatedAtMs);
  await db
    .insert(agentProfile)
    .values({
      address: opts.address,
      name: defaultAgentName(opts.address),
      numericId: opts.numericId ?? null,
      owner: opts.owner ?? null,
      pendingOwner: opts.pendingOwner ?? null,
      active: opts.active ?? true,
      metadataUri: opts.metadataUri ?? null,
      mcpEndpoint: opts.mcpEndpoint ?? null,
      paymentMethods: opts.paymentMethods ?? null,
      category: opts.category ?? null,
      registerDigest: opts.registerDigest ?? null,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: agentProfile.address,
      set: {
        numericId: pick(opts.numericId),
        owner: pick(opts.owner),
        pendingOwner: pick(opts.pendingOwner),
        active: opts.active ?? undefined,
        metadataUri: pick(opts.metadataUri),
        mcpEndpoint: pick(opts.mcpEndpoint),
        paymentMethods: pick(opts.paymentMethods),
        // Off-chain: always preserve-on-undefined (cron never clears them).
        category: opts.category ?? undefined,
        // CREATED TX never changes; preserve unless this writer supplies it.
        registerDigest: opts.registerDigest ?? undefined,
        updatedAt,
      },
    });
}

/** Resolve an agent by its ERC-8004-style numeric id (Store v2 Phase 3 —
 *  the legible `agents.t2000.ai/16` URLs). */
export async function getAgentProfileByNumericId(
  numericId: number
): Promise<AgentProfile | undefined> {
  const [row] = await db
    .select()
    .from(agentProfile)
    .where(eq(agentProfile.numericId, numericId))
    .limit(1);
  return row;
}

/** Set the editable rich-profile fields (gate 8c). Only provided fields are
 *  written (undefined = leave as-is; pass null to clear). Auth (agent signature
 *  or owner session) is enforced by the caller. */
export async function setAgentProfileFields(
  address: string,
  fields: {
    displayName?: string | null;
    imageUrl?: string | null;
    description?: string | null;
    // Off-chain directory category (curated enum; caller validates).
    category?: string | null;
    // Off-chain social links (full https URLs).
    website?: string | null;
    twitter?: string | null;
    github?: string | null;
    // Service listing write-through (console seller flow) — mirrors what the
    // owner just set ON-CHAIN via registry `update`; the cron stays authority.
    mcpEndpoint?: string | null;
    paymentMethods?: string[] | null;
  }
): Promise<void> {
  const now = new Date();
  // Ensure the row exists (an agent may set a profile before the cron indexes
  // it), then apply only the provided fields.
  await db
    .insert(agentProfile)
    .values({
      address,
      name: defaultAgentName(address),
      displayName: fields.displayName ?? null,
      imageUrl: fields.imageUrl ?? null,
      description: fields.description ?? null,
      category: fields.category ?? null,
      website: fields.website ?? null,
      twitter: fields.twitter ?? null,
      github: fields.github ?? null,
      mcpEndpoint: fields.mcpEndpoint ?? null,
      paymentMethods: fields.paymentMethods ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: agentProfile.address,
      set: {
        displayName: fields.displayName,
        imageUrl: fields.imageUrl,
        description: fields.description,
        category: fields.category,
        website: fields.website,
        twitter: fields.twitter,
        github: fields.github,
        mcpEndpoint: fields.mcpEndpoint,
        paymentMethods: fields.paymentMethods,
        updatedAt: now,
      },
    });
}

/** Write-through the ownership-link fields right after the on-chain propose /
 *  confirm (instant, no cron lag). Only the provided fields are touched (null
 *  clears — e.g. `pendingOwner: null` on confirm). The cron stays the backstop
 *  + the authority for third-party links it never saw. */
export async function setAgentOwnership(
  address: string,
  fields: { owner?: string | null; pendingOwner?: string | null }
): Promise<void> {
  const now = new Date();
  await db
    .insert(agentProfile)
    .values({
      address,
      name: defaultAgentName(address),
      owner: fields.owner ?? null,
      pendingOwner: fields.pendingOwner ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: agentProfile.address,
      set: {
        ...(fields.owner === undefined ? {} : { owner: fields.owner }),
        ...(fields.pendingOwner === undefined
          ? {}
          : { pendingOwner: fields.pendingOwner }),
        updatedAt: now,
      },
    });
}

/** Agents related to `owner`: confirmed-owned + awaiting this owner's confirm.
 *  Powers the console "My agents" surface (gate 8b). */
export async function listAgentsForOwner(owner: string): Promise<{
  owned: AgentProfile[];
  pending: AgentProfile[];
  archived: AgentProfile[];
}> {
  const [owned, pending, archived] = await Promise.all([
    db
      .select()
      .from(agentProfile)
      .where(
        and(eq(agentProfile.owner, owner), isNull(agentProfile.archivedAt))
      )
      .orderBy(desc(agentProfile.createdAt)),
    db
      .select()
      .from(agentProfile)
      .where(
        and(
          eq(agentProfile.pendingOwner, owner),
          isNull(agentProfile.archivedAt)
        )
      )
      .orderBy(desc(agentProfile.createdAt)),
    // Removed-from-console rows (owned or dismissed proposals) — powers the
    // "Archived — restore" footer.
    db
      .select()
      .from(agentProfile)
      .where(
        and(
          isNotNull(agentProfile.archivedAt),
          or(
            eq(agentProfile.owner, owner),
            eq(agentProfile.pendingOwner, owner)
          )
        )
      )
      .orderBy(desc(agentProfile.createdAt)),
  ]);
  return { owned, pending, archived };
}

/** Owner-side archive toggle (S.690): hide an agent from (or restore it to)
 *  the owner's console surfaces. Authorization is the CALLER's job (owner or
 *  proposed-owner session). */
export async function setAgentArchived(
  address: string,
  archived: boolean
): Promise<void> {
  await db
    .update(agentProfile)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(agentProfile.address, address));
}

/** Display name + numeric id per address (lowercased keys) — the lookup
 *  every feed/inbox surface uses to render an agent instead of a raw 0x…. */
export async function getAgentNamesByAddresses(
  addresses: string[]
): Promise<Map<string, { name: string; numericId: number | null }>> {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  if (unique.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      address: agentProfile.address,
      name: agentProfile.name,
      displayName: agentProfile.displayName,
      numericId: agentProfile.numericId,
    })
    .from(agentProfile)
    .where(inArray(agentProfile.address, unique));
  return new Map(
    rows.map((r) => [
      r.address.toLowerCase(),
      { name: r.displayName ?? r.name, numericId: r.numericId },
    ])
  );
}

export async function getAgentProfile(
  address: string
): Promise<AgentProfile | undefined> {
  const [row] = await db
    .select()
    .from(agentProfile)
    .where(eq(agentProfile.address, address))
    .limit(1);
  return row;
}

/** Browse the directory, newest first (paginated). */
export async function listAgentProfiles(opts?: {
  limit?: number;
  offset?: number;
  /** Default true (Store v2 Phase 3): deactivated records (e.g. the retired
   *  seed shelf) stay out of the browsable directory; direct address URLs
   *  still resolve them. Pass false for the full registry. */
  activeOnly?: boolean;
}): Promise<{ agents: AgentProfile[]; total: number }> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const activeOnly = opts?.activeOnly !== false;
  // Admin-delisted rows (S.701) never list — the registry is permissionless
  // and append-only, so directory moderation is the only lever for keyless
  // junk registrations. Direct address URLs still resolve them.
  const where = activeOnly
    ? and(eq(agentProfile.active, true), isNull(agentProfile.delistedAt))
    : isNull(agentProfile.delistedAt);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(agentProfile)
      .where(where)
      .orderBy(desc(agentProfile.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(agentProfile).where(where),
  ]);
  return { agents: rows, total: totalRow?.value ?? 0 };
}

// ── Services (t2 ACP Phase 1 — SPEC_ACP_SUI §4.1) ──────────────────────────

/** Live services, newest first. Optional per-agent filter + naive text
 *  search (name/description ilike) — the `t2 browse` read path. */
export async function listServices(opts?: {
  agentAddress?: string;
  search?: string;
  includeRetired?: boolean;
  /** Board/search views: only list services whose seller is an active,
   *  non-delisted Agent ID (a deactivated agent shouldn't keep selling).
   *  The per-agent management view passes false — a seller can always see
   *  and retire their own rows. */
  visibleSellersOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ services: AgentService[]; total: number }> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const conditions: (SQL | undefined)[] = [];
  if (!opts?.includeRetired) {
    conditions.push(isNull(agentService.retiredAt));
  }
  if (opts?.visibleSellersOnly) {
    conditions.push(
      inArray(
        agentService.agentAddress,
        db
          .select({ address: agentProfile.address })
          .from(agentProfile)
          .where(
            and(
              eq(agentProfile.active, true),
              isNull(agentProfile.delistedAt)
            )
          )
      )
    );
  }
  if (opts?.agentAddress) {
    conditions.push(eq(agentService.agentAddress, opts.agentAddress));
  }
  if (opts?.search) {
    const q = `%${opts.search.replaceAll(/[%_]/g, "")}%`;
    conditions.push(
      or(
        ilike(agentService.name, q),
        ilike(agentService.description, q),
        ilike(agentService.deliverable, q)
      )
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(agentService)
      .where(where)
      .orderBy(desc(agentService.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(agentService).where(where),
  ]);
  return { services: rows, total: totalRow?.value ?? 0 };
}

export async function getService(
  agentAddress: string,
  slug: string
): Promise<AgentService | undefined> {
  const [row] = await db
    .select()
    .from(agentService)
    .where(
      and(
        eq(agentService.agentAddress, agentAddress),
        eq(agentService.slug, slug)
      )
    )
    .limit(1);
  return row;
}

/** Create or update an service (keyed agent+slug). Re-listing a retired slug
 *  revives it. Auth (agent signature) is the caller's job. */
export async function upsertService(service: {
  agentAddress: string;
  slug: string;
  name: string;
  description: string;
  priceMicroUsdc: number;
  slaMinutes: number;
  reviewWindowMinutes: number;
  rejectSplitBps: number;
  requirements: unknown;
  deliverable: string;
}): Promise<AgentService> {
  const now = new Date();
  const [row] = await db
    .insert(agentService)
    .values({ ...service, updatedAt: now })
    .onConflictDoUpdate({
      target: [agentService.agentAddress, agentService.slug],
      set: {
        name: service.name,
        description: service.description,
        priceMicroUsdc: service.priceMicroUsdc,
        slaMinutes: service.slaMinutes,
        reviewWindowMinutes: service.reviewWindowMinutes,
        rejectSplitBps: service.rejectSplitBps,
        requirements: service.requirements,
        deliverable: service.deliverable,
        retiredAt: null,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

/** Soft-retire an service (funded jobs keep settling on-chain regardless).
 *  Returns false when the agent has no such service. */
export async function retireService(
  agentAddress: string,
  slug: string
): Promise<boolean> {
  const rows = await db
    .update(agentService)
    .set({ retiredAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(agentService.agentAddress, agentAddress),
        eq(agentService.slug, slug),
        isNull(agentService.retiredAt)
      )
    )
    .returning({ id: agentService.id });
  return rows.length > 0;
}

/** Store a job-spec payload under its sha256 (idempotent — content-addressed,
 *  same hash = same content). The buyer pins this hash on-chain as the Job's
 *  `spec_hash`, so readers can verify integrity by recomputing. */
export async function putJobSpec(hash: string, content: string): Promise<void> {
  await db
    .insert(jobSpec)
    .values({ hash, content })
    .onConflictDoNothing({ target: jobSpec.hash });
}

export async function getJobSpec(hash: string): Promise<string | undefined> {
  const [row] = await db
    .select()
    .from(jobSpec)
    .where(eq(jobSpec.hash, hash))
    .limit(1);
  return row?.content;
}

// ── Credit rail (Phase 5) ────────────────────────────────────────────────────

/** Current credit balance in micro-USD (SUM of the append-only ledger). */
export async function getCreditBalanceMicros(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(creditLedger.amountMicros) })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId));
  return row?.total ? Number(row.total) : 0;
}

/**
 * Append a ledger entry. `ref` (Stripe event/session/turn id) is unique, so a
 * duplicate webhook or re-metered turn is a no-op. Returns true if it actually
 * wrote (false = already applied → idempotent skip).
 */
export async function recordCredit(entry: {
  userId: string;
  amountMicros: number;
  type:
    | "topup"
    | "debit"
    | "recharge"
    | "grant"
    | "refund"
    | "adjustment"
    | "referral";
  description?: string;
  ref?: string;
}): Promise<boolean> {
  // Invariant: a debit must never be positive (balance = SUM(amountMicros), so a
  // positive debit silently INFLATES the balance — the S.502 video sign bug).
  // Fail loud at the single chokepoint every credit path flows through.
  if (entry.type === "debit" && entry.amountMicros > 0) {
    throw new Error(
      `recordCredit: a debit must be <= 0, got ${entry.amountMicros} (${entry.description ?? ""})`
    );
  }
  const inserted = await db
    .insert(creditLedger)
    .values({
      userId: entry.userId,
      amountMicros: Math.round(entry.amountMicros),
      type: entry.type,
      description: entry.description,
      ref: entry.ref,
    })
    .onConflictDoNothing({ target: creditLedger.ref })
    .returning({ id: creditLedger.id });
  return inserted.length > 0;
}

export async function listCreditLedger(userId: string, limit = 50) {
  return await db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit);
}

// ── Billing config (shared User mutations — funding edge) ────────────────────

/** Persist the user's Stripe customer id (set once, never clobbered). */
export async function setStripeCustomerId(userId: string, customerId: string) {
  await db
    .update(user)
    .set({ stripeCustomerId: customerId, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

/** Toggle/configure card auto-recharge (the "never runs dry" config). */
export async function setAutoRecharge(
  userId: string,
  opts: { enabled: boolean; thresholdUsd?: number; amountUsd?: number }
) {
  await db
    .update(user)
    .set({
      autoRechargeEnabled: opts.enabled,
      ...(opts.thresholdUsd !== undefined && {
        autoRechargeThresholdUsd: opts.thresholdUsd,
      }),
      ...(opts.amountUsd !== undefined && {
        autoRechargeAmountUsd: opts.amountUsd,
      }),
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId));
}

/** Persist the user's default card for off-session auto-recharge. */
export async function setDefaultPaymentMethodId(userId: string, pmId: string) {
  await db
    .update(user)
    .set({ defaultPaymentMethodId: pmId, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

/** Record closed-loop credit terms acceptance (at first top-up/subscribe). */
export async function acceptClosedLoopTerms(userId: string) {
  await db
    .update(user)
    .set({ closedLoopAcceptedAt: new Date(), updatedAt: new Date() })
    .where(eq(user.id, userId));
}

// ── API usage events (SPEC_T2000_API_V2 §6) ─────────────────────────────────

/**
 * Record one structured usage event per metered completion. `ref` (= completion
 * id) is unique → idempotent (a re-metered turn is a no-op), mirroring the
 * matching CreditLedger debit. Best-effort caller; never block the response.
 */
export async function recordApiUsage(event: {
  userId: string;
  /** Omit for in-app chat turns (no API key involved). */
  keyId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  privacyTier: "private" | "confidential";
  /** "api" (default) or "chat" — see schema note on `source`. */
  source?: "api" | "chat";
  ref?: string;
}): Promise<void> {
  await db
    .insert(apiUsageEvent)
    .values({
      userId: event.userId,
      keyId: event.keyId,
      model: event.model,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      costMicros: Math.max(0, Math.round(event.costMicros)),
      privacyTier: event.privacyTier,
      source: event.source ?? "api",
      ref: event.ref,
    })
    .onConflictDoNothing({ target: apiUsageEvent.ref });
}

/** Aggregate usage by model since `sinceMs` — powers the console My-usage screen. */
export async function getApiUsageByModel(userId: string, sinceMs: number) {
  const rows = await db
    .select({
      model: apiUsageEvent.model,
      requests: count(),
      inputTokens: sum(apiUsageEvent.inputTokens),
      outputTokens: sum(apiUsageEvent.outputTokens),
      costMicros: sum(apiUsageEvent.costMicros),
    })
    .from(apiUsageEvent)
    .where(
      and(
        eq(apiUsageEvent.userId, userId),
        gte(apiUsageEvent.createdAt, new Date(sinceMs))
      )
    )
    .groupBy(apiUsageEvent.model)
    .orderBy(desc(sum(apiUsageEvent.costMicros)));
  return rows.map((r) => ({
    model: r.model,
    requests: Number(r.requests ?? 0),
    inputTokens: Number(r.inputTokens ?? 0),
    outputTokens: Number(r.outputTokens ?? 0),
    costMicros: Number(r.costMicros ?? 0),
  }));
}

// ── Private Inference API keys (SPEC_AUDRIC_API v1) ──────────────────────────

/** Persist a new API key (hash + display prefix). The plaintext secret is
 *  returned to the caller ONCE at creation and never stored. */
export async function createApiKey(entry: {
  userId: string;
  hashedKey: string;
  keyPrefix: string;
  name?: string;
}): Promise<ApiKey> {
  const [row] = await db
    .insert(apiKey)
    .values({
      userId: entry.userId,
      hashedKey: entry.hashedKey,
      keyPrefix: entry.keyPrefix,
      name: entry.name,
    })
    .returning();
  return row;
}

/** Look up a LIVE (non-revoked) key by its hash — the auth hot path. */
export async function getApiKeyByHash(
  hashedKey: string
): Promise<ApiKey | undefined> {
  const [row] = await db
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.hashedKey, hashedKey), isNull(apiKey.revokedAt)))
    .limit(1);
  return row;
}

/** A user's keys (newest first), for the settings list. Revoked included so the
 *  UI can show history; the secret is never present (only the prefix). */
export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  return await db
    .select()
    .from(apiKey)
    .where(eq(apiKey.userId, userId))
    .orderBy(desc(apiKey.createdAt));
}

/** Revoke a key (soft-delete). Scoped to the owner so a user can't revoke
 *  another's key. Returns true when a row actually flipped. */
export async function revokeApiKey(
  id: string,
  userId: string
): Promise<boolean> {
  const rows = await db
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKey.id, id),
        eq(apiKey.userId, userId),
        isNull(apiKey.revokedAt)
      )
    )
    .returning({ id: apiKey.id });
  return rows.length > 0;
}

/** Rename a key (owner-scoped). Null/empty clears the label. Returns true
 *  when a live row actually changed. */
export async function renameApiKey(
  id: string,
  userId: string,
  name: string | null
): Promise<boolean> {
  const rows = await db
    .update(apiKey)
    .set({ name })
    .where(
      and(
        eq(apiKey.id, id),
        eq(apiKey.userId, userId),
        isNull(apiKey.revokedAt)
      )
    )
    .returning({ id: apiKey.id });
  return rows.length > 0;
}

/** Best-effort "last used" stamp (fire-and-forget from the auth path). */
export async function touchApiKey(id: string): Promise<void> {
  await db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, id));
}

// ── Escrow job index (t2 ACP Phase 1 item 4 — provider inbox) ───────────────
// Written ONLY by the web-v3 event indexer; read by /v1/jobs. The chain is
// the source of truth; this is a queryable read-model.

export async function getIndexerCursor(
  name: string
): Promise<string | undefined> {
  const [row] = await db
    .select({ value: indexerCursor.value })
    .from(indexerCursor)
    .where(eq(indexerCursor.name, name))
    .limit(1);
  return row?.value;
}

export async function setIndexerCursor(
  name: string,
  value: string
): Promise<void> {
  await db
    .insert(indexerCursor)
    .values({ name, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: indexerCursor.name,
      set: { value, updatedAt: new Date() },
    });
}

/** Insert the row for a JobCreated event (idempotent — replays no-op). */
export async function insertEscrowJob(row: {
  jobId: string;
  buyer: string;
  seller: string;
  amountMicroUsdc: number;
  feeBps: number;
  rejectSplitBps: number;
  deliverByMs: number;
  reviewWindowMs: number;
  createdTxDigest: string;
  createdAtMs: number;
}): Promise<void> {
  await db
    .insert(escrowJob)
    .values({ ...row, state: "funded", updatedAtMs: row.createdAtMs })
    .onConflictDoNothing();
}

// funded → delivered → released | rejected; funded → refunded. Rank guards
// against event replays regressing a settled row.
const STATE_RANK: Record<string, number> = {
  funded: 0,
  delivered: 1,
  released: 2,
  rejected: 2,
  refunded: 2,
};

/** Apply a lifecycle transition (idempotent; ignores rank regressions). */
export async function updateEscrowJobState(
  jobId: string,
  state: "delivered" | "released" | "rejected" | "refunded",
  fields: {
    timestampMs: number;
    deliveryHash?: string;
    feeAmountMicroUsdc?: number;
    byTimeout?: boolean;
  }
): Promise<void> {
  const [current] = await db
    .select({ state: escrowJob.state })
    .from(escrowJob)
    .where(eq(escrowJob.jobId, jobId))
    .limit(1);
  if (!current) {
    return; // event for a job created before this indexer's cursor epoch
  }
  if ((STATE_RANK[state] ?? 0) <= (STATE_RANK[current.state] ?? 0)) {
    return;
  }
  await db
    .update(escrowJob)
    .set({
      state,
      updatedAtMs: fields.timestampMs,
      ...(fields.deliveryHash !== undefined && {
        deliveryHash: fields.deliveryHash,
      }),
      ...(fields.feeAmountMicroUsdc !== undefined && {
        feeAmountMicroUsdc: fields.feeAmountMicroUsdc,
      }),
      ...(fields.byTimeout !== undefined && { byTimeout: fields.byTimeout }),
    })
    .where(eq(escrowJob.jobId, jobId));
}

export async function getEscrowJob(
  jobId: string
): Promise<EscrowJob | undefined> {
  const [row] = await db
    .select()
    .from(escrowJob)
    .where(eq(escrowJob.jobId, jobId))
    .limit(1);
  return row;
}

// ── Job reviews (t2 ACP Phase 1 item 6) ─────────────────────────────────────

/** The review on one job, if any — the console prefills the buyer's edit
 *  form with it (one review per job; re-submit edits). */
export async function getJobReview(jobId: string): Promise<JobReview | null> {
  const [row] = await db
    .select()
    .from(jobReview)
    .where(eq(jobReview.jobId, jobId))
    .limit(1);
  return row ?? null;
}

/** One review per released job; re-submitting edits stars/text. */
export async function upsertJobReview(row: {
  jobId: string;
  seller: string;
  buyer: string;
  stars: number;
  text: string | null;
}): Promise<JobReview> {
  const [saved] = await db
    .insert(jobReview)
    .values(row)
    .onConflictDoUpdate({
      target: jobReview.jobId,
      set: { stars: row.stars, text: row.text, updatedAt: new Date() },
    })
    .returning();
  return saved;
}

/** A seller's reviews (newest first) + the aggregate score. */
export async function listJobReviews(
  seller: string,
  limit = 50
): Promise<{ reviews: JobReview[]; score: number | null; count: number }> {
  const [reviews, [agg]] = await Promise.all([
    db
      .select()
      .from(jobReview)
      .where(eq(jobReview.seller, seller))
      .orderBy(desc(jobReview.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100)),
    db
      .select({ avg: avg(jobReview.stars), count: count() })
      .from(jobReview)
      .where(eq(jobReview.seller, seller)),
  ]);
  const score = agg?.avg == null ? null : Number(agg.avg);
  return { reviews, score, count: agg?.count ?? 0 };
}

// ── Scan (economy dashboard) aggregates — t2 ACP Phase 2 ───────────────────
// Every number derives from the event-indexed job ledger (chain truth).

/** Rail-wide escrow totals for the stats band. */
export async function escrowEconomyStats(): Promise<{
  totalJobs: number;
  releasedJobs: number;
  settledMicroUsdc: number;
  distinctWallets: number;
}> {
  const [[agg], [wallets]] = await Promise.all([
    db
      .select({
        totalJobs: count(),
        releasedJobs: count(
          sql`CASE WHEN ${escrowJob.state} = 'released' THEN 1 END`
        ),
        settledMicroUsdc: sum(
          sql`CASE WHEN ${escrowJob.state} = 'released' THEN ${escrowJob.amountMicroUsdc} ELSE 0 END`
        ),
      })
      .from(escrowJob),
    db
      .select({ value: count() })
      .from(
        sql`(SELECT "buyer" AS w FROM "EscrowJob" UNION SELECT "seller" FROM "EscrowJob") AS wallets`
      ),
  ]);
  return {
    totalJobs: agg?.totalJobs ?? 0,
    releasedJobs: agg?.releasedJobs ?? 0,
    settledMicroUsdc: Number(agg?.settledMicroUsdc ?? 0),
    distinctWallets: wallets?.value ?? 0,
  };
}

/** Top sellers by released (settled) volume — the Scan top-agents table. */
export async function topJobSellers(limit = 10): Promise<
  {
    seller: string;
    jobs: number;
    released: number;
    concluded: number;
    settledMicroUsdc: number;
    buyers: number;
  }[]
> {
  const rows = await db
    .select({
      seller: escrowJob.seller,
      jobs: count(),
      released: count(
        sql`CASE WHEN ${escrowJob.state} = 'released' THEN 1 END`
      ),
      concluded: count(
        sql`CASE WHEN ${escrowJob.state} IN ('released', 'rejected', 'refunded') THEN 1 END`
      ),
      settledMicroUsdc: sum(
        sql`CASE WHEN ${escrowJob.state} = 'released' THEN ${escrowJob.amountMicroUsdc} ELSE 0 END`
      ),
      buyers: sql<number>`COUNT(DISTINCT ${escrowJob.buyer})`,
    })
    .from(escrowJob)
    .groupBy(escrowJob.seller)
    .orderBy(
      desc(
        sum(
          sql`CASE WHEN ${escrowJob.state} = 'released' THEN ${escrowJob.amountMicroUsdc} ELSE 0 END`
        )
      )
    )
    .limit(Math.min(Math.max(limit, 1), 50));
  return rows.map((r) => ({
    seller: r.seller,
    jobs: r.jobs,
    released: r.released,
    concluded: r.concluded,
    settledMicroUsdc: Number(r.settledMicroUsdc ?? 0),
    buyers: Number(r.buyers ?? 0),
  }));
}

/** One seller's job track record — the profile stat cards. */
export async function sellerJobStats(seller: string): Promise<{
  jobs: number;
  released: number;
  concluded: number;
  settledMicroUsdc: number;
  buyers: number;
}> {
  const [agg] = await db
    .select({
      jobs: count(),
      released: count(
        sql`CASE WHEN ${escrowJob.state} = 'released' THEN 1 END`
      ),
      concluded: count(
        sql`CASE WHEN ${escrowJob.state} IN ('released', 'rejected', 'refunded') THEN 1 END`
      ),
      settledMicroUsdc: sum(
        sql`CASE WHEN ${escrowJob.state} = 'released' THEN ${escrowJob.amountMicroUsdc} ELSE 0 END`
      ),
      buyers: sql<number>`COUNT(DISTINCT ${escrowJob.buyer})`,
    })
    .from(escrowJob)
    .where(eq(escrowJob.seller, seller));
  return {
    jobs: agg?.jobs ?? 0,
    released: agg?.released ?? 0,
    concluded: agg?.concluded ?? 0,
    settledMicroUsdc: Number(agg?.settledMicroUsdc ?? 0),
    buyers: Number(agg?.buyers ?? 0),
  };
}

/** The freshest job activity (by last state change) — the Scan live feed. */
export async function listRecentEscrowJobs(limit = 20): Promise<EscrowJob[]> {
  return await db
    .select()
    .from(escrowJob)
    .orderBy(desc(escrowJob.updatedAtMs))
    .limit(Math.min(Math.max(limit, 1), 100));
}

/** The inbox / activity query: jobs by seller and/or buyer, newest first. */
export async function listEscrowJobs(opts: {
  seller?: string;
  buyer?: string;
  state?: string;
  limit?: number;
  offset?: number;
}): Promise<{ jobs: EscrowJob[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const conditions: (SQL | undefined)[] = [];
  if (opts.seller) {
    conditions.push(eq(escrowJob.seller, opts.seller));
  }
  if (opts.buyer) {
    conditions.push(eq(escrowJob.buyer, opts.buyer));
  }
  if (opts.state) {
    conditions.push(eq(escrowJob.state, opts.state));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(escrowJob)
      .where(where)
      .orderBy(desc(escrowJob.createdAtMs))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(escrowJob).where(where),
  ]);
  return { jobs: rows, total };
}

// === Agent Capital (SPEC_ACP_SUI §6) — event-derived token read-model ===

/** Record a bind event (idempotent — one token per agent, chain-enforced). */
export async function insertAgentToken(row: {
  agent: string;
  coinType: string;
  symbol: string;
  launcher: string;
  boundAtMs: number;
  boundTxDigest: string;
}): Promise<void> {
  await db.insert(agentToken).values(row).onConflictDoNothing();
}

/** Record the finalize event (pool + 10y lock). Idempotent. */
export async function finalizeAgentToken(row: {
  agent: string;
  poolId: string;
  lockId: string;
  finalizedAtMs: number;
}): Promise<void> {
  await db
    .update(agentToken)
    .set({
      poolId: row.poolId,
      lockId: row.lockId,
      finalizedAtMs: row.finalizedAtMs,
    })
    .where(and(eq(agentToken.agent, row.agent), isNull(agentToken.finalizedAtMs)));
}

/** Record one FeesClaimed event + roll it into the agent's lifetime totals.
 *  The `FeeClaim` primary key makes replays no-ops before totals move. */
export async function recordFeeClaim(row: {
  id: string;
  lockId: string;
  agent: string;
  coinTypeA: string;
  coinTypeB: string;
  amountA: number;
  amountB: number;
  txDigest: string;
  timestampMs: number;
  /** Raw amounts mapped onto (agentSide, suiSide) by the indexer. */
  agentSideRaw: number;
  suiSideRaw: number;
}): Promise<void> {
  const { agentSideRaw, suiSideRaw, ...claim } = row;
  const inserted = await db
    .insert(feeClaim)
    .values(claim)
    .onConflictDoNothing()
    .returning({ id: feeClaim.id });
  if (inserted.length === 0) {
    return; // replay — totals already counted
  }
  await db
    .update(agentToken)
    .set({
      feesClaimedAgentRaw: sql`${agentToken.feesClaimedAgentRaw} + ${agentSideRaw}`,
      feesClaimedSuiRaw: sql`${agentToken.feesClaimedSuiRaw} + ${suiSideRaw}`,
      feeClaimCount: sql`${agentToken.feeClaimCount} + 1`,
    })
    .where(eq(agentToken.agent, row.agent));
}

export async function getAgentToken(agent: string): Promise<AgentToken | null> {
  const rows = await db
    .select()
    .from(agentToken)
    .where(eq(agentToken.agent, agent))
    .limit(1);
  return rows[0] ?? null;
}

/** Capital tab lists. `sort`: new (finalize desc) | fees (lifetime SUI-side
 *  fees desc). Only finalized tokens — a bound-but-unfinished launch is not a
 *  market. */
export async function listAgentTokens(opts: {
  sort: "new" | "fees";
  limit?: number;
}): Promise<AgentToken[]> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const order =
    opts.sort === "fees"
      ? [desc(agentToken.feesClaimedSuiRaw), desc(agentToken.finalizedAtMs)]
      : [desc(agentToken.finalizedAtMs)];
  return db
    .select()
    .from(agentToken)
    .where(isNotNull(agentToken.finalizedAtMs))
    .orderBy(...order)
    .limit(limit);
}

export async function listFeeClaims(
  agent: string,
  limit = 50
): Promise<FeeClaim[]> {
  return db
    .select()
    .from(feeClaim)
    .where(eq(feeClaim.agent, agent))
    .orderBy(desc(feeClaim.timestampMs))
    .limit(Math.min(limit, 200));
}
