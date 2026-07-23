/**
 * Resolve a `?limit=` query param to a page size.
 *
 * Extracted so it is unit-testable without importing an `+api` route (those pull in
 * the Sui SDK). The subtle case this guards, per AUDIT-2026-07-20.md #6: a MISSING
 * param yields `Number(null) === 0`, which is finite — testing only `isFinite` sent
 * the default case down the clamp branch and returned a single row.
 *
 * Anything absent, zero, negative, or non-numeric falls back to `fallback`.
 */
export function resolveLimit(
  raw: string | null,
  fallback: number,
  max: number
): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
}
