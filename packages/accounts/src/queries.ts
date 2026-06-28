import "server-only";

import { and, desc, eq, isNull, sum } from "drizzle-orm";
import { db } from "./db";
import { type ApiKey, apiKey, creditLedger, type User, user } from "./schema";

// ── Identity ─────────────────────────────────────────────────────────────────

export async function getUserById(id: string): Promise<User | undefined> {
  const [row] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  return row;
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

/** Best-effort "last used" stamp (fire-and-forget from the auth path). */
export async function touchApiKey(id: string): Promise<void> {
  await db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, id));
}
