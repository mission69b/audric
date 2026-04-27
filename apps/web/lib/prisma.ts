import { PrismaClient } from './generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

/**
 * Vercel + Neon: use the Neon serverless WebSocket driver instead of the
 * pooled `pg` driver. Pre-v0.49 audric used `@prisma/adapter-pg` with a
 * 5-conn pool; that pool's TCP connections die quietly between Vercel's
 * lambda freeze/thaw cycles, surfacing as
 *   `DriverAdapterError: server conn crashed?`
 * inside `executeRaw` on the next thaw. Symptoms were intermittent fire-
 * and-forget Prisma write failures (logConversationTurn, session-state
 * upserts, etc.) with no user-facing impact but considerable log noise.
 *
 * The Neon adapter is the canonical fix — each query opens a fresh
 * stateless WebSocket from the lambda, no pool to maintain, no dead
 * connections to revive. The connection string format is identical
 * (DATABASE_URL still points to `*.neon.tech`); only the runtime driver
 * changes. `prisma migrate` continues to use the standard DATABASE_URL
 * via `prisma.config.ts` and is unaffected.
 *
 * Reference: https://www.prisma.io/docs/orm/overview/databases/neon
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createClient(): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = createClient();
}

export const prisma = globalForPrisma.prisma;

// ---------------------------------------------------------------------------
// Transient-error retry helper
// ---------------------------------------------------------------------------

/**
 * Detects Prisma / driver errors that are safe to retry. We only match
 * connection-level failures (driver crashed, socket timeout, etc.) — never
 * client-side validation errors or constraint violations. The list mirrors
 * the substrings observed in our Vercel logs across the @prisma/adapter-pg
 * → @prisma/adapter-neon migration window.
 */
function isTransientPrismaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = `${err.message} ${(err as { cause?: unknown }).cause instanceof Error ? (err as { cause: Error }).cause.message : ''}`;
  return (
    /server conn crashed/i.test(msg) ||
    /connection terminated/i.test(msg) ||
    /ECONNRESET/i.test(msg) ||
    /ETIMEDOUT/i.test(msg) ||
    /websocket.*close/i.test(msg) ||
    /socket hang up/i.test(msg) ||
    /Engine is not yet connected/i.test(msg)
  );
}

/**
 * Retries a Prisma operation up to 3 attempts with exponential backoff
 * (50ms, 150ms, 350ms) on transient driver errors. Use for fire-and-
 * forget writes where the failure mode is "noisy log + lost row" rather
 * than user-visible. Non-transient errors (validation, unique constraint,
 * etc.) re-throw on the first attempt.
 *
 * Should NOT be used inside a request critical path that already has its
 * own retry/timeout policy — this is specifically a safety net for
 * background writes that escape the request lifecycle.
 */
export async function withPrismaRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; label?: string } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isTransientPrismaError(err)) {
        throw err;
      }
      const backoff = 50 * Math.pow(3, i); // 50, 150, 450
      await new Promise((r) => setTimeout(r, backoff));
      console.warn(
        `[prisma-retry${opts.label ? `:${opts.label}` : ''}] transient error attempt ${i + 1}/${attempts} — retrying in ${backoff}ms:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  throw lastErr;
}
