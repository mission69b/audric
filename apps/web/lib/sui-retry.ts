/**
 * Retry helper for transient Sui RPC + SuiNS errors.
 *
 * Sibling to `lib/prisma.ts`'s `withPrismaRetry()` — same shape, different
 * transient-error matcher. Use anywhere a server-side write or read against
 * Sui RPC / SuiNS could be wedged by a sub-second 429, validator-side stale-
 * version contention on a shared object, or a network blip.
 *
 * ## Why this exists (S18-F6 / vercel-logs L1+L2+L3+L4 — May 2026)
 *
 * `/api/identity/reserve` saw 62 of 73 actual error responses across a 12h
 * production window — entirely from `signAndExecuteTransaction` (34× Sui RPC
 * 429, 7× shared-object stale-version, 2× shared-object locked) and the
 * SuiNS pre-mint check (18× 429). All are transient: Sui RPC backs off
 * within 100–500ms, shared object versions advance every checkpoint
 * (~250ms), and SuiNS rate limits ease within 1s. None had retry logic →
 * each transient blip wedged a real user's username claim.
 *
 * The Sui audric registry (`0x07045…0198`) is a single shared object that
 * every leaf-mint mutates. Under concurrent claims, validators emit:
 *   - "Transaction needs to be rebuilt because object X version Y is
 *      unavailable for consumption, current version: Z"
 *   - "Object (X, SequenceNumber(Y), o#Z) already locked by a different
 *      transaction"
 *
 * Both are recoverable by re-running with a freshly-built transaction. The
 * `signAndExecuteTransaction` SDK call already tx-builds against the latest
 * RPC view on each invocation, so simply calling it again after a small
 * backoff is sufficient — no need for the caller to manually `tx.build()`.
 *
 * ## Why we don't use the Prisma helper directly
 *
 * `withPrismaRetry()` matches Prisma error codes (`P1001` etc.) and Postgres
 * driver strings — none apply here. The transient surface for Sui is
 * disjoint, so a separate matcher keeps both helpers focused.
 *
 * ## Backoff schedule
 *
 * 50ms → 250ms → 1250ms (factor of 5). Tuned for:
 *   - Sub-second Sui RPC rate-limit windows (50ms first attempt clears
 *     most clusters)
 *   - Sui checkpoint cadence (~250ms — second attempt almost always lands
 *     on a fresh shared-object version)
 *   - Worst-case SuiNS rate-limit recovery (~1s)
 *
 * Total worst-case latency added to a request:
 *   - 1 attempt + fail + 50ms + 1 attempt + fail + 250ms + 1 attempt = ~3 attempts
 *     in 300ms; if all fail → original error rethrown.
 *
 * ## What this is NOT
 *
 * - Not for client-side use (no AbortController plumbing).
 * - Not for retrying validation errors / 4xx user-input errors — only for
 *   transient infra errors. The matcher (`isTransientSuiError`) deliberately
 *   excludes anything that won't be different on retry.
 * - Not for sponsored-transaction routes (those go through Enoki, which has
 *   its own retry/backoff inside the Enoki client).
 */

// [S18-F17 — May 2026] Bumped from 3 → 5 attempts with longer backoffs.
// 3 attempts × (50ms + 250ms + 1250ms) = 1.55s of patience was insufficient
// under burst load: the May 7 burst-50 test (25 concurrent mints) showed
// 8/50 wallets still hitting "Transaction needs to be rebuilt" after the
// S18-F16 in-closure rebuild fix. Sui shared-object contention can take
// seconds to drain when 25 transactions race for the same registry — the
// SDK rebuilds correctly each attempt, but the new build STILL races
// against the next batch of concurrent mints in the same checkpoint window.
//
// New schedule: attempt → 250ms → 1s → 3s → 5s → attempt = 5 attempts
// over ~9.25s of patience + ~5×2s execution time = ~20s max per mint.
// Bounded by Vercel's 60s function timeout with comfortable headroom.
const DEFAULT_ATTEMPTS = 5;
const BACKOFF_MS = [250, 1000, 3000, 5000]; // backoff[i] is between attempt i and attempt i+1

/**
 * Returns true if the error is a transient Sui RPC / SuiNS / shared-object
 * failure that's likely to succeed on a retry within ~1 second.
 *
 * Conservative by design — false positives waste up to ~1.3s per request,
 * false negatives turn into a user-facing 502/503. We optimize for the
 * latter (slightly slower happy path, much fewer onboarding failures).
 */
export function isTransientSuiError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  const msg = `${err.message} ${(err as { cause?: unknown }).cause instanceof Error ? (err as { cause: Error }).cause.message : ''}`;

  return (
    /Unexpected status code: 429/i.test(msg) ||
    /HTTP 429/i.test(msg) ||
    /Too Many Requests/i.test(msg) ||
    /Transaction needs to be rebuilt/i.test(msg) ||
    /already locked by a different transaction/i.test(msg) ||
    // [S18-F17] Validator rejection on equivocation detection. When two
    // concurrent transactions reference the same shared object at the same
    // version, validators reject one as a double-spend candidate. The fix
    // is identical to stale-version: rebuild against the new chain view
    // and resubmit. Empirically observed: 9/50 burst-50 failures = this.
    /Transaction is rejected as invalid by more than 1\/3 of validators/i.test(msg) ||
    /equivocated/i.test(msg) ||
    /ECONNRESET/i.test(msg) ||
    /ETIMEDOUT/i.test(msg) ||
    /EPIPE/i.test(msg) ||
    /HeadersTimeoutError/i.test(msg) ||
    /UND_ERR_HEADERS_TIMEOUT/i.test(msg) ||
    /fetch failed/i.test(msg)
  );
}

/**
 * Retry an async function up to `attempts` times with exponential backoff
 * (50ms, 250ms, 1250ms — factor of 5) on transient Sui errors.
 *
 * @param fn      The async function to retry. Re-invoked from scratch on
 *                each attempt — pass a closure that re-builds any per-call
 *                state if needed.
 * @param opts.attempts  Total attempts including the first. Default 3.
 * @param opts.label     Diagnostic label used in console.warn on retry.
 *                       Should include the surface (e.g. `'reserve:mint'`)
 *                       to make Vercel log triage easy.
 */
export async function withSuiRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; label?: string } = {},
): Promise<T> {
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS;
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isTransientSuiError(err)) {
        throw err;
      }
      // Use the explicit BACKOFF_MS table; if attempts is bumped beyond
      // the table size, fall back to the last value.
      const backoff = BACKOFF_MS[Math.min(i, BACKOFF_MS.length - 1)];
      console.warn(
        `[sui-retry${opts.label ? `:${opts.label}` : ''}] transient error attempt ${i + 1}/${attempts} — retrying in ${backoff}ms:`,
        err instanceof Error ? err.message : err,
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw lastErr;
}
