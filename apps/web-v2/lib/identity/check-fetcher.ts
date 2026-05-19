/**
 * `/api/identity/check` client fetcher — web-v2 port.
 *
 * Ported from `apps/web/lib/identity/check-fetcher.ts` with one diff:
 * the URL goes through `audricWebUrl()` so it resolves to apps/web's
 * route (cross-origin pre-cutover via `NEXT_PUBLIC_AUDRIC_WEB_URL`,
 * same-origin post-cutover via Vercel rewrites).
 *
 * The status-interpretation contract is verbatim from legacy:
 *   200 + { available: true }  → caller renders "AVAILABLE"
 *   200 + { available: false } → caller renders "TAKEN" etc.
 *   503 or 429                 → verifierDown: true (retry-friendly)
 *   any other non-OK           → throws → caller renders "CHECK FAILED"
 */

import { audricWebUrl } from "@/lib/audric-web-url";

export interface IdentityCheckResult {
  available: boolean;
  reason?: string;
  verifierDown?: boolean;
}

export async function fetchIdentityCheck(
  label: string
): Promise<IdentityCheckResult> {
  const res = await fetch(
    audricWebUrl(`/api/identity/check?username=${encodeURIComponent(label)}`),
    { method: "GET" }
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
