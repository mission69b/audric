/**
 * [v1.4 — B1 / B2] User financial context cache helpers.
 *
 * Day 4 shipped the invalidation half of this module
 * (`invalidateUserFinancialContext`) so the resume-route post-write
 * block could clear the cache before the cron writer existed. Day 5
 * adds the read-and-cache half (`getUserFinancialContext`) plus the
 * `FinancialContextSnapshot` wire-shape consumed by
 * `engine-context.ts:buildDynamicBlock`.
 *
 * Cache key:
 *   `fin_ctx:${address}` — keyed on the Sui wallet address rather than
 *   the cuid `userId`. The address is universally available across the
 *   chat route, resume route, and engine-factory boot path without a
 *   DB lookup; the `userId` is not. See v1.4 — B1 and B2 in the spec
 *   for the full justification.
 *
 * TTL:
 *   24 hours — matches the daily cron cadence so a Redis miss after a
 *   missed invalidation falls through to Prisma at most once per user
 *   per day. Refreshed on every cache write.
 *
 * Failure mode:
 *   Fail-open on every error. The cached snapshot is a *latency
 *   optimisation*, not a correctness gate; if Redis is unreachable
 *   we degrade to a direct Prisma read, and if Prisma is unreachable
 *   we return `null` (engine boot then skips the `<financial_context>`
 *   block — the agent still works, just without orientation context).
 *   Errors surface to console.warn without propagating; instrumentation
 *   must never block a chat response.
 */

import { redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';

const PREFIX = 'fin_ctx:';
const TTL_SECONDS = 24 * 60 * 60;

function key(address: string): string {
  return `${PREFIX}${address}`;
}

/**
 * Wire shape of the orientation snapshot consumed by the engine system
 * prompt. Keep aligned with `prisma.userFinancialContext` columns
 * minus the dual-key (`userId` / `address`) and audit columns
 * (`generatedAt` / `updatedAt`).
 */
export interface FinancialContextSnapshot {
  savingsUsdc: number;
  debtUsdc: number;
  walletUsdc: number;
  healthFactor: number | null;
  currentApy: number | null;
  recentActivity: string;
  openGoals: string[];
  pendingAdvice: string | null;
  daysSinceLastSession: number;
}

/**
 * Read-through cache lookup for the daily orientation snapshot.
 *
 *   1. Try Redis (`fin_ctx:${address}`). Hit → return parsed snapshot.
 *   2. Miss → look up `UserFinancialContext` by `address` in Prisma.
 *   3. Found → cache for 24h, return.
 *   4. Not found → return `null`. The engine-context layer treats
 *      `null` as "skip the section" so brand-new users (whose first
 *      cron tick hasn't run yet) just get a system prompt without
 *      orientation block — no error, no empty-string block.
 *
 * Errors at any layer fall through to the next-best result without
 * throwing. A Redis read miss returns `null` from `redis.get`, which
 * is correctly treated as a cache miss.
 */
export async function getUserFinancialContext(
  address: string,
): Promise<FinancialContextSnapshot | null> {
  if (!address) return null;

  let cached: FinancialContextSnapshot | null = null;
  try {
    cached = await redis.get<FinancialContextSnapshot>(key(address));
  } catch (err) {
    console.warn(
      '[fin_ctx] getUserFinancialContext cache read failed (fail-open):',
      err,
    );
  }
  if (cached) return cached;

  let row: Awaited<ReturnType<typeof prisma.userFinancialContext.findUnique>> = null;
  try {
    row = await prisma.userFinancialContext.findUnique({
      where: { address },
    });
  } catch (err) {
    console.warn(
      '[fin_ctx] getUserFinancialContext db read failed (fail-open):',
      err,
    );
    return null;
  }
  if (!row) return null;

  const snapshot: FinancialContextSnapshot = {
    savingsUsdc: row.savingsUsdc,
    debtUsdc: row.debtUsdc,
    walletUsdc: row.walletUsdc,
    healthFactor: row.healthFactor,
    currentApy: row.currentApy,
    recentActivity: row.recentActivity,
    openGoals: Array.isArray(row.openGoals)
      ? (row.openGoals as unknown[]).filter(
          (g): g is string => typeof g === 'string',
        )
      : [],
    pendingAdvice: row.pendingAdvice,
    daysSinceLastSession: row.daysSinceLastSession,
  };

  try {
    await redis.set(key(address), snapshot, { ex: TTL_SECONDS });
  } catch (err) {
    console.warn(
      '[fin_ctx] getUserFinancialContext cache write failed (fail-open):',
      err,
    );
  }

  return snapshot;
}

/**
 * Drop the cached `UserFinancialContext` snapshot for `address`. Call
 * after any mutating action (write tool, manual on-chain TX) so the
 * very next chat turn sees a fresh balance instead of a 24h-old
 * cron-written snapshot.
 *
 * Idempotent + fail-open. A `DEL` on a missing key is a no-op in
 * Upstash Redis; transport errors surface to console.warn without
 * propagating.
 */
export async function invalidateUserFinancialContext(
  address: string,
): Promise<void> {
  if (!address) return;
  try {
    await redis.del(key(address));
  } catch (err) {
    console.warn(
      '[fin_ctx] invalidateUserFinancialContext failed (fail-open):',
      err,
    );
  }
}
