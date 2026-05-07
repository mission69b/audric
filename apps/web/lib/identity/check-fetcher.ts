// ───────────────────────────────────────────────────────────────────────────
// Shared `/api/identity/check` client fetcher.
//
// Both <UsernamePicker> (signup picker) and <UsernameChangeModal>
// (settings change handle modal) hit `/api/identity/check` to drive
// their debounced live availability checks. This module is the single
// source of truth for the HTTP-status interpretation contract — keep
// the two surfaces aligned, avoid the "one file got fixed, the other
// didn't" failure mode (cf. S18-F18 where the modal silently bypassed
// the picker's debounced check).
//
// Status interpretation contract:
//
//   200 + { available: true }                 → caller renders "AVAILABLE"
//   200 + { available: false, reason: ... }   → caller renders "TAKEN" / "RESERVED" / etc.
//   503 (RPC degraded — Sui fullnode flaky)   → verifierDown: true (retry-friendly UX)
//   429 (rate-limited — fast typer or burst)  → verifierDown: true (retry-friendly UX)
//   any other non-OK status                   → throws — caller renders "// CHECK FAILED"
//
// Both 503 and 429 are mapped to `verifierDown: true` because they're
// transient + user-recoverable. The original picker-only fetcher only
// mapped 503; 429 fell through to the throw branch and rendered the
// scary "// CHECK FAILED" status. After the 2026-05-08 launch showed
// real users hitting 429s by typing fast, both surfaces now treat them
// identically — see S18-F19 in `audric-build-tracker.md`.
// ───────────────────────────────────────────────────────────────────────────

export interface IdentityCheckResult {
  available: boolean;
  /// Server-supplied reason when `available === false` (e.g. "taken",
  /// "reserved", "invalid", "too-short", "too-long"). Caller-typed.
  reason?: string;
  /// True when the server signaled transient inability to verify —
  /// either RPC degraded (HTTP 503) or rate-limited (HTTP 429). Caller
  /// renders the same retry-friendly UX in both cases.
  verifierDown?: boolean;
}

/**
 * Fetches `/api/identity/check?username=<label>` and maps the HTTP
 * response to a typed result. See the module-level contract for the
 * status-interpretation rules.
 *
 * Throws on any non-200/429/503 response so callers can surface
 * "// CHECK FAILED" for genuinely unexpected errors (the picker +
 * modal both treat thrown errors as the `'error'` UI state).
 */
export async function fetchIdentityCheck(label: string): Promise<IdentityCheckResult> {
  const res = await fetch(
    `/api/identity/check?username=${encodeURIComponent(label)}`,
    { method: 'GET' },
  );
  if (res.status === 503 || res.status === 429) {
    return { available: false, verifierDown: true };
  }
  if (!res.ok) {
    throw new Error(`identity-check ${res.status}`);
  }
  const body = (await res.json()) as { available: boolean; reason?: string };
  return { available: body.available, reason: body.reason };
}
