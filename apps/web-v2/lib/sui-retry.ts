import { getTelemetrySink } from "@t2000/engine";

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
 * ## Backoff schedule
 *
 * Attempt → 250ms → 1s → 3s → 5s → attempt = 5 attempts over ~9.25s of
 * patience + ~5×2s execution time = ~20s max per mint. Bounded by Vercel's
 * 60s function timeout with comfortable headroom.
 *
 * ## What this is NOT
 *
 * - Not for client-side use (no AbortController plumbing).
 * - Not for retrying validation errors / 4xx user-input errors — only for
 *   transient infra errors. The matcher (`isTransientSuiError`) deliberately
 *   excludes anything that won't be different on retry.
 * - Not for sponsored-transaction routes (those go through Enoki, which has
 *   its own retry/backoff inside the Enoki client).
 *
 * [v0.7e Phase 2 / S.253 — 2026-05-22] Verbatim port from
 * apps/web/lib/sui-retry.ts during the API-route consolidation.
 */

// [S18-F17 — May 2026] Bumped from 3 → 5 attempts with longer backoffs.
const DEFAULT_ATTEMPTS = 5;
const BACKOFF_MS = [250, 1000, 3000, 5000]; // backoff[i] is between attempt i and attempt i+1

/**
 * [SPEC 19 Phase F / S.135 — 2026-05-09] Unified retry telemetry.
 *
 * Emits `external.retry_count` with `vendor=sui`. Discriminator is
 * `attempt > 0` (= retries actually happened), not success. Symmetric to
 * BV (`vendor=bv`) and Anthropic (`vendor=anthropic`) so ops dashboards
 * can sum across vendors meaningfully.
 *
 * Defensive: telemetry must never break the retry path, wrapped in try/catch.
 */
function emitTerminalRetry(attemptZeroIndexed: number, success: boolean): void {
  const retried = attemptZeroIndexed > 0;
  const outcome = retried
    ? success
      ? "retried_success"
      : "exhausted"
    : "first_try";
  try {
    getTelemetrySink().counter("external.retry_count", {
      vendor: "sui",
      outcome,
      attempts: String(attemptZeroIndexed + 1),
    });
  } catch {
    // Telemetry failure must not break the retry helper.
  }
}

/**
 * Returns true if the error is a transient Sui RPC / SuiNS / shared-object
 * failure that's likely to succeed on a retry within ~1 second.
 *
 * Conservative by design — false positives waste up to ~1.3s per request,
 * false negatives turn into a user-facing 502/503. We optimize for the
 * latter (slightly slower happy path, much fewer onboarding failures).
 */
export function isTransientSuiError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }

  const msg = `${err.message} ${(err as { cause?: unknown }).cause instanceof Error ? (err as { cause: Error }).cause.message : ""}`;

  return (
    /Unexpected status code: 429/i.test(msg) ||
    /HTTP 429/i.test(msg) ||
    /Too Many Requests/i.test(msg) ||
    /Transaction needs to be rebuilt/i.test(msg) ||
    /already locked by a different transaction/i.test(msg) ||
    /Transaction is rejected as invalid by more than 1\/3 of validators/i.test(
      msg
    ) ||
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
 * on transient Sui errors.
 *
 * @param fn      The async function to retry. Re-invoked from scratch on
 *                each attempt — pass a closure that re-builds any per-call
 *                state if needed.
 * @param opts.attempts  Total attempts including the first. Default 5.
 * @param opts.label     Diagnostic label used in console.warn on retry.
 *                       Should include the surface (e.g. `'reserve:mint'`)
 *                       to make Vercel log triage easy.
 */
export async function withSuiRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; label?: string } = {}
): Promise<T> {
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS;
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      const result = await fn();
      emitTerminalRetry(i, true);
      return result;
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isTransientSuiError(err)) {
        emitTerminalRetry(i, false);
        throw err;
      }
      const backoff = BACKOFF_MS[Math.min(i, BACKOFF_MS.length - 1)];
      console.warn(
        `[sui-retry${opts.label ? `:${opts.label}` : ""}] transient error attempt ${i + 1}/${attempts} — retrying in ${backoff}ms:`,
        err instanceof Error ? err.message : err
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw lastErr;
}
